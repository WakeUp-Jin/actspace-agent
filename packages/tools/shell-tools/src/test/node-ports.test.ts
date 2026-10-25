import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolBodyResult } from "@actspace/tools-runtime";
import type { BackgroundTaskHost, BackgroundTaskSource, BackgroundTaskTerminal } from "@actspace/background-tasks";
import { createSandboxService } from "@actspace/sandbox";
import { createNodeSandboxHostPort, repoNonoPath } from "@actspace/sandbox/node-ports";
import { createNonoBackend } from "@actspace/sandbox-nono";
import { createSeatbeltBackend } from "@actspace/sandbox-seatbelt";
import { SANDBOX_CAPABILITIES, type SandboxBackend, type SandboxPolicy, type SandboxService } from "@actspace/sandbox/types";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "actspace-v2-node-tools-")); roots.push(root); return root; }
/** What the permission layer admitted; the executor follows its `noSandbox`. */
function admitted(noSandbox: boolean): ToolExecutionContext["admittedResources"] { return [{ kind: "process", access: "execute", commandDigest: "digest", cwd: "", dynamic: false, noSandbox }]; }
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "", noSandbox = true): ToolExecutionContext { return { admittedResources: admitted(noSandbox), pluginId: "actspace.shell-tools", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "", noSandbox = true) { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot, noSandbox)); }

/** The real manager over a backend that records the resolved policy and runs the command unchanged. */
function recordingSandbox(options: { readonly probe?: Awaited<ReturnType<SandboxBackend["probe"]>>; readonly prepareError?: string } = {}) {
  const policies: SandboxPolicy[] = [];
  const sandbox = createSandboxService({ host: createNodeSandboxHostPort(), timing: { killGraceMs: 200, residualWaitMs: 200 } });
  sandbox.register({
    id: "fake", priority: 1,
    probe: async () => options.probe ?? { available: true, version: "1.0.0", capabilities: Object.fromEntries(SANDBOX_CAPABILITIES.map(item => [item, "full"])) as never },
    prepare: async (policy) => {
      if (options.prepareError) throw new Error(options.prepareError);
      policies.push(policy);
      return { spawn: { command: policy.argv[0]!, args: policy.argv.slice(1), cwd: policy.cwd, env: policy.env }, dispose: async () => undefined };
    },
  });
  return { sandbox, policies };
}
type Mode = { readonly label: string; readonly noSandbox: boolean; readonly sandbox?: () => ReturnType<typeof recordingSandbox>; readonly summary: string };
const MODES: readonly Mode[] = [
  { label: "no sandbox service, approved outside", noSandbox: true, summary: "sandboxed=false, sandbox=none" },
  { label: "sandbox service, approved outside", noSandbox: true, sandbox: () => recordingSandbox(), summary: "sandboxed=false, sandbox=none" },
  { label: "sandbox service, sandboxed", noSandbox: false, sandbox: () => recordingSandbox(), summary: "sandboxed=true, sandbox=fake" },
];

import { createNodeBashToolPorts, sandboxDenial } from "../node-ports.js";

/** Records what Bash hands to the Host registry. */
function fakeHost() {
  const sources = new Map<string, BackgroundTaskSource>(); const terminals = new Map<string, BackgroundTaskTerminal>(); const matches: { taskId: string; summary: string; line: string }[] = [];
  const host = {
    register: async (source: BackgroundTaskSource) => { sources.set(source.taskId, source); void source.done.then(terminal => terminals.set(source.taskId, terminal)); return undefined as never; },
    notifyOutputMatch: async (taskId: string, summary: string, line: string) => { matches.push({ taskId, summary, line }); },
  } as unknown as BackgroundTaskHost;
  return { host, sources, terminals, matches };
}
let lastHost: ReturnType<typeof fakeHost>;
function createNodeToolPorts(options: Omit<Parameters<typeof createNodeBashToolPorts>[0], "background"> & { readonly sandbox?: SandboxService }) { lastHost = fakeHost(); return createNodeBashToolPorts({ ...options, background: lastHost.host }); }
import { getBashHardRejectReason } from "../command-rules.js";
describe("shell-tools ports", () => {
  it.each(MODES)("measures real foreground commands and background termination ($label)", async mode => {
    const root = await workspace(); const tmpRoot = await workspace();
    execFileSync("git", ["init", "-q", root]);
    const recording = mode.sandbox?.();
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: recording?.sandbox });
    try {
      for (const command of ["printf baseline", "git status --short --branch -uno", "git log -1 --oneline"]) {
        const started = Date.now();
        const result = await invoke(ports.bash, { command, intent: "execution baseline", blockMs: 2_000 }, "session", undefined, "", mode.noSandbox);
        console.info(JSON.stringify({ mode: mode.label, command, ms: Date.now() - started, summary: result.summary.split("\n")[0] }));
        expect(result.status).toBe(command.startsWith("git log") ? "failed" : "completed");
        expect(result.summary).toContain(mode.summary);
        expect(result.detail).toBeUndefined();
      }
      const result = await invoke(ports.bash, { command: "printf ready; sleep 30", intent: "background boundary", blockMs: 30 }, "session", undefined, "", mode.noSandbox);
      expect(result.summary).toContain("block_timeout");
      const taskId = JSON.stringify(result).match(/bash_[0-9a-f-]+/)![0];
      const source = lastHost.sources.get(taskId)!;
      await vi.waitFor(async () => expect((await source.output()).text).toContain("ready"));
      await source.stop("test");
      expect(lastHost.terminals.get(taskId)).toMatchObject({ status: "stopped" });
      expect(ports.hasRunningBackgroundTask("session")).toBe(false);
      if (recording) {
        expect(recording.policies).toHaveLength(mode.noSandbox ? 0 : 4);
        for (const policy of recording.policies) {
          const outputRoot = policy.scratchDir;
          expect(outputRoot.startsWith(await realpath(tmpRoot))).toBe(true);
          expect(policy).toMatchObject({ purpose: "tool", isolation: "sandboxed", cwd: await realpath(root), env: { TMPDIR: outputRoot } });
          expect(policy.filesystem.readWrite).toEqual(expect.arrayContaining([await realpath(root), outputRoot, await realpath(tmpdir())]));
          expect(policy.filesystem.denyWrite).toEqual(expect.arrayContaining([join(await realpath(root), ".git", "hooks"), join(await realpath(root), ".git", "config")]));
        }
      }
    } finally { await ports.dispose(); }
  });

  it.each([
    ["the sandbox plugin is missing", undefined, /sandbox plugin is not loaded/],
    ["no backend is available", () => recordingSandbox({ probe: { available: false, reason: "fake missing" } }), /fake missing/],
    ["the backend cannot prepare", () => recordingSandbox({ prepareError: "profile rejected" }), /fake: profile rejected/],
  ] as const)("does not run a sandboxed command when %s", async (_label, make, reason) => {
    const root = await workspace(); const tmpRoot = await workspace();
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: make?.().sandbox });
    try {
      const result = await invoke(ports.bash, { command: "touch should-not-exist", intent: "sandbox refusal", blockMs: 2_000 }, "session", undefined, "", false);
      expect(result).toMatchObject({ status: "failed", failure: { code: "SANDBOX_PREPARE_FAILED", retryable: false } });
      expect(result.failure!.message).toMatch(reason);
      await expect(readFile(join(root, "should-not-exist"))).rejects.toThrow();
    } finally { await ports.dispose(); }
  });

  const repoNono = repoNonoPath(join(import.meta.dirname, "../../../../.."));
  it.runIf(process.platform === "darwin").each([
    ["seatbelt", () => createSeatbeltBackend(createNodeSandboxHostPort())],
    ...existsSync(repoNono) ? [["nono", () => createNonoBackend(createNodeSandboxHostPort({ nonoPath: repoNono }))] as const] : [],
  ] as const)("confines a sandboxed command with the real %s backend", async (id, backend) => {
    const root = await workspace(); const tmpRoot = await workspace();
    execFileSync("git", ["init", "-q", root]);
    const sandbox = createSandboxService({ host: createNodeSandboxHostPort() });
    sandbox.register(backend());
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox });
    const outside = join(homedir(), `.actspace-sandbox-probe-${process.pid}-${id}`);
    const run = (command: string) => invoke(ports.bash, { command, blockMs: 10_000 }, "session", undefined, "", false);
    try {
      const inside = await run("printf ok > inside.txt && git status --short");
      expect(inside.summary).toContain(`sandboxed=true, sandbox=${id}`);
      expect(await readFile(join(root, "inside.txt"), "utf8")).toBe("ok");
      const blocked = await run(`printf no > '${outside}'`);
      expect(blocked.status).toBe("failed");
      expect(JSON.stringify(blocked.modelOutput)).toContain("require_escalated");
      expect(existsSync(outside)).toBe(false);
      expect((await run("printf no > .git/hooks/pre-commit")).status).toBe("failed");
      expect(existsSync(join(root, ".git", "hooks", "pre-commit"))).toBe(false);
    } finally { await rm(outside, { force: true }); await ports.dispose(); }
  }, 30_000);

  it("recognises a sandbox denial only for a failed sandboxed run that reports EPERM", () => {
    const sandboxed = (exitCode: number | null) => ({ isolation: "sandboxed" as const, exitCode });
    expect(sandboxDenial(sandboxed(1), "touch: /x: Operation not permitted")).toBe(true);
    expect(sandboxDenial(sandboxed(255), "npm error code EPERM\n... sudo chown -R")).toBe(true);
    expect(sandboxDenial(sandboxed(4), "error: could not write config file .git/config: Operation not permitted")).toBe(true);
    expect(sandboxDenial(sandboxed(1), "cat: locked.txt: Permission denied")).toBe(false);
    for (const exitCode of [0, 2, 126, 127, null]) expect(sandboxDenial(sandboxed(exitCode), "Operation not permitted")).toBe(false);
    for (const isolation of ["none", "inherited"] as const) expect(sandboxDenial({ isolation, exitCode: 1 }, "Operation not permitted")).toBe(false);
  });

  it("tells the model it may retry outside the sandbox, in the foreground result and the background notification", async () => {
    const root = await workspace(); const tmpRoot = await workspace();
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: recordingSandbox().sandbox });
    const denied = "printf 'touch: /x: Operation not permitted\\n' >&2; exit 1";
    try {
      const hinted = await invoke(ports.bash, { command: denied, blockMs: 2_000 }, "session", undefined, "", false);
      expect(hinted).toMatchObject({ status: "failed", failure: { code: "BASH_EXIT_NONZERO" } });
      expect(JSON.stringify(hinted.modelOutput)).toContain('sandbox_permissions: \\"require_escalated\\"');
      // What the user sees is unchanged.
      expect(hinted.summary).not.toContain("sandbox_permissions");
      expect(hinted.summary).toContain("exit 1, sandboxed=true, sandbox=fake");
      for (const [command, noSandbox] of [[denied, true], ["printf 'Operation not permitted\\n'; exit 2", false], ["printf 'Operation not permitted\\n'", false]] as const) {
        expect(JSON.stringify((await invoke(ports.bash, { command, blockMs: 2_000 }, "session", undefined, "", noSandbox)).modelOutput), command).not.toContain("sandbox_permissions");
      }
      const background = await invoke(ports.bash, { command: "sleep 0.1; printf 'EPERM: operation not permitted, mkdir'; exit 255", intent: "denied later", blockMs: 0 }, "session", undefined, "", false);
      const taskId = JSON.stringify(background).match(/bash_[0-9a-f-]+/)![0];
      await vi.waitFor(() => expect(lastHost.terminals.get(taskId)?.summary).toMatch(/^Background command failed with exit code 255\. The sandbox may have blocked/), { timeout: 3_000 });
    } finally { await ports.dispose(); }
  });

  it("follows the admitted resource over the arguments and falls back to an explicit escalation request", async () => {
    const root = await workspace(); const tmpRoot = await workspace();
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot });
    try {
      const smuggled = await ports.bash!({ command: "printf hi", sandbox_permissions: "require_escalated", justification: "x", blockMs: 2_000 }, context("session", undefined, "", false));
      expect(smuggled.failure?.code).toBe("SANDBOX_PREPARE_FAILED");
      const { admittedResources: _, ...direct } = context();
      expect((await ports.bash!({ command: "printf hi", blockMs: 2_000 }, direct)).failure?.code).toBe("SANDBOX_PREPARE_FAILED");
      expect(await ports.bash!({ command: "printf hi", sandbox_permissions: "require_escalated", justification: "x", blockMs: 2_000 }, direct)).toMatchObject({ status: "completed" });
    } finally { await ports.dispose(); }
  });

  it("does not spawn a command after cancellation during preparation", async () => {
    const root = await workspace(); const tmpRoot = await workspace();
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot });
    const controller = new AbortController(); controller.abort();
    try {
      const result = await ports.bash!({ command: "touch should-not-exist", intent: "cancel before spawn" }, { ...context(), signal: controller.signal });
      expect(result).toMatchObject({ status: "failed", failure: { code: "TOOL_ABORTED" } });
      await expect(readFile(join(root, "should-not-exist"))).rejects.toThrow();
    } finally { await ports.dispose(); }
  });
  it.each(MODES)("cancels an active foreground process without waiting for blockMs ($label)", async (mode) => {
    const root = await workspace(); const tmpRoot = await workspace();
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: mode.sandbox?.().sandbox });
    const controller = new AbortController();
    const started = Date.now(); const timer = setTimeout(() => controller.abort(), 100);
    try {
      const result = await ports.bash!({ command: "printf ready; sleep 30", intent: "cancel foreground", blockMs: 5_000 }, { ...context("session", undefined, "", mode.noSandbox), signal: controller.signal });
      expect(result.status).toBe("failed");
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(ports.hasRunningBackgroundTask("session")).toBe(false);
    } finally { clearTimeout(timer); await ports.dispose(); }
  });
  it("runs foreground Bash, streams background output and isolates tasks by Session", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot });
    const foreground = await invoke(ports.bash, { command: "printf hello", intent: "verify output", blockMs: 5_000 });
    expect(foreground).toMatchObject({ status: "completed" }); expect(JSON.stringify(foreground)).toContain("hello");
    const background = await invoke(ports.bash, { command: "printf ready; sleep 30", intent: "verify background", blockMs: 0 });
    const taskId = JSON.stringify(background).match(/bash_[0-9a-f-]+/)?.[0]; expect(taskId).toBeTruthy();
    expect(background.detail).toEqual([{ label: "background-task", value: { taskId, status: "running" } }]);
    expect(ports.hasRunningBackgroundTask("session")).toBe(true);
    expect(ports.hasRunningBackgroundTask("other-session")).toBe(false);
    const source = lastHost.sources.get(taskId!)!;
    expect(source).toMatchObject({ kind: "bash", sessionId: "session", callId: "call", description: "verify background" });
    await vi.waitFor(async () => {
      const output = await source.output();
      expect(output.text).toContain("ready");
      expect(output.outputPath).toMatch(/\.log$/);
    }, { timeout: 3_000, interval: 20 });
    await ports.dispose?.();
    await vi.waitFor(() => expect(lastHost.terminals.get(taskId!)).toMatchObject({ status: "stopped" }));
  });
  it("keeps large foreground Bash output out of the model surface and exposes an artifact", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot });
    const result = await invoke(ports.bash, { command: "node -e \"process.stdout.write('x'.repeat(9000))\"", intent: "verify bounded output", blockMs: 5_000 });
    expect(result).toMatchObject({ status: "completed", artifacts: [{ artifactId: "artifact", mediaType: "text/plain" }] });
    expect(JSON.stringify(result.modelOutput).length).toBeLessThan(10_000);
    await ports.dispose?.();
  });
  it("reports a finished background command to the Host registry", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot });
    const background = await invoke(ports.bash, { command: "sleep 0.1; printf 'done token-abcdefgh'; exit 3", intent: "exit later", blockMs: 0 });
    const taskId = JSON.stringify(background).match(/bash_[0-9a-f-]+/)![0];
    expect(JSON.stringify(background)).toContain("task_output");
    await vi.waitFor(() => expect(lastHost.terminals.get(taskId)).toMatchObject({ status: "failed", exitCode: 3, summary: "Background command failed with exit code 3." }), { timeout: 3_000 });
    expect(lastHost.terminals.get(taskId)!.body).toContain("done");
    await ports.dispose();
  });
  it("validates Bash output subscriptions before spawn and routes output matches through the Host", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot });
    await expect(invoke(ports.bash, { command: "printf invalid > should-not-exist", intent: "must not start", blockMs: 0, notifyOnOutput: { pattern: "[", reason: "invalid regex" } })).resolves.toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
    await expect(readFile(join(root, "should-not-exist"), "utf8")).rejects.toThrow();

    const background = await invoke(ports.bash, { command: "printf 'READY token-abcdefgh\\n'; sleep 30", intent: "verify notifications", blockMs: 0, notifyOnOutput: { pattern: "READY", reason: "service ready", debounceMs: 5_000 } });
    expect(JSON.stringify(background)).toContain("bash_");
    await waitFor(() => lastHost.matches.length > 0);
    expect(lastHost.matches[0]!.summary).toContain("service ready");
    expect(JSON.stringify(lastHost.matches)).toContain("[REDACTED]");
    expect(JSON.stringify(lastHost.matches)).not.toContain("token-abcdefgh");
    await ports.dispose?.();
  });
  it("hard-rejects broad deletion and repository metadata targets before execution", async () => {
    const root = await workspace();
    expect(getBashHardRejectReason("rm -rf /", root, root)).toContain("dangerous delete");
    expect(getBashHardRejectReason("rm -rf .git", root, root)).toContain("repository metadata");
    expect(getBashHardRejectReason("printf ok", root, root)).toBeUndefined();
  });
});
async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}
