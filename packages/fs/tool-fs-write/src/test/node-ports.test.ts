import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { canonicalizeFileResource } from "@actspace/tool-runtime";
import type { ToolExecutionContext } from "@actspace/tool-runtime";
import type { ToolBodyResult } from "@actspace/tool-runtime";

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
  it("accepts names that merely start with two dots and still rejects paths that leave the workspace", async () => {
    const outer = await workspace(); const root = join(outer, "workspace"); await mkdir(root); const ports = createNodeToolPorts({ workspaceRoot: root });
    await expect(invoke(ports.write_file, { path: "..data/..notes.md", content: "dotted\n" })).resolves.toMatchObject({ status: "completed" });
    expect(await readFile(join(root, "..data", "..notes.md"), "utf8")).toBe("dotted\n");
    await expect(invoke(ports.delete_file, { path: "..data/..notes.md" })).resolves.toMatchObject({ status: "completed" });
    const outside = await invoke(ports.write_file, { path: join("..", "outside.txt"), content: "escaped" });
    expect(outside).toMatchObject({ status: "failed" }); expect(JSON.stringify(outside.modelOutput)).toContain("Path escapes workspace boundary");
    await expect(readFile(join(outer, "outside.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
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

describe("write_file and edit_file diff limits", () => {
  const textOf = (result: ToolBodyResult): string => result.modelOutput.map((block) => block.type === "text" ? block.text : "").join("");
  const counts = (result: ToolBodyResult) => result.detail?.find((entry) => entry.label === "result")?.value;

  it("keeps small diffs byte-for-byte as before", async () => {
    const root = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root });
    await writeFile(join(root, "small.txt"), "a\nb\nc\nd\ne\nf\ng\nh\n");
    const result = await invoke(ports.edit_file, { path: "small.txt", old_string: "e", new_string: "E\nE2" });
    expect(textOf(result)).toBe("--- a/small.txt\n+++ b/small.txt\n@@ -2,7 +2,8 @@\n b\n c\n d\n-e\n+E\n+E2\n f\n g\n h\n\nFile updated: small.txt");
    expect(counts(result)).toMatchObject({ type: "update", additions: 2, deletions: 1 });
  });
  it("cuts long lines in the diff of a 3 MB single-line file and reports real counts", async () => {
    const root = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root });
    const long = `${"x".repeat(1_500_000)}MARK${"y".repeat(1_500_000)}`;
    await writeFile(join(root, "bundle.min.js"), `${long}\nsecond\n`);
    const tail = await invoke(ports.edit_file, { path: "bundle.min.js", old_string: "second", new_string: "2nd" });
    expect(textOf(tail)).toBe(`--- a/bundle.min.js\n+++ b/bundle.min.js\n@@ -1,3 +1,3 @@\n ${"x".repeat(2_000)} ...[line truncated: 3000004 chars]\n-second\n+2nd\n \n\nFile updated: bundle.min.js`);
    const inside = await invoke(ports.edit_file, { path: "bundle.min.js", old_string: "MARK", new_string: "CHANGED" });
    expect(textOf(inside)).toBe(`--- a/bundle.min.js\n+++ b/bundle.min.js\n@@ -1,3 +1,3 @@\n-${"x".repeat(2_000)} ...[line truncated: 3000004 chars]\n+${"x".repeat(2_000)} ...[line truncated: 3000007 chars]\n 2nd\n \n\nFile updated: bundle.min.js`);
    expect(counts(inside)).toMatchObject({ additions: 1, deletions: 1 });
    expect(await readFile(join(root, "bundle.min.js"), "utf8")).toBe(`${long.replace("MARK", "CHANGED")}\n2nd\n`);
  });
  it("bounds the diff of a 100,000-line new file and still ends with the status line", async () => {
    const root = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root });
    const content = Array.from({ length: 100_000 }, (_, index) => `line-${index + 1}`).join("\n");
    const result = await invoke(ports.write_file, { path: "big.txt", content });
    const text = textOf(result);
    expect(text.length).toBeLessThanOrEqual(64_000 + 400);
    expect(text.startsWith("--- a/big.txt\n+++ b/big.txt\n@@ -1,1 +1,100000 @@\n-\n+line-1\n+line-2\n")).toBe(true);
    const note = /\n\+line-(\d+)\n\[Output truncated at 64,000 characters: this diff shows (\d+) of 100000 added lines\. The file was written in full\.\]\n\nFile created: big\.txt$/.exec(text);
    expect(note).not.toBeNull();
    expect(note?.[1]).toBe(note?.[2]);
    expect(Number(note?.[2])).toBeGreaterThan(4_000);
    expect(counts(result)).toMatchObject({ type: "create", additions: 100_000, deletions: 1 });
    expect(await readFile(join(root, "big.txt"), "utf8")).toBe(content);
  });
  it("keeps the trailing context line of a truncated diff so a new file ending in a newline is still recognisable", async () => {
    const root = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root });
    const result = await invoke(ports.write_file, { path: "log.txt", content: "entry\n".repeat(50_000) });
    const text = textOf(result);
    expect(text.startsWith("--- a/log.txt\n+++ b/log.txt\n@@ -1,1 +1,50001 @@\n+entry\n")).toBe(true);
    expect(text).toMatch(/\n\+entry\n \n\[Output truncated at 64,000 characters: this diff shows \d+ of 50000 added lines\. The file was written in full\.\]\n\nFile created: log\.txt$/);
    expect(counts(result)).toMatchObject({ type: "create", additions: 50_000, deletions: 0 });
  });
  it("splits the budget between removed and added lines when both sides are large", async () => {
    const root = await workspace(); const ports = createNodeToolPorts({ workspaceRoot: root });
    await writeFile(join(root, "both.txt"), Array.from({ length: 50_000 }, (_, index) => `old-${index + 1}`).join("\n"));
    const result = await invoke(ports.write_file, { path: "both.txt", content: Array.from({ length: 30_000 }, (_, index) => `new-${index + 1}`).join("\n") });
    const text = textOf(result); const lines = text.split("\n");
    const removed = lines.filter((line) => line.startsWith("-old-")).length; const added = lines.filter((line) => line.startsWith("+new-")).length;
    expect(text.length).toBeLessThanOrEqual(64_000 + 400);
    expect(removed).toBeGreaterThan(2_000); expect(added).toBeGreaterThan(2_000);
    expect(text).toContain(`\n[Output truncated at 64,000 characters: this diff shows ${added} of 30000 added and ${removed} of 50000 removed lines. The file was written in full.]\n\nFile updated: both.txt`);
    expect(counts(result)).toMatchObject({ type: "update", additions: 30_000, deletions: 50_000 });
  });
});
