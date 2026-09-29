import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolBodyResult } from "@actspace/tools-runtime";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "actspace-v2-node-tools-")); roots.push(root); return root; }
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.shell-tools", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeBashToolPorts as createNodeToolPorts } from "../node-ports.js";
import { getBashHardRejectReason } from "../command-rules.js";
describe("shell-tools ports", () => {
  it("runs foreground Bash, streams background output and isolates tasks by Session", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: false });
    const foreground = await invoke(ports.bash, { command: "printf hello", intent: "verify output", blockMs: 5_000 });
    expect(foreground).toMatchObject({ status: "completed" }); expect(JSON.stringify(foreground)).toContain("hello");
    const background = await invoke(ports.bash, { command: "printf ready; sleep 30", intent: "verify background", blockMs: 0 });
    const taskId = JSON.stringify(background).match(/bash_[0-9a-f-]+/)?.[0]; expect(taskId).toBeTruthy();
    expect(background.detail).toEqual([{ label: "background-task", value: { taskId, status: "running" } }]);
    expect(ports.hasRunningBackgroundTask("session")).toBe(true);
    expect(ports.hasRunningBackgroundTask("other-session")).toBe(false);
    await vi.waitFor(async () => {
      const output = await invoke(ports.bash_output, { taskId: taskId! });
      expect(JSON.stringify(output)).toContain("ready");
    }, { timeout: 3_000, interval: 20 });
    await expect(invoke(ports.bash_output, { taskId: taskId! }, "other-session")).resolves.toMatchObject({ status: "failed", failure: { code: "BASH_TASK_NOT_FOUND" } });
    await ports.dispose?.();
    await expect(invoke(ports.bash_output, { taskId: taskId! })).resolves.toMatchObject({ status: "failed" });
  });
  it("keeps large foreground Bash output out of the model surface and exposes an artifact", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: false });
    const result = await invoke(ports.bash, { command: "node -e \"process.stdout.write('x'.repeat(9000))\"", intent: "verify bounded output", blockMs: 5_000 });
    expect(result).toMatchObject({ status: "completed", artifacts: [{ artifactId: "artifact", mediaType: "text/plain" }] });
    expect(JSON.stringify(result.modelOutput).length).toBeLessThan(10_000);
    await ports.dispose?.();
  });
  it("validates Bash output subscriptions before spawn and drains durable notifications on dispose", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root, tmpRoot, sandbox: false });
    await expect(invoke(ports.bash, { command: "printf invalid > should-not-exist", intent: "must not start", blockMs: 0, notifyOnOutput: { pattern: "[", reason: "invalid regex" } })).resolves.toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
    await expect(readFile(join(root, "should-not-exist"), "utf8")).rejects.toThrow();

    const notifications: RuntimeV2JsonValue[] = [];
    const notifyAgent = async (content: RuntimeV2JsonValue) => { await new Promise((resolveWait) => setTimeout(resolveWait, 10)); notifications.push(content); };
    const background = await invoke(ports.bash, { command: "printf 'READY token-abcdefgh\\n'; sleep 30", intent: "verify notifications", blockMs: 0, notifyOnOutput: { pattern: "READY", reason: "service ready", debounceMs: 5_000 } }, "session", notifyAgent);
    expect(JSON.stringify(background)).toContain("bash_");
    await waitFor(() => notifications.some((item) => String(item).includes("output_match")));
    expect(JSON.stringify(notifications)).toContain("[REDACTED]");
    expect(JSON.stringify(notifications)).not.toContain("token-abcdefgh");

    await ports.dispose?.();
    expect(notifications.some((item) => String(item).includes("<status>killed</status>"))).toBe(true);
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
