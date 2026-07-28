import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateImageExecutor } from "../executor";

const PNG_HEADER_BASE64 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateImageExecutor", () => {
  it("默认 n=1，调用配置模型并把 Base64 图片落到 session artifacts", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        model: "gpt-image-2",
        prompt: "A serene koi pond",
        size: "1024x1024",
        n: 1,
      });
      return new Response(JSON.stringify({ data: [{ b64_json: PNG_HEADER_BASE64 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const artifactRoot = await mkdtemp(join(tmpdir(), "actspace-image-tool-"));

    const result = await generateImageExecutor(
      { prompt: "A serene koi pond" },
      "/workspace",
      {
        artifactRoot,
        imageGeneration: {
          apiKey: "sk-test",
          baseUrl: "https://www.duckcoding.ai/v1",
          model: "gpt-image-2",
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts?.[0]).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(await readFile(result.artifacts?.[0]?.path ?? "")).toEqual(Buffer.from(PNG_HEADER_BASE64, "base64"));
    expect(JSON.stringify(result)).not.toContain(PNG_HEADER_BASE64);
  });

  it.each([0, 1.5, 11])("拒绝越界或非整数 n=%s，不调用网络", async (n) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateImageExecutor(
      { prompt: "test", n },
      "/workspace",
      {
        artifactRoot: "/tmp/unused",
        imageGeneration: { apiKey: "sk-test", baseUrl: "https://example.com/v1", model: "gpt-image-2" },
      },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("1 到 10");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("允许 n=10，并在服务少返回图片时报告 partial", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: PNG_HEADER_BASE64 }, { b64_json: PNG_HEADER_BASE64 }],
    }), { status: 200 })));
    const artifactRoot = await mkdtemp(join(tmpdir(), "actspace-image-tool-"));
    const result = await generateImageExecutor(
      { prompt: "ten variants", n: 10, size: "1536x1024" },
      "/workspace",
      {
        artifactRoot,
        imageGeneration: { apiKey: "sk-test", baseUrl: "https://example.com/v1", model: "gpt-image-2" },
      },
    );
    expect(result.success).toBe(true);
    expect(result.artifacts).toHaveLength(2);
    expect(result.structured).toMatchObject({ status: "partial", requestedCount: 10, generatedCount: 2 });
  });
});
