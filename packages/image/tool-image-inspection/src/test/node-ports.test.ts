import { describe, expect, it, vi } from "vitest";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tool-runtime";
import type { ToolBodyResult } from "@actspace/tool-runtime";

function context(sessionId = "session", notifyAgent?: (content: RuntimeJsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.image-inspection", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeJsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeJsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeToolPorts as createNodeToolPorts } from "../node-ports.js";
describe("image-inspection ports", () => {
  it("passes the parent execution identity and cancellation signal to the inspector", async () => {
    const execution = context("owner");
    const inspect = vi.fn(async () => "A valid image.");
    const ports = createNodeToolPorts({
      readArtifact: async () => ({ bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), mediaType: "image/png" }),
      inspect,
    });
    await expect(ports.inspect_image!({ artifact_id: "image", question: "Describe it" }, execution)).resolves.toMatchObject({ status: "completed" });
    expect(inspect).toHaveBeenCalledWith({
      sessionId: "owner", agentRunId: "run", turnId: "turn", stepId: "step", callId: "call",
      artifactId: "image", mediaType: "image/png", question: "Describe it", signal: execution.signal,
    });
  });
  it("inspects only a Session-bound image artifact", async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]); const reads: string[] = []; const inspections: string[] = [];
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
