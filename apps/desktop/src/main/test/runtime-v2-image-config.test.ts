// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import { createDesktopCoreToolPorts } from "../runtime-v2/core-tool-ports";
import type { DesktopRuntimeV2ModelPort } from "../runtime-v2/model-port";

afterEach(() => vi.unstubAllGlobals());

it("uses current image configuration for each call, including removal and reconfiguration", async () => {
  let generation: ReturnType<DesktopRuntimeV2ModelPort["getToolEnvironment"]>["imageGeneration"];
  const modelRuntime = {
    getToolEnvironment: () => ({ searchCredentials: {}, imageGeneration: generation }),
    resolveImageInspectionModel: () => ({ ok: false, message: "not configured" }),
  } as DesktopRuntimeV2ModelPort;
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from([137,80,78,71,13,10,26,10,0]).toString("base64") }] }), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchImpl);
  const ports = createDesktopCoreToolPorts({ workspaceRoot: "/workspace", tmpRoot: "/tmp", modelRuntime, llm: {}, readArtifact: async () => { throw new Error("unused"); } });
  const ctx = { signal: new AbortController().signal, createArtifact: async () => ({ artifactId: "image", mediaType: "image/png", size: 9, sha256: "sha" }) } as unknown as ToolExecutionContext;
  const run = () => ports.generate_image!({ prompt: "circle" }, ctx);
  try {
    expect(await run()).toMatchObject({ failure: { code: "IMAGE_GENERATION_NOT_CONFIGURED" } });
    generation = { apiKey: "key-one", model: "image-one", baseUrl: "https://one.example/v1" };
    expect(await run()).toMatchObject({ status: "completed" });
    generation = { apiKey: "key-two", model: "image-two", baseUrl: "https://two.example/v1" };
    expect(await run()).toMatchObject({ status: "completed" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const calls = fetchImpl.mock.calls as unknown as [URL, RequestInit][];
    expect(calls.map(([url]) => String(url))).toEqual(["https://one.example/v1/images/generations", "https://two.example/v1/images/generations"]);
    expect(calls.map(([, init]) => new Headers(init.headers).get("Authorization"))).toEqual(["Bearer key-one", "Bearer key-two"]);
    expect(calls.map(([, init]) => JSON.parse(init.body as string).model)).toEqual(["image-one", "image-two"]);
    generation = undefined;
    expect(await run()).toMatchObject({ failure: { code: "IMAGE_GENERATION_NOT_CONFIGURED" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  } finally { await ports.dispose?.(); }
});
