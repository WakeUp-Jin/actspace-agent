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
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.image-generation", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

import { createNodeToolPorts as createNodeToolPorts } from "../node-ports.js";
describe("image-generation ports", () => {
  it("generates image artifacts from Host-injected credentials without exposing the key", async () => {
    const root = await workspace(); const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]); let authorization = "";
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const ports = createNodeToolPorts({  generation: { apiKey: "secret-image-key", baseUrl: "https://images.example/v1", model: "image-v1" }, fetchImpl });
    const result = await invoke(ports.generate_image, { prompt: "A precise test image", size: "1024x1024", n: 1 });
    expect(result).toMatchObject({ status: "completed", artifacts: [{ artifactId: "artifact", mediaType: "image/png" }] });
    expect(authorization).toBe("Bearer secret-image-key");
    expect(JSON.stringify(result)).not.toContain("secret-image-key");
  });
  it("normalizes an HTML image-provider response instead of leaking a JSON parser error", async () => {
    const root = await workspace();
    const fetchImpl = (async () => new Response("<!doctype html><html><body>Gateway error</body></html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    const ports = createNodeToolPorts({  generation: { apiKey: "secret-image-key", baseUrl: "https://images.example/v1", model: "image-v1" }, fetchImpl });
    const result = await invoke(ports.generate_image, { prompt: "A precise test image", size: "1024x1024", n: 1 });
    expect(result).toMatchObject({ status: "failed", failure: { code: "IMAGE_GENERATION_INVALID_RESPONSE" } });
    expect(JSON.stringify(result)).toContain("returned HTML instead of JSON");
    expect(JSON.stringify(result)).not.toContain("<!doctype");
  });
});
async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}
