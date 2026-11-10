import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCommand } from "@actspace/subagent";
import { CODEX_NOT_FOUND, codexConfig, createCodexBackend, DEFAULT_CODEX_CONFIG } from "../backend.js";
import { manifest } from "../manifest.js";

// S5：Codex 后端（设计 04 §3.1）。假 `codex app-server` 按 FAKE_MODE 写死 JSON-RPC 输出，不调真实 CLI。
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

const FAKE_CODEX = String.raw`
const { appendFileSync, writeFileSync } = require("node:fs");
const { createInterface } = require("node:readline");
const mode = process.env.FAKE_MODE, log = process.env.FAKE_LOG, trace = process.env.FAKE_TRACE;
const send = message => process.stdout.write(JSON.stringify(message) + "\n");
const note = line => appendFileSync(trace, line + "\n");
note("argv " + process.argv.slice(2).join(" ") + " cwd " + process.cwd());
if (mode === "crash") { process.stderr.write("warning: noise\nError: codex app-server failed to load config\n"); process.exit(3); }
let turnId = "turn-1";
createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  note("<- " + (message.method ?? ("reply " + message.id + (message.error ? " error " + message.error.code : ""))));
  if (message.method === "initialize") send({ id: message.id, result: { userAgent: "fake" } });
  else if (message.method === "account/read") send({ id: message.id, result: mode === "logged-out" ? { account: null, requiresOpenaiAuth: true } : { account: { type: "chatgpt" }, requiresOpenaiAuth: true } });
  else if (message.method === "thread/start") { note("thread " + JSON.stringify(message.params)); send({ id: message.id, result: { thread: { id: "thread-1", path: log } } }); }
  else if (message.method === "turn/start") {
    note("turn " + JSON.stringify(message.params.input));
    writeFileSync(log, "{}\n");
    send({ id: message.id, result: { turn: { id: turnId, status: "inProgress" } } });
    // An approval request: a subagent refuses it.
    send({ id: "approval-1", method: "item/commandExecution/requestApproval", params: {} });
    send({ method: "item/completed", params: { item: { type: "agentMessage", text: "thinking out loud" } } });
    if (mode === "success") {
      send({ method: "item/completed", params: { item: { type: "agentMessage", text: "subagent, subagent-codex" } } });
      setTimeout(() => send({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: turnId, status: "completed", error: null } } }), 20);
    } else if (mode === "fail") {
      send({ method: "error", params: { error: { message: "stream disconnected" }, willRetry: true } });
      send({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: turnId, status: "failed", error: { message: "unexpected status 401 Unauthorized\nbody" } } } });
    }
  } else if (message.method === "turn/interrupt") {
    note("interrupt " + JSON.stringify(message.params));
    if (mode === "stubborn") return;
    send({ id: message.id, result: {} });
    send({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: turnId, status: "interrupted", error: null } } });
  }
});
process.on("SIGTERM", () => { note("sigterm"); if (mode !== "stubborn") process.exit(0); });
`;

async function fakeCodex(mode: string) {
  const dir = await mkdtemp(join(tmpdir(), "fake-codex-")); roots.push(dir);
  const command = join(dir, "codex"), log = join(dir, "rollout-thread-1.jsonl"), trace = join(dir, "trace.txt");
  await writeFile(command, `#!${process.execPath}\n${FAKE_CODEX}`); await chmod(command, 0o755); await writeFile(trace, "");
  const backend = createCodexBackend({ command: async () => command, env: { ...process.env, FAKE_MODE: mode, FAKE_LOG: log, FAKE_TRACE: trace }, stopGraceMs: 300 });
  return { dir, backend, log, trace: async () => (await readFile(trace, "utf8")).split("\n").filter(Boolean) };
}
const start = (backend: ReturnType<typeof createCodexBackend>, cwd: string, model?: string) => backend.start({ prompt: "List the packages.", cwd, ...(model ? { model } : {}), signal: new AbortController().signal });

describe("Codex backend", () => {
  it("starts a non-ephemeral thread, refuses server requests and returns the last agent message", async () => {
    const fake = await fakeCodex("success");
    const run = await start(fake.backend, fake.dir, "gpt-5.5");
    expect(run.transcriptPath).toBe(fake.log);
    expect(await run.result).toEqual({ status: "completed", text: "subagent, subagent-codex" });
    expect(existsSync(fake.log)).toBe(true);
    const trace = await fake.trace();
    expect(trace[0]).toMatch(/^argv app-server cwd /);
    expect(trace.filter(line => line.startsWith("<- ")).slice(0, 5)).toEqual(["<- initialize", "<- initialized", "<- account/read", "<- thread/start", "<- turn/start"]);
    expect(JSON.parse(trace.find(line => line.startsWith("thread "))!.slice(7))).toEqual({ cwd: fake.dir, approvalPolicy: "never", sandbox: "workspace-write", model: "gpt-5.5", ephemeral: false });
    expect(JSON.parse(trace.find(line => line.startsWith("turn "))!.slice(5))).toEqual([{ type: "text", text: "List the packages.", text_elements: [] }]);
    expect(trace).toContain("<- reply approval-1 error -32601");
  });

  it("reports a failed turn with the error's first line", async () => {
    const fake = await fakeCodex("fail");
    expect(await (await start(fake.backend, fake.dir)).result).toEqual({ status: "failed", text: "thinking out loud", error: "unexpected status 401 Unauthorized" });
  });

  it("interrupts the turn, and kills a server that ignores the interrupt", async () => {
    const polite = await fakeCodex("hang");
    const run = await start(polite.backend, polite.dir);
    await run.interrupt();
    expect(await run.result).toEqual({ status: "interrupted", text: "thinking out loud" });
    expect((await polite.trace()).some(line => line.startsWith("interrupt {\"threadId\":\"thread-1\",\"turnId\":\"turn-1\"}"))).toBe(true);

    const stubborn = await fakeCodex("stubborn");
    const stuck = await start(stubborn.backend, stubborn.dir);
    const began = Date.now();
    await stuck.interrupt();
    expect(await stuck.result).toEqual({ status: "interrupted", text: "thinking out loud" });
    // Waited for the turn, then SIGTERM, then SIGKILL.
    expect(Date.now() - began).toBeGreaterThanOrEqual(500);
    expect(await stubborn.trace()).toContain("sigterm");
  });

  it("refuses to start when Codex is not logged in or the server dies", async () => {
    const loggedOut = await fakeCodex("logged-out");
    await expect(start(loggedOut.backend, loggedOut.dir)).rejects.toThrow("Codex is not logged in. Run codex login in a terminal.");
    const crash = await fakeCodex("crash");
    await expect(start(crash.backend, crash.dir)).rejects.toThrow("Error: codex app-server failed to load config");
  });

  it("is unavailable without a codex command, and keeps settings within the allowed values", async () => {
    const missing = createCodexBackend({ command: async () => undefined });
    expect(await missing.available()).toEqual({ ok: false, reason: CODEX_NOT_FOUND });
    expect(CODEX_NOT_FOUND).toBe("本机没有找到 codex 命令");
    await expect(missing.start({ prompt: "x", cwd: tmpdir(), signal: new AbortController().signal })).rejects.toThrow(CODEX_NOT_FOUND);
    expect(codexConfig({ approvalPolicy: "on-request", sandbox: "read-only" })).toEqual({ approvalPolicy: "on-request", sandbox: "read-only" });
    expect(codexConfig({ approvalPolicy: "always", sandbox: 3 })).toEqual(DEFAULT_CODEX_CONFIG);
    expect(await resolveCommand("actspace-no-such-command-xyz")).toBeUndefined();
    expect(await resolveCommand("bad;name")).toBeUndefined();
    expect(await resolveCommand("sh")).toMatch(/^\/.*\/sh$/);
  });

  it("is an optional plugin, off by default, with the design's settings", () => {
    const behavior = manifest.behaviors[0];
    expect(manifest.display).toMatchObject({ scope: "session", defaultEnabled: false, canDisable: true });
    expect(behavior).toMatchObject({ required: false, config: { approvalPolicy: "never", sandbox: "workspace-write" }, host: { required: ["process"] } });
  });
});
