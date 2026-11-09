import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLAUDE_NOT_FOUND, claudeCodeConfig, claudeTranscriptPath, createClaudeCodeBackend, encodeClaudeProjectPath } from "../backend.js";
import { manifest } from "../manifest.js";

// S5：Claude Code 后端（设计 04 §3.2）。假 `claude` 读 stdin、按 FAKE_MODE 写死 stream-json，不调真实 CLI。
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

const FAKE_CLAUDE = String.raw`
const { writeFileSync, appendFileSync } = require("node:fs");
const mode = process.env.FAKE_MODE, trace = process.env.FAKE_TRACE;
const line = message => process.stdout.write(JSON.stringify(message) + "\n");
let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  writeFileSync(trace, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), input }) + "\n");
  line({ type: "system", subtype: "init" });
  line({ type: "assistant", message: { content: [{ type: "text", text: "Looking at packages." }] } });
  if (mode === "success") line({ type: "result", subtype: "success", is_error: false, result: "Three packages." });
  else if (mode === "error") line({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login\nmore" });
  else if (mode === "crash") { process.stderr.write("Error: invalid --permission-mode\n"); process.exit(2); }
  else if (mode === "hang") { process.on("SIGTERM", () => { appendFileSync(trace, "sigterm\n"); process.exit(143); }); appendFileSync(trace, "ready\n"); setInterval(() => undefined, 1000); }
});
`;

async function fakeClaude(mode: string, permissionMode?: string) {
  const dir = await mkdtemp(join(tmpdir(), "fake-claude-")); roots.push(dir);
  const command = join(dir, "claude"), trace = join(dir, "trace.json"), configDir = join(dir, "config"), cwd = join(dir, "work.space");
  await mkdir(cwd);
  await writeFile(command, `#!${process.execPath}\n${FAKE_CLAUDE}`); await chmod(command, 0o755);
  const backend = createClaudeCodeBackend({ command: async () => command, env: { ...process.env, FAKE_MODE: mode, FAKE_TRACE: trace, CLAUDE_CONFIG_DIR: configDir }, stopGraceMs: 300, ...(permissionMode ? { config: claudeCodeConfig({ permissionMode }) } : {}) });
  return { dir, cwd, configDir, backend, trace: async () => JSON.parse((await readFile(trace, "utf8")).split("\n")[0]) as { argv: string[]; cwd: string; input: string } };
}
const start = (backend: ReturnType<typeof createClaudeCodeBackend>, cwd: string, model?: string) => backend.start({ prompt: "List the packages.", cwd, ...(model ? { model } : {}), signal: new AbortController().signal });

describe("Claude Code backend", () => {
  it("chooses the session id, so the record path is known before it starts, and returns the result", async () => {
    const fake = await fakeClaude("success");
    const run = await start(fake.backend, fake.cwd, "sonnet");
    expect(await run.result).toEqual({ status: "completed", text: "Three packages." });
    const { argv, cwd, input } = await fake.trace();
    const sessionId = argv[argv.indexOf("--session-id") + 1];
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(argv).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--session-id", sessionId, "--permission-mode", "dontAsk", "--model", "sonnet"]);
    expect(input).toBe("List the packages.");
    expect(realpathSync(cwd)).toBe(realpathSync(fake.cwd));
    expect(run.transcriptPath).toBe(join(fake.configDir, "projects", encodeClaudeProjectPath(fake.cwd), `${sessionId}.jsonl`));
  });

  it("fails with the result's first line, or with the CLI's last stderr line when it exits without one", async () => {
    const error = await fakeClaude("error", "acceptEdits");
    expect(await (await start(error.backend, error.cwd)).result).toEqual({ status: "failed", text: "Not logged in · Please run /login\nmore", error: "Not logged in · Please run /login" });
    expect((await error.trace()).argv).toContain("acceptEdits");
    const crash = await fakeClaude("crash");
    expect(await (await start(crash.backend, crash.cwd)).result).toEqual({ status: "failed", text: "Looking at packages.", error: "Error: invalid --permission-mode" });
  });

  it("stops with SIGTERM", async () => {
    const fake = await fakeClaude("hang");
    const run = await start(fake.backend, fake.cwd);
    // Interrupt once the fake has written its message and installed its SIGTERM handler.
    const deadline = Date.now() + 10_000;
    while (!(await readFile(join(fake.dir, "trace.json"), "utf8").catch(() => "")).includes("ready\n")) {
      if (Date.now() > deadline) throw new Error("fake claude did not start");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await run.interrupt();
    expect(await run.result).toEqual({ status: "interrupted", text: "Looking at packages." });
    expect(await readFile(join(fake.dir, "trace.json"), "utf8")).toContain("sigterm");
  });

  it("encodes the project directory like Claude Code", () => {
    expect(encodeClaudeProjectPath("/no/such/dir/a.b_c")).toBe("-no-such-dir-a-b-c");
    // Checked against a real run: /tmp resolves to /private/tmp first.
    expect(encodeClaudeProjectPath("/tmp")).toBe(realpathSync("/tmp").replace(/[^a-zA-Z0-9]/g, "-"));
    expect(claudeTranscriptPath("/no/such/dir", "s1", { HOME: "/home/me" })).toMatch(/\/\.claude\/projects\/-no-such-dir\/s1\.jsonl$/);
    expect(claudeTranscriptPath("/no/such/dir", "s1", { CLAUDE_CONFIG_DIR: "/cfg" })).toBe("/cfg/projects/-no-such-dir/s1.jsonl");
  });

  it("is unavailable without a claude command and keeps settings within the allowed values", async () => {
    const missing = createClaudeCodeBackend({ command: async () => undefined });
    expect(await missing.available()).toEqual({ ok: false, reason: "本机没有找到 claude 命令" });
    await expect(missing.start({ prompt: "x", cwd: tmpdir(), signal: new AbortController().signal })).rejects.toThrow(CLAUDE_NOT_FOUND);
    expect(claudeCodeConfig({ permissionMode: "ask-everything" })).toEqual({ permissionMode: "dontAsk" });
    expect(manifest.display).toMatchObject({ scope: "session", defaultEnabled: false, canDisable: true });
    expect(manifest.behaviors[0]).toMatchObject({ required: false, config: { permissionMode: "dontAsk" }, host: { required: ["process"] } });
  });
});
