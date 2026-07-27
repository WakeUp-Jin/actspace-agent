import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ModelMetadataCatalogService } from "../model-metadata-catalog-service";

const NOW = new Date("2026-07-27T12:00:00.000Z");

describe("ModelMetadataCatalogService", () => {
  it("loads public models.dev and OpenRouter metadata without provider credentials", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-model-metadata-test-"));
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBeNull();
      const url = String(input);
      if (url.includes("models.dev")) {
        return new Response(JSON.stringify({
          xai: {
            models: {
              "grok-4.5": {
                id: "grok-4.5",
                name: "Grok 4.5",
                reasoning: true,
                reasoning_options: [{ type: "toggle" }, { type: "effort", values: ["low", "high"] }],
                tool_call: true,
                modalities: { input: ["text", "image"] },
                limit: { context: 256000, output: 32000 },
                cost: { input: 5, output: 30, cache_read: 0.5, cache_write: 6.25 },
              },
            },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: [{
          id: "vendor/alpha",
          name: "Alpha",
          context_length: 128000,
          top_provider: { max_completion_tokens: 16000 },
          architecture: { input_modalities: ["text"] },
          supported_parameters: ["tools", "reasoning"],
          pricing: { prompt: "0.000001", completion: "0.000002", input_cache_read: "0.0000001" },
        }],
      }), { status: 200 });
    });
    const service = new ModelMetadataCatalogService({ dataRoot, fetch: fetchImpl as typeof fetch, now: () => NOW });

    const result = await service.reload();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ state: "ready", stale: false, skippedCount: 0 });
    expect(service.search("grok-4.5").models[0]).toMatchObject({
      source: "models.dev",
      provider: "xai",
      modelId: "grok-4.5",
      capabilities: { input: ["text", "image"], toolUse: "declared", reasoning: true, thinkingToggle: true, reasoningEfforts: ["low", "high"] },
      pricing: { inputCacheHitPerMillion: 0.5, inputCacheMissPerMillion: 5, inputCacheWritePerMillion: 6.25, outputPerMillion: 30 },
    });
    expect(service.search("alpha").models[0]).toMatchObject({
      source: "openrouter",
      pricing: { inputCacheHitPerMillion: 0.1, inputCacheMissPerMillion: 1, outputPerMillion: 2 },
    });

    const reopened = new ModelMetadataCatalogService({ dataRoot, fetch: fetchImpl as typeof fetch, now: () => NOW });
    await reopened.load();
    expect(reopened.find("models.dev:xai:grok-4.5")?.name).toBe("Grok 4.5");
  });

  it("keeps a prior cache visible when both public sources fail", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-model-metadata-test-"));
    let fail = false;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (fail) throw new Error("offline");
      return String(input).includes("models.dev")
        ? new Response(JSON.stringify({ vendor: { models: { alpha: { id: "alpha", name: "Alpha", cost: { input: 1, output: 2 } } } } }), { status: 200 })
        : new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const service = new ModelMetadataCatalogService({ dataRoot, fetch: fetchImpl as typeof fetch, now: () => NOW });
    await service.reload();
    fail = true;

    const result = await service.reload();

    expect(result.state).toBe("stale");
    expect(result.models).toHaveLength(1);
    expect(result.error?.code).toBe("network");
    expect(result.sources.every((source) => source.status === "unavailable")).toBe(true);
  });
});
