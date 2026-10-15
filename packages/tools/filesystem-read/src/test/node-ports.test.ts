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
  it("returns contents on each Session's first read while preserving local cache and force", async () => {
    const root = await workspace();
    await writeFile(join(root, "value.txt"), "session-isolated-content\n");
    const ports = createNodeToolPorts({ workspaceRoot: root });
    for (const sessionId of ["parent", "child"]) {
      const first = await invoke(ports.read_file, { path: "value.txt" }, sessionId);
      expect(JSON.stringify(first.modelOutput)).toContain("1|session-isolated-content");
      const repeated = await invoke(ports.read_file, { path: "value.txt" }, sessionId);
      expect(JSON.stringify(repeated.modelOutput)).toContain("File unchanged");
      const forced = await invoke(ports.read_file, { path: "value.txt", force: true }, sessionId);
      expect(JSON.stringify(forced.modelOutput)).toContain("1|session-isolated-content");
    }
  });
});
async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

it("returns the body after compaction even if unchanged and reports successful file facts", async () => {
  const root = await workspace(); await writeFile(join(root, "content.txt"), "keep this evidence");
  const ports = createNodeToolPorts({ workspaceRoot: root }); const input = { path: "content.txt" };
  const first = await ports.read_file!(input, { ...context(), contextGeneration: 0 });
  const repeated = await ports.read_file!(input, { ...context(), contextGeneration: 0 });
  const restored = await ports.read_file!(input, { ...context(), contextGeneration: 1 });
  expect(JSON.stringify(first.modelOutput)).toContain("keep this evidence");
  expect(JSON.stringify(repeated.modelOutput)).toContain("File unchanged");
  expect(JSON.stringify(restored.modelOutput)).toContain("keep this evidence");
  for (const result of [first, repeated, restored]) expect(result.detail).toContainEqual(expect.objectContaining({ label: "actspace.context.file", value: expect.objectContaining({ kind: "file", operation: "read" }) }));
});

describe("present", () => {
  it("records workspace-relative deliverables with optional descriptions", async () => {
    const root = await workspace(); await mkdir(join(root, "out")); await writeFile(join(root, "out", "report.docx"), "doc"); await writeFile(join(root, "deck.pptx"), "deck");
    const ports = createNodeToolPorts({ workspaceRoot: root });
    const result = await invoke(ports.present, { files: [{ path: "out/report.docx", description: " 季度报告 " }, { path: join(root, "deck.pptx") }] });
    expect(result).toMatchObject({ status: "completed", summary: "Presented 2 files", modelOutput: [{ type: "text", text: "Presented out/report.docx\nPresented deck.pptx" }] });
    expect(result.detail).toEqual([{ label: "present", value: { files: [{ path: "out/report.docx", description: "季度报告" }, { path: "deck.pptx" }] } }]);
  });
  it("rejects missing files, directories, symlinks, paths outside the workspace and oversized calls", async () => {
    const root = await workspace(); const outside = await workspace();
    await mkdir(join(root, "dir")); await writeFile(join(root, "file.txt"), "x"); await writeFile(join(outside, "secret.txt"), "s");
    await symlink(join(root, "file.txt"), join(root, "link.txt"));
    const ports = createNodeToolPorts({ workspaceRoot: root });
    await expect(invoke(ports.present, { files: [{ path: "missing.docx" }] })).resolves.toMatchObject({ status: "failed", failure: { code: "FILE_NOT_FOUND" } });
    await expect(invoke(ports.present, { files: [{ path: "dir" }] })).resolves.toMatchObject({ status: "failed", failure: { code: "NOT_A_FILE" } });
    await expect(invoke(ports.present, { files: [{ path: "link.txt" }] })).resolves.toMatchObject({ status: "failed", failure: { code: "NOT_A_FILE" } });
    await expect(invoke(ports.present, { files: [{ path: join(outside, "secret.txt") }] })).resolves.toMatchObject({ status: "failed", failure: { code: "IO_ERROR" } });
    await expect(invoke(ports.present, { files: Array.from({ length: 5 }, () => ({ path: "file.txt" })) })).resolves.toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
    await expect(invoke(ports.present, { files: [] })).resolves.toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
  });
});
