import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolBodyResult } from "@actspace/tools-runtime";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "actspace-v2-node-tools-")); roots.push(root); return root; }
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.filesystem-write", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeToolPorts as createNodeToolPorts } from "../node-ports.js";
describe("filesystem-write ports", () => {
  it("writes atomically, edits a unique match and deletes only regular workspace files", async () => {
    const root = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root });
    await expect(invoke(ports.write_file, { path: "nested/file.txt", content: "old\nkeep\n" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.edit_file, { path: "nested/file.txt", old_string: "old", new_string: "new" })).resolves.toMatchObject({ status: "completed" });
    expect(await readFile(join(root, "nested/file.txt"), "utf8")).toBe("new\nkeep\n");
    await expect(invoke(ports.delete_file, { path: "nested/file.txt" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.delete_file, { path: "nested" })).resolves.toMatchObject({ status: "failed", failure: { code: "NOT_A_FILE" } });
  });
});
async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}
