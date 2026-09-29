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
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.image-inspection", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeToolPorts as createNodeToolPorts } from "../node-ports.js";
describe("image-inspection ports", () => {
  it("inspects only a Session-bound image artifact", async () => {
    const root = await workspace(); const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]); const reads: string[] = []; const inspections: string[] = [];
    const ports = createNodeToolPorts({

      readArtifact: async (sessionId, artifactId) => { reads.push(`${sessionId}:${artifactId}`); if (sessionId !== "owner") throw new Error("wrong Session"); return { bytes: png, mediaType: "image/png" }; },
      inspect: async ({ sessionId, artifactId, question }) => { inspections.push(`${sessionId}:${artifactId}:${question}`); return "The image is valid."; },
    });
    const result = await invoke(ports.inspect_image, { artifact_id: "artifact-1", question: "What is visible?" }, "owner");
    expect(result).toMatchObject({ status: "completed" });
    expect(reads).toEqual(["owner:artifact-1"]);
    expect(inspections).toEqual(["owner:artifact-1:What is visible?"]);
    await expect(invoke(ports.inspect_image, { artifact_id: "artifact-1", question: "Read it" }, "other")).resolves.toMatchObject({ status: "failed", failure: { code: "IMAGE_INSPECTION_FAILED" } });
  });
});
async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}
