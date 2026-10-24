import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolBodyResult } from "@actspace/tools-runtime";
import type { BackgroundTaskHost, BackgroundTaskSource, BackgroundTaskTerminal } from "@actspace/background-tasks";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "actspace-v2-node-tools-")); roots.push(root); return root; }
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.shell-tools", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeBashToolPorts } from "../node-ports.js";

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
function createNodeToolPorts(options: Omit<Parameters<typeof createNodeBashToolPorts>[0], "background">) { lastHost = fakeHost(); return createNodeBashToolPorts({ ...options, background: lastHost.host }); }
import { getBashHardRejectReason } from "../command-rules.js";
describe("shell-tools ports", () => {
  it.each([false, true])("measures real foreground commands and background termination (sandbox=%s)", async sandbox => {
    const root = await workspace(); const tmpRoot = await workspace();
    execFileSync("git", ["init", "-q", root]);
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox });
    try {
      for (const command of ["printf baseline", "git status --short --branch -uno", "git log -1 --oneline"]) {
        const started = Date.now();
        const result = await invoke(ports.bash, { command, intent: "execution baseline", blockMs: 2_000 });
        console.info(JSON.stringify({ sandbox, command, ms: Date.now() - started, summary: result.summary.split("\n")[0] }));
        expect(result.status).toBe(command.startsWith("git log") ? "failed" : "completed");
        expect(result.detail).toBeUndefined();
      }
      const result = await invoke(ports.bash, { command: "printf ready; sleep 30", intent: "background boundary", blockMs: 30 });
      expect(result.summary).toContain("block_timeout");
      const taskId = JSON.stringify(result).match(/bash_[0-9a-f-]+/)![0];
      const source = lastHost.sources.get(taskId)!;
      await vi.waitFor(async () => expect((await source.output()).text).toContain("ready"));
      await source.stop("test");
      expect(lastHost.terminals.get(taskId)).toMatchObject({ status: "stopped" });
      expect(ports.hasRunningBackgroundTask("session")).toBe(false);
    } finally { await ports.dispose(); }
  });

  it("does not spawn a command after cancellation during preparation", async () => {
    const root = await workspace(); const tmpRoot = await workspace();
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: false });
    const controller = new AbortController(); controller.abort();
    try {
      const result = await ports.bash!({ command: "touch should-not-exist", intent: "cancel before spawn" }, { ...context(), signal: controller.signal });
      expect(result).toMatchObject({ status: "failed", failure: { code: "TOOL_ABORTED" } });
      await expect(readFile(join(root, "should-not-exist"))).rejects.toThrow();
    } finally { await ports.dispose(); }
  });
  it("cancels an active foreground process without waiting for blockMs", async () => {
    const root = await workspace(); const tmpRoot = await workspace();
    const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: false });
    const controller = new AbortController();
    const started = Date.now(); const timer = setTimeout(() => controller.abort(), 100);
    try {
      const result = await ports.bash!({ command: "printf ready; sleep 30", intent: "cancel foreground", blockMs: 5_000 }, { ...context(), signal: controller.signal });
      expect(result.status).toBe("failed");
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(ports.hasRunningBackgroundTask("session")).toBe(false);
    } finally { clearTimeout(timer); await ports.dispose(); }
  });
  it("runs foreground Bash, streams background output and isolates tasks by Session", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: false });
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
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: false });
    const result = await invoke(ports.bash, { command: "node -e \"process.stdout.write('x'.repeat(9000))\"", intent: "verify bounded output", blockMs: 5_000 });
    expect(result).toMatchObject({ status: "completed", artifacts: [{ artifactId: "artifact", mediaType: "text/plain" }] });
    expect(JSON.stringify(result.modelOutput).length).toBeLessThan(10_000);
    await ports.dispose?.();
  });
  it("reports a finished background command to the Host registry", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: false });
    const background = await invoke(ports.bash, { command: "sleep 0.1; printf 'done token-abcdefgh'; exit 3", intent: "exit later", blockMs: 0 });
    const taskId = JSON.stringify(background).match(/bash_[0-9a-f-]+/)![0];
    expect(JSON.stringify(background)).toContain("task_output");
    await vi.waitFor(() => expect(lastHost.terminals.get(taskId)).toMatchObject({ status: "failed", exitCode: 3, summary: "Background command failed with exit code 3." }), { timeout: 3_000 });
    expect(lastHost.terminals.get(taskId)!.body).toContain("done");
    await ports.dispose();
  });
  it("validates Bash output subscriptions before spawn and routes output matches through the Host", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: false });
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
