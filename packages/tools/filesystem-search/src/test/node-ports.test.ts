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
});
async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}
