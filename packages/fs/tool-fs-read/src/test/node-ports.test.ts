import { mkdtemp, mkdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tool-runtime";
import type { ToolBodyResult } from "@actspace/tool-runtime";

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

describe("read_file and list_directory output limits", () => {
  const textOf = (result: ToolBodyResult): string => result.modelOutput.map((block) => block.type === "text" ? block.text : "").join("");
  /** Follows the "Use offset=N" trailer until the tool stops printing one; returns every numbered line. */
  async function readAll(read: NonNullable<ReturnType<typeof createNodeToolPorts>["read_file"]>, path: string, limit: number): Promise<{ lines: string[]; pages: number; maxPageChars: number }> {
    const lines: string[] = []; let offset = 1; let pages = 0; let maxPageChars = 0;
    for (;;) {
      const result = await read({ path, offset, limit, force: true }, context());
      expect(result.status).toBe("completed");
      const text = textOf(result); pages += 1; maxPageChars = Math.max(maxPageChars, text.length);
      const [body = "", trailer = ""] = text.split("\n\n[");
      for (const line of body.split("\n")) { expect(line.slice(0, 7)).toBe(`${String(lines.length + 1).padStart(6)}|`); lines.push(line.slice(7)); }
      const next = /Use offset=(\d+) to continue\./.exec(trailer);
      if (!next) return { lines, pages, maxPageChars };
      expect(Number(next[1])).toBe(lines.length + 1);
      offset = Number(next[1]);
    }
  }

  it("cuts a 3 MB single-line file to one bounded line and says how long it was", async () => {
    const root = await workspace(); await writeFile(join(root, "bundle.min.js"), "x".repeat(3_000_000));
    const result = await invoke(createNodeToolPorts({ workspaceRoot: root }).read_file, { path: "bundle.min.js" });
    const text = textOf(result);
    expect(result.status).toBe("completed");
    expect(text.startsWith(`     1|${"x".repeat(2_000)} ...[line truncated: 3000000 bytes]`)).toBe(true);
    expect(text.length).toBeLessThan(2_500);
    expect(text).toContain("1 line was cut at 2,000 characters");
  });
  it("stops a huge limit at the output budget and pages through every line exactly once", async () => {
    const root = await workspace(); const source = Array.from({ length: 5_000 }, (_, index) => `line-${index + 1} ${"abcdefghij".repeat(9)}`);
    await writeFile(join(root, "big.txt"), source.join("\n"));
    const ports = createNodeToolPorts({ workspaceRoot: root });
    const first = textOf(await invoke(ports.read_file, { path: "big.txt", limit: 1_000_000 }));
    expect(first.length).toBeLessThanOrEqual(64_000 + 200);
    expect(first).toMatch(/\n\n\[Showing lines 1-\d+ of 5000 \(stopped at the 64,000-character output limit\)\. Use offset=\d+ to continue\.\]$/);
    const all = await readAll(ports.read_file!, "big.txt", 1_000_000);
    expect(all.lines).toEqual(source);
    expect(all.pages).toBeGreaterThan(5);
    expect(all.maxPageChars).toBeLessThanOrEqual(64_000 + 200);
  });
  it("keeps the old line model: a limit-sized page, the next offset, and the empty line after a final newline", async () => {
    const root = await workspace(); await writeFile(join(root, "three.txt"), "one\ntwo\nthree\n");
    const ports = createNodeToolPorts({ workspaceRoot: root });
    expect(textOf(await invoke(ports.read_file, { path: "three.txt", limit: 2 }))).toBe("     1|one\n     2|two\n\n[Showing lines 1-2 of 4. Use offset=3 to continue.]");
    expect(textOf(await invoke(ports.read_file, { path: "three.txt", offset: 3 }))).toBe("     3|three\n     4|");
    expect(textOf(await invoke(ports.read_file, { path: "three.txt", offset: 9 }))).toBe("[No lines at offset 9: the file has 4 lines.]");
    await writeFile(join(root, "empty.txt"), "");
    expect(textOf(await invoke(ports.read_file, { path: "empty.txt" }))).toBe("(empty file)");
  });
  it("decodes multi-byte characters that straddle read chunks", async () => {
    const root = await workspace(); const source = Array.from({ length: 4_000 }, (_, index) => `${index}:${"汉字🌱é".repeat(4)}`);
    await writeFile(join(root, "unicode.txt"), source.join("\n"));
    const all = await readAll(createNodeToolPorts({ workspaceRoot: root }).read_file!, "unicode.txt", 700);
    expect(all.lines).toEqual(source);
    expect(all.lines.join("")).not.toContain("\ufffd");
  });
  it("never splits a surrogate pair when it cuts a long line", async () => {
    const root = await workspace(); await writeFile(join(root, "emoji.txt"), `a${"🌱".repeat(3_000)}\nnext\n`);
    const text = textOf(await invoke(createNodeToolPorts({ workspaceRoot: root }).read_file, { path: "emoji.txt", limit: 2 }));
    expect(text).toContain(`     1|a${"🌱".repeat(999)} ...[line truncated: 12001 bytes]\n     2|next`);
    expect(text).not.toContain("\ufffd");
    expect(JSON.parse(JSON.stringify(text))).toBe(text);
  });
  it("refuses binary files instead of decoding them as text", async () => {
    const root = await workspace(); await writeFile(join(root, "data.bin"), Buffer.concat([Buffer.from("SQLite format 3"), Buffer.alloc(4_096), Buffer.from("\nrow\n".repeat(1_000))]));
    const result = await invoke(createNodeToolPorts({ workspaceRoot: root }).read_file, { path: "data.bin" });
    expect(result).toMatchObject({ status: "failed", failure: { code: "BINARY_FILE", retryable: false } });
    expect(textOf(result)).toContain("data.bin");
  });
  it("reads the head of a file too large to count without scanning the rest", async () => {
    const root = await workspace(); const path = join(root, "huge.log"); const head = Array.from({ length: 400 }, (_, index) => `entry ${index + 1} ${"-".repeat(40)}`).join("\n");
    await writeFile(path, `${head}\n`); await truncate(path, 65 * 1024 * 1024);
    const text = textOf(await invoke(createNodeToolPorts({ workspaceRoot: root }).read_file, { path: "huge.log", limit: 3 }));
    expect(text).toBe(`     1|entry 1 ${"-".repeat(40)}\n     2|entry 2 ${"-".repeat(40)}\n     3|entry 3 ${"-".repeat(40)}\n\n[Showing lines 1-3; the file is 68157440 bytes, so its lines were not counted. Use offset=4 to continue.]`);
  });
  it("rejects an image larger than the image limit before reading it", async () => {
    const root = await workspace(); const path = join(root, "huge.png"); await writeFile(path, "png"); await truncate(path, 25 * 1024 * 1024 + 1);
    let created = 0;
    const result = await createNodeToolPorts({ workspaceRoot: root }).read_file!({ path: "huge.png" }, { ...context(), createArtifact: async ({ bytes, mediaType }) => { created += 1; return { artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }; } });
    expect(result).toMatchObject({ status: "failed", failure: { code: "IMAGE_TOO_LARGE" } });
    expect(created).toBe(0);
  });
  it("stops reading when the call is aborted", async () => {
    const root = await workspace(); await writeFile(join(root, "big.txt"), "line\n".repeat(200_000));
    const controller = new AbortController(); controller.abort(new Error("stop"));
    await expect(createNodeToolPorts({ workspaceRoot: root }).read_file!({ path: "big.txt", offset: 150_000 }, { ...context(), signal: controller.signal })).rejects.toThrow("stop");
  });
  it("lists a small directory in full and reports the entry count in detail", async () => {
    const root = await workspace(); await mkdir(join(root, "src")); await writeFile(join(root, "a.txt"), "a");
    const result = await invoke(createNodeToolPorts({ workspaceRoot: root }).list_directory, { path: "." });
    expect(textOf(result)).toBe("[file] a.txt\n[dir]  src");
    expect(result.detail).toEqual([{ label: "result", value: { entryCount: 2, shownCount: 2 } }]);
    await mkdir(join(root, "none"));
    const empty = await invoke(createNodeToolPorts({ workspaceRoot: root }).list_directory, { path: "none" });
    expect(textOf(empty)).toBe("(empty directory)");
    expect(empty.detail).toEqual([{ label: "result", value: { entryCount: 0, shownCount: 0 } }]);
  });
  it("bounds a directory with thousands of entries and keeps the real count", async () => {
    const root = await workspace(); await mkdir(join(root, "many"));
    for (let start = 0; start < 5_000; start += 500) await Promise.all(Array.from({ length: 500 }, (_, index) => writeFile(join(root, "many", `entry-${String(start + index).padStart(5, "0")}-${"n".repeat(20)}.txt`), "")));
    const result = await invoke(createNodeToolPorts({ workspaceRoot: root }).list_directory, { path: "many" });
    const text = textOf(result); const [body = "", trailer = ""] = text.split("\n\n[");
    const shown = body.split("\n");
    expect(text.length).toBeLessThanOrEqual(64_000 + 200);
    expect(shown.length).toBeGreaterThan(1_000);
    expect(shown[0]).toBe(`[file] entry-00000-${"n".repeat(20)}.txt`);
    expect(shown.at(-1)).toBe(`[file] entry-${String(shown.length - 1).padStart(5, "0")}-${"n".repeat(20)}.txt`);
    expect(trailer).toBe(`Showing first ${shown.length} of 5000 entries (stopped at the 64,000-character output limit). Use glob with a pattern, or list a subdirectory, to see the rest.]`);
    expect(result.detail).toEqual([{ label: "result", value: { entryCount: 5_000, shownCount: shown.length } }]);
  });
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
