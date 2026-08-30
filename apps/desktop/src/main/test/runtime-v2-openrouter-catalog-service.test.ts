import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeV2OpenRouterCatalogService } from "../runtime-v2/openrouter-catalog-service";

const NOW = new Date("2026-08-23T08:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RuntimeV2OpenRouterCatalogService", () => {
  it("normalizes, persists, searches, and marks installed OpenRouter models", async () => {
    const root = await temporaryRoot();
    const fetchCatalog = vi.fn(async () => ({
      ok: true as const,
      payload: {
        data: [
          {
            id: "openai/gpt-test",
            name: "GPT Test",
            context_length: 128_000,
            architecture: { input_modalities: ["text", "image"] },
            top_provider: { max_completion_tokens: 8_192 },
            supported_parameters: ["tools", "reasoning"],
            reasoning: { supported_efforts: ["low", "high"], default_effort: "high", default_enabled: true },
            pricing: { prompt: "0.000001", completion: "0.000002" },
          },
          { name: "missing id" },
        ],
      },
    }));
    const service = createService(root, fetchCatalog, (apiModel) => apiModel === "openai/gpt-test");

    const result = await service.reload(runtime());

    expect(result).toMatchObject({ state: "fresh", stale: false, skippedCount: 1 });
    expect(result.models).toEqual([expect.objectContaining({
      provider: "openrouter",
      apiModel: "openai/gpt-test",
      name: "GPT Test",
      contextWindow: 128_000,
      maxTokens: 8_192,
      input: ["text", "image"],
      toolUse: "declared",
      reasoning: true,
      reasoningEfforts: ["low", "high"],
      reasoningDefaultEffort: "high",
      added: true,
      pricing: { currency: "USD", inputCacheHitPerMillion: 1, inputCacheMissPerMillion: 1, outputPerMillion: 2 },
    })]);
    expect(service.list("GPT Test").models).toHaveLength(1);
    expect(service.list("not-present").models).toHaveLength(0);
    const disk = JSON.parse(await readFile(join(root, "providers", "openrouter", "models-cache.json"), "utf8")) as { models: unknown[] };
    expect(disk.models).toHaveLength(1);

    const reloaded = createService(root, vi.fn(), () => false);
    await expect(reloaded.load()).resolves.toMatchObject({ state: "fresh", models: [expect.objectContaining({ apiModel: "openai/gpt-test", added: false })] });
  });

  it("keeps the last good cache when a refresh fails", async () => {
    const root = await temporaryRoot();
    const service = createService(root, async () => ({ ok: true, payload: { data: [{ id: "openai/gpt-test", name: "GPT Test" }] } }), () => false);
    await service.reload(runtime());
    const failing = createService(root, async () => ({ ok: false, code: "network", message: "Model catalog network request failed." }), () => false);
    await failing.load();

    await expect(failing.reload(runtime())).resolves.toMatchObject({
      state: "offline",
      models: [expect.objectContaining({ apiModel: "openai/gpt-test" })],
      error: { code: "network", message: "Model catalog network request failed." },
    });
  });

  it("does not replace last-good data with a malformed successful response", async () => {
    const root = await temporaryRoot();
    const service = createService(root, async () => ({ ok: true, payload: { data: [{ id: "openai/gpt-test", name: "GPT Test" }] } }), () => false);
    await service.reload(runtime());
    const malformed = createService(root, async () => ({ ok: true, payload: { unexpected: [] } }), () => false);
    await malformed.load();

    await expect(malformed.reload(runtime())).resolves.toMatchObject({
      state: "offline",
      models: [expect.objectContaining({ apiModel: "openai/gpt-test" })],
      error: { code: "invalid_payload" },
    });
  });

  it("quarantines malformed cache data instead of trusting nested rows", async () => {
    const root = await temporaryRoot();
    const directory = join(root, "providers", "openrouter");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "models-cache.json"), JSON.stringify({
      version: 1,
      fetchedAt: NOW.toISOString(),
      sourceUrl: "https://openrouter.ai/api/v1/models",
      models: [{ provider: "openrouter", name: "unsafe partial row" }],
      skippedCount: 0,
    }));
    const service = createService(root, vi.fn(), () => false);

    await expect(service.load()).resolves.toMatchObject({ state: "missing", models: [], error: { code: "cache_corrupt" } });
    const names = await readdir(directory);
    expect(names.some((name) => name.startsWith("models-cache.json.corrupt-"))).toBe(true);
    expect(names).not.toContain("models-cache.json");
  });
});

function createService(
  dataRoot: string,
  fetchCatalog: ConstructorParameters<typeof RuntimeV2OpenRouterCatalogService>[0]["fetchCatalog"],
  isAdded: (apiModel: string) => boolean,
): RuntimeV2OpenRouterCatalogService {
  return new RuntimeV2OpenRouterCatalogService({ dataRoot, fetchCatalog, isAdded, now: () => NOW });
}

function runtime() {
  return { provider: "openrouter" as const, apiKey: "secret-openrouter-key", baseUrl: "https://openrouter.ai/api/v1" };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-v2-openrouter-catalog-"));
  roots.push(root);
  return root;
}
