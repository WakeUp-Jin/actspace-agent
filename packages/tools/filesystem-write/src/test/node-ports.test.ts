import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { canonicalizeFileResource } from "@actspace/tools-runtime";
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

it("counts header-like content as additions and deletions in write and edit previews", async () => {
  const root = await workspace();
  const ports = createNodeToolPorts({ workspaceRoot: root });
  for (const name of ["write_file", "edit_file"] as const) {
    await writeFile(join(root, "markers.txt"), "--removed\nkeep\n");
    const args = name === "write_file"
      ? { path: "markers.txt", content: "++added\nkeep\n" }
      : { path: "markers.txt", old_string: "--removed", new_string: "++added" };
    await expect(invoke(ports[name], args)).resolves.toMatchObject({
      status: "completed",
      detail: [expect.objectContaining({ label: "result", value: expect.objectContaining({ additions: 1, deletions: 1 }) }), expect.objectContaining({ label: "actspace.context.file", value: expect.objectContaining({ kind: "file", operation: "write" }) })],
    });
  }
});

it("keeps write/edit/delete result paths workspace-relative through a symlink root", async () => {
  const root = await workspace();
  const alias = join(root, "alias");
  const physical = await workspace();
  await symlink(physical, alias, "dir");
  await mkdir(join(physical, "nested"));
  const ports = createNodeToolPorts({ workspaceRoot: alias });
  for (const [name, args, access] of [
    ["write_file", { path: "nested/result.txt", content: "old" }, "write"],
    ["edit_file", { path: "nested/result.txt", old_string: "old", new_string: "new" }, "write"],
    ["delete_file", { path: "nested/result.txt" }, "delete"],
  ] as const) {
    const ctx = { ...context("session", undefined, alias), admittedResources: [await canonicalizeFileResource(args.path, access, alias)] };
    const result = await ports[name]!(args, ctx);
    expect(result).toMatchObject({ status: "completed", detail: expect.arrayContaining([
      { label: "result", value: expect.objectContaining({ path: "nested/result.txt" }) },
    ]) });
  }
  // An admitted external target must stay absolute, never look like a workspace output.
  const external = await workspace();
  const file = join(external, "outside.txt");
  const result = await ports.write_file!({ path: file, content: "external" }, {
    ...context("session", undefined, alias), admittedResources: [await canonicalizeFileResource(file, "write", alias)],
  });
  expect(result).toMatchObject({ detail: expect.arrayContaining([
    { label: "result", value: expect.objectContaining({ path: await realpath(file) }) },
  ]) });
});
