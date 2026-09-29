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
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.filesystem-read", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeToolPorts as createNodeToolPorts } from "../node-ports.js";
describe("filesystem-read ports", () => {
  it("reads numbered ranges, caches unchanged reads and lists deterministically", async () => {
    const root = await workspace(); await mkdir(join(root, "src")); await writeFile(join(root, "src", "b.txt"), "one\ntwo\nthree\n"); await writeFile(join(root, "src", "a.txt"), "alpha\n");
    const ports = createNodeToolPorts({ workspaceRoot: root });
    const first = await invoke(ports.read_file, { path: "src/b.txt", offset: 2, limit: 1 });
    expect(first).toMatchObject({ status: "completed" }); expect(JSON.stringify(first)).toContain("     2|two");
    const second = await invoke(ports.read_file, { path: "src/b.txt", offset: 2, limit: 1 }); expect(JSON.stringify(second)).toContain("File unchanged");
    const listed = await invoke(ports.list_directory, { path: "src" }); const text = JSON.stringify(listed); expect(text.indexOf("a.txt")).toBeLessThan(text.indexOf("b.txt"));
  });
  it("uses the immutable Session workspace for every file operation", async () => {
    const defaultRoot = await workspace();
    const sessionRoot = await workspace();
    await writeFile(join(defaultRoot, "value.txt"), "default");
    await writeFile(join(sessionRoot, "value.txt"), "session");
    const ports = createNodeToolPorts({ workspaceRoot: defaultRoot });
    const result = await invoke(ports.read_file, { path: "value.txt" }, "session", undefined, sessionRoot);
    expect(JSON.stringify(result)).toContain("session");
    expect(JSON.stringify(result)).not.toContain("default");
  });
});
async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}
