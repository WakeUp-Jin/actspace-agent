import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import { createNodeImageToolPorts } from "../image/node-image-ports.js";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const credential = { apiKey: "secret-key", baseUrl: "https://provider.example/v1", model: "image" };
const args = { prompt: "A blue circle", n: 1 };
function context(): ToolExecutionContext {
  return { signal: new AbortController().signal, createArtifact: vi.fn(async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" })) } as unknown as ToolExecutionContext;
}
function response(data: unknown) { return new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } }); }
function secretError(code: string) {
  return new TypeError("fetch failed https://cdn.example/image?token=secret-token Bearer secret-key", { cause: Object.assign(new Error("private diagnostic secret-token"), { code }) });
}

describe("image failure stages", () => {
  it("reports request network codes without exposing upstream details", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(secretError("ECONNRESET"));
    const ports = createNodeImageToolPorts({ generation: credential, fetchImpl });
    const result = await ports.generate_image!(args, context());
    expect(result).toMatchObject({ failure: { code: "IMAGE_GENERATION_REQUEST_FAILED", retryable: true } });
    expect(result.summary).toContain("ECONNRESET");
    expect(JSON.stringify(result)).not.toMatch(/secret-|cdn\.example/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("separates download failure from invalid provider JSON and bounds the download", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response([{ url: "https://cdn.example/image?token=secret-token" }])).mockRejectedValueOnce(secretError("UND_ERR_CONNECT_TIMEOUT"));
    const ctx = context();
    const ports = createNodeImageToolPorts({ generation: credential, fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    const result = await ports.generate_image!(args, ctx);
    expect(result).toMatchObject({ failure: { code: "IMAGE_GENERATION_DOWNLOAD_FAILED", retryable: false } });
    expect(result.summary).toContain("UND_ERR_CONNECT_TIMEOUT");
    expect(JSON.stringify(result)).not.toMatch(/secret-|cdn\.example/);
    expect(fetchImpl.mock.calls[1]?.[1].signal).not.toBe(ctx.signal);
    expect(ctx.createArtifact).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("separates storage errors and redacts local paths", async () => {
    const ctx = context();
    vi.mocked(ctx.createArtifact).mockRejectedValue(Object.assign(new Error("/private/secret-home/artifact"), { code: "ENOSPC" }));
    const ports = createNodeImageToolPorts({ generation: credential, fetchImpl: vi.fn().mockResolvedValue(response([{ b64_json: png.toString("base64") }])) });
    const result = await ports.generate_image!(args, ctx);
    expect(result).toMatchObject({ failure: { code: "IMAGE_GENERATION_STORAGE_FAILED", retryable: false } });
    expect(result.summary).toContain("ENOSPC");
    expect(JSON.stringify(result)).not.toContain("secret-home");
  });

  it("preserves private URL rejection without issuing a download", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([{ url: "https://127.0.0.1/image" }]));
    const result = await createNodeImageToolPorts({ generation: credential, fetchImpl }).generate_image!(args, context());
    expect(result).toMatchObject({ failure: { code: "IMAGE_GENERATION_DOWNLOAD_FAILED", retryable: false } });
    expect(result.summary).toContain("private network");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps successful images in a partially failed batch without leaking failure details", async () => {
    const ports = createNodeImageToolPorts({ generation: credential, fetchImpl: vi.fn().mockResolvedValue(response([{ b64_json: "invalid!secret" }, { b64_json: png.toString("base64") }])) });
    const result = await ports.generate_image!({ ...args, n: 2 }, context());
    expect(result).toMatchObject({ status: "completed", summary: "Generated 1/2 images." });
    expect(result.artifacts).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("returns aborted rather than a retryable network failure", async () => {
    const controller = new AbortController();
    const ctx = { ...context(), signal: controller.signal };
    const fetchImpl = vi.fn(async () => { controller.abort(); throw secretError("ECONNRESET"); });
    const result = await createNodeImageToolPorts({ generation: credential, fetchImpl }).generate_image!(args, ctx);
    expect(result).toMatchObject({ failure: { code: "TOOL_ABORTED", retryable: false } });
  });
});
