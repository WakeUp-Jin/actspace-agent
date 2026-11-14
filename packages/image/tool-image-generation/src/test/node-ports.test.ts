import { describe, expect, it } from "vitest";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tool-runtime";
import type { ToolBodyResult } from "@actspace/tool-runtime";

function context(
  sessionId = "session",
  notifyAgent?: (content: RuntimeJsonValue) => Promise<void>,
  workspaceRoot = "",
): ToolExecutionContext {
  return {
    pluginId: "actspace.image-generation",
    name: "test",
    callId: "call",
    sessionId,
    workspaceRoot,
    agentRunId: "run",
    turnId: "turn",
    stepId: "step",
    signal: new AbortController().signal,
    capabilities: {
      ids: [],
      has: () => false,
      get: () => {
        throw new Error("missing");
      },
    },
    reportProgress: () => undefined,
    createArtifact: async ({ bytes, mediaType }) => ({
      artifactId: "artifact",
      mediaType,
      size: bytes.byteLength,
      sha256: "sha",
    }),
    defer: () => undefined,
    ...(notifyAgent === undefined ? {} : { notifyAgent }),
  };
}
async function invoke(
  handler:
    | ((args: Readonly<Record<string, RuntimeJsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>)
    | undefined,
  args: Readonly<Record<string, RuntimeJsonValue>>,
  sessionId = "session",
  notifyAgent?: (content: RuntimeJsonValue) => Promise<void>,
  workspaceRoot = "",
) {
  if (!handler) throw new Error("handler unavailable");
  return handler(args, context(sessionId, notifyAgent, workspaceRoot));
}

import { createNodeToolPorts as createNodeToolPorts } from "../node-ports.js";
describe("image-generation ports", () => {
  it("generates image artifacts from Host-injected credentials without exposing the key", async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    let authorization = "";
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const ports = createNodeToolPorts({
      generation: { apiKey: "secret-image-key", baseUrl: "https://images.example/v1", model: "image-v1" },
      fetchImpl,
    });
    const result = await invoke(ports.generate_image, { prompt: "A precise test image", size: "1024x1024", n: 1 });
    expect(result).toMatchObject({
      status: "completed",
      artifacts: [{ artifactId: "artifact", mediaType: "image/png" }],
    });
    expect(authorization).toBe("Bearer secret-image-key");
    expect(JSON.stringify(result)).not.toContain("secret-image-key");
  });
  it("normalizes an HTML image-provider response instead of leaking a JSON parser error", async () => {
    const fetchImpl = (async () =>
      new Response("<!doctype html><html><body>Gateway error</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    const ports = createNodeToolPorts({
      generation: { apiKey: "secret-image-key", baseUrl: "https://images.example/v1", model: "image-v1" },
      fetchImpl,
    });
    const result = await invoke(ports.generate_image, { prompt: "A precise test image", size: "1024x1024", n: 1 });
    expect(result).toMatchObject({ status: "failed", failure: { code: "IMAGE_GENERATION_INVALID_RESPONSE" } });
    expect(JSON.stringify(result)).toContain("returned HTML instead of JSON");
    expect(JSON.stringify(result)).not.toContain("<!doctype");
  });
});
