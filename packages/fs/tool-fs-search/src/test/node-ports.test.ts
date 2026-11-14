import { chmod, mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tool-runtime";
import type { ToolBodyResult } from "@actspace/tool-runtime";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "actspace-v2-node-tools-")); roots.push(root); return root; }
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.filesystem-search", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeToolPorts as createNodeToolPorts } from "../node-ports.js";
describe("filesystem-search ports", () => {
  it("searches and globs with bounded, workspace-relative output", async () => {
    const root = await workspace(); await mkdir(join(root, "src")); await writeFile(join(root, "src", "old.ts"), "export const value = 'needle';\n"); await writeFile(join(root, "src", "new.ts"), "export const next = 'needle';\n"); await utimes(join(root, "src", "old.ts"), new Date("2024-01-01"), new Date("2024-01-01")); await utimes(join(root, "src", "new.ts"), new Date("2025-01-01"), new Date("2025-01-01"));
    const ports = createNodeToolPorts({ workspaceRoot: root });
    const grep = await invoke(ports.grep, { pattern: "needle", path: "src", glob: "*.ts" }); expect(JSON.stringify(grep)).toContain("src/old.ts:1:");
    const glob = await invoke(ports.glob, { pattern: "*.ts", path: "src" }); const text = JSON.stringify(glob); expect(text.indexOf("src/new.ts")).toBeLessThan(text.indexOf("src/old.ts"));
  });
  it("searches a directory whose name merely starts with two dots and still rejects paths that leave the workspace", async () => {
    const outer = await workspace(); const root = join(outer, "workspace"); await mkdir(join(root, "..data"), { recursive: true }); await writeFile(join(root, "..data", "note.ts"), "export const value = 'needle';\n"); await writeFile(join(outer, "outside.ts"), "export const value = 'needle';\n");
    const ports = createNodeToolPorts({ workspaceRoot: root });
    const grep = await invoke(ports.grep, { pattern: "needle", path: "..data" }); expect(JSON.stringify(grep)).toContain("..data/note.ts:1:");
    const glob = await invoke(ports.glob, { pattern: "*.ts", path: "..data" }); expect(JSON.stringify(glob)).toContain("..data/note.ts");
    const outside = await invoke(ports.grep, { pattern: "needle", path: ".." });
    expect(outside).toMatchObject({ status: "failed" }); expect(JSON.stringify(outside.modelOutput)).toContain("Path escapes workspace boundary");
  });
});
describe("filesystem-search output decoding", () => {
  it("keeps a multi-byte character whole when ripgrep's output arrives split inside it", async () => {
    const root = await workspace();
    // 代替 rg 的脚本：把一行输出从「中」的三个字节中间切开，分两次写，中间停一下，让两半落在两个数据块里。
    const fakeRipgrep = join(root, "fake-rg.mjs");
    await writeFile(fakeRipgrep, [
      "#!/usr/bin/env node",
      "const bytes = Buffer.from('notes.md:1:中文注释\\n', 'utf8');",
      "const cut = bytes.indexOf(0xe4) + 1;",
      "process.stdout.write(bytes.subarray(0, cut), () => setTimeout(() => process.stdout.write(bytes.subarray(cut)), 100));",
    ].join("\n"));
    await chmod(fakeRipgrep, 0o755);
    const result = await invoke(createNodeToolPorts({ workspaceRoot: root, ripgrepPath: fakeRipgrep }).grep, { pattern: "注释" });
    const text = (result.modelOutput as { text: string }[])[0].text;
    expect(text).toContain("notes.md:1:中文注释");
    expect(text).not.toContain("\uFFFD");
  });
});
describe("filesystem-search output cap", () => {
  it("caps grep output at 64,000 characters and tells the model to narrow the search", async () => {
    const root = await workspace();
    // 2,000 个文件各 1 行命中，每行约 100 字符：总输出约 200K，超过上限。
    await Promise.all(Array.from({ length: 2_000 }, (_, i) => writeFile(join(root, `f${String(i).padStart(4, "0")}.ts`), `export const needle_${i} = "${"x".repeat(60)}";\n`)));
    const ports = createNodeToolPorts({ workspaceRoot: root });
    const result = await invoke(ports.grep, { pattern: "needle" });
    const text = (result.modelOutput as { text: string }[])[0].text;
    expect(text.length).toBeLessThan(66_000);
    expect(text).toContain("Output truncated");
    expect(text).toMatch(/narrow/i);
  });
});
