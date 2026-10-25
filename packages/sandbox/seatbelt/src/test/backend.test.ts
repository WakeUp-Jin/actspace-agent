import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeSandboxHostPort, createSandboxService, resolvePolicy, sandboxTemplate, type SandboxRequest } from "@actspace/sandbox";
import { buildSeatbeltProfile, createSeatbeltBackend, sbplString } from "../backend.js";

const template = sandboxTemplate("tool", { homeDir: "/Users/agent", platform: "darwin" })!;
const base = (overrides: Partial<SandboxRequest> = {}): SandboxRequest => ({ purpose: "tool", isolation: "sandboxed", argv: ["/bin/zsh", "-lc", "true"], cwd: "/work", env: {}, scratchDir: "/scratch", filesystem: { readWrite: ["/work", "/scratch"] }, ...overrides });

describe("seatbelt profile", () => {
  it("keeps the existing rule shape and derives paths from the policy", async () => {
    const resolved = await resolvePolicy(base(), template);
    if (!resolved.ok) throw new Error(resolved.reasons.join());
    const lines = buildSeatbeltProfile(resolved.policy).split("\n");
    expect(lines.slice(0, 10)).toEqual(["(version 1)", "(deny default)", "(allow process*)", "(allow signal)", "(allow network*)", "(allow sysctl-read)", "(allow mach-lookup)", "(allow ipc-posix*)", "(allow file-ioctl)", "(allow file-read*)"]);
    expect(lines[10]).toMatch(/^\(deny file-read\* .*\(subpath "\/Users\/agent\/\.ssh"\)/);
    expect(lines[11]).toBe('(allow file-write* (subpath "/scratch") (subpath "/work") (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))');
    expect(lines[12]).toBe('(deny file-write* (subpath "/scratch/.git/config") (subpath "/scratch/.git/hooks") (subpath "/work/.git/config") (subpath "/work/.git/hooks"))');
  });

  it("drops the network allowance when blocked and escapes strings", async () => {
    const resolved = await resolvePolicy(base({ network: { mode: "blocked" } }), template);
    if (!resolved.ok) throw new Error(resolved.reasons.join());
    expect(buildSeatbeltProfile(resolved.policy)).not.toContain("network");
    expect(sbplString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it("is unavailable off macOS", async () => {
    const host = { ...createNodeSandboxHostPort(), platform: "linux" as const };
    expect(await createSeatbeltBackend(host).probe()).toEqual({ available: false, reason: "sandbox-exec is macOS only." });
  });
});

describe.skipIf(process.platform !== "darwin")("seatbelt enforcement", () => {
  async function run(command: string, network?: SandboxRequest["network"]) {
    const workspace = await realpath(await mkdtemp(join(tmpdir(), "seatbelt-ws-")));
    const scratch = await realpath(await mkdtemp(join(tmpdir(), "seatbelt-scratch-")));
    await mkdir(join(workspace, ".git", "hooks"), { recursive: true });
    const service = createSandboxService({ host: createNodeSandboxHostPort() });
    service.register(createSeatbeltBackend(createNodeSandboxHostPort()));
    const execution = service.run({ purpose: "tool", isolation: "sandboxed", argv: ["/bin/sh", "-c", command], cwd: workspace, env: { ...process.env, TMPDIR: scratch }, scratchDir: scratch, filesystem: { readWrite: [workspace, scratch] }, ...(network ? { network } : {}) });
    let output = "";
    execution.onOutput(chunk => { output += chunk.text; });
    return { result: await execution.result, output, workspace };
  }

  it("allows workspace writes, denies writes elsewhere and to git hooks", async () => {
    const ok = await run("echo hi > a.txt && cat a.txt && cat .git/hooks/../../a.txt >/dev/null");
    expect(ok.result.outcome).toEqual({ status: "exited", exitCode: 0, signal: null });
    expect(ok.result.facts).toMatchObject({ isolation: "sandboxed", backend: { id: "seatbelt" }, cleanup: "ok" });
    expect(await readFile(join(ok.workspace, "a.txt"), "utf8")).toBe("hi\n");
    const outside = await run(`echo x > ${join(homedir(), `actspace-seatbelt-${process.pid}.txt`)}`);
    expect(outside.result.outcome).toMatchObject({ status: "exited", exitCode: 1 });
    const hooks = await run("echo x > .git/hooks/pre-commit");
    const config = await run("echo x >> .git/config");
    expect(config.result.outcome).toMatchObject({ status: "exited", exitCode: 1 });
    expect(hooks.result.outcome).toMatchObject({ status: "exited", exitCode: 1 });
  });

  it("denies reads of credential paths", async () => {
    const probe = join(homedir(), ".ssh");
    const denied = await run(`ls ${probe} >/dev/null 2>&1 && echo readable || echo denied`);
    expect(denied.output.trim()).toBe("denied");
    await writeFile(join(denied.workspace, "visible.txt"), "ok");
    expect((await run("cat /etc/hosts >/dev/null && echo readable")).output.trim()).toBe("readable");
  });

  it("blocks the network when requested", async () => {
    const blocked = await run("/usr/bin/curl -sS -m 5 -o /dev/null https://example.com && echo online || echo offline", { mode: "blocked" });
    expect(blocked.output.trim().split("\n").at(-1)).toBe("offline");
  });
});
