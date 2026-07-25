import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderProxyError, type ProviderFetch, type ProviderRuntimeConfig } from "@actspace/agent-core";
import { OpenRouterCatalogService } from "../openrouter-catalog-service";

const NOW = new Date("2026-07-24T12:00:00.000Z");
const RUNTIME: ProviderRuntimeConfig = {
  provider: "openrouter",
  apiKey: "sk-secret",
  baseUrl: "https://openrouter.ai/api/v1",
};

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "actspace-catalog-test-"));
}

describe("OpenRouterCatalogService", () => {
  it("normalizes partial rows, preserves unknown pricing, sanitizes text and writes a fresh cache", async () => {
    const dataRoot = await root();
    const fetchImpl: ProviderFetch = async () => new Response(JSON.stringify({ data: [
      {
        id: "vendor/model-a",
        name: `<script>alert(1)</script>\u0000${"x".repeat(300)}`,
        context_length: 128000,
        architecture: { input_modalities: ["text", "image"] },
        top_provider: { max_completion_tokens: 16000 },
        pricing: { prompt: "0.000001", completion: "0.000002", input_cache_read: "0.0000001" },
        supported_parameters: ["tools", "reasoning"],
      },
      { id: "vendor/model-b", name: "No price", architecture: { input_modalities: ["text"] } },
      { name: "missing id" },
    ] }), { status: 200, headers: { "content-type": "application/json" } });
    const service = new OpenRouterCatalogService({ dataRoot, directFetch: fetchImpl, now: () => NOW });
    const result = await service.reload(RUNTIME);

    expect(result.state).toBe("fresh");
    expect(result.skippedCount).toBe(1);
    expect(result.models).toHaveLength(2);
    expect(result.models[0]).toMatchObject({
      apiModel: "vendor/model-a",
      contextWindow: 128000,
      maxTokens: 16000,
      input: ["text", "image"],
      toolUse: "declared",
      reasoning: true,
      isFree: false,
      pricing: { inputCacheHitPerMillion: 0.1, inputCacheMissPerMillion: 1, outputPerMillion: 2 },
    });
    expect(result.models[0].name).not.toContain("\u0000");
    expect(result.models[0].name.length).toBeLessThanOrEqual(180);
    expect(result.models[1].pricing).toBeUndefined();
    const cache = JSON.parse(await readFile(join(dataRoot, "providers/openrouter/models-cache.json"), "utf8"));
    expect(cache.version).toBe(1);
    expect(cache.sourceUrl).toBe("https://openrouter.ai/api/v1/models");
  });

  it.each([[401, "auth"], [402, "insufficient_balance"], [404, "invalid_request"], [429, "rate_limit"], [500, "server"]] as const)("maps HTTP %s to %s", async (status, code) => {
    const service = new OpenRouterCatalogService({ dataRoot: await root(), directFetch: async () => new Response(null, { status }), now: () => NOW });
    const result = await service.reload(RUNTIME);
    expect(result.error?.code).toBe(code);
    expect(JSON.stringify(result)).not.toContain("sk-secret");
  });

  it("keeps stale cache when reload is offline and supports local search", async () => {
    const dataRoot = await root();
    const first = new OpenRouterCatalogService({
      dataRoot,
      directFetch: async () => new Response(JSON.stringify({ data: [{ id: "vendor/alpha", name: "Alpha", pricing: { prompt: "0", completion: "0" } }] }), { status: 200 }),
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });
    await first.reload(RUNTIME);
    const offline = new OpenRouterCatalogService({
      dataRoot,
      directFetch: async () => { throw new Error("offline private detail"); },
      now: () => NOW,
      staleAfterMs: 1,
    });
    expect((await offline.load()).state).toBe("stale");
    const result = await offline.reload(RUNTIME);
    expect(result.state).toBe("offline");
    expect(result.models).toHaveLength(1);
    expect(offline.list("alpha").models).toHaveLength(1);
    expect(offline.list("missing").models).toHaveLength(0);
  });

  it("keeps the previous cache when an updated catalog cannot be written", async () => {
    const dataRoot = await root();
    const cachePath = join(dataRoot, "providers/openrouter/models-cache.json");
    const first = new OpenRouterCatalogService({
      dataRoot,
      directFetch: async () => new Response(JSON.stringify({ data: [{ id: "vendor/old", name: "Old" }] }), { status: 200 }),
      now: () => new Date("2026-07-23T00:00:00.000Z"),
    });
    await first.reload(RUNTIME);
    const oldRaw = await readFile(cachePath, "utf8");

    const failing = new OpenRouterCatalogService({
      dataRoot,
      directFetch: async () => new Response(JSON.stringify({ data: [{ id: "vendor/new", name: "New" }] }), { status: 200 }),
      writeJson: async () => { throw new Error("EACCES private path"); },
      now: () => NOW,
    });
    await failing.load();
    const result = await failing.reload(RUNTIME);

    expect(result.state).toBe("offline");
    expect(result.error?.code).toBe("cache_write");
    expect(result.models.map((model) => model.apiModel)).toEqual(["vendor/old"]);
    expect(JSON.stringify(result)).not.toContain("private path");
    expect(await readFile(cachePath, "utf8")).toBe(oldRaw);
  });

  it("isolates corrupt cache and returns an empty state", async () => {
    const dataRoot = await root();
    const path = join(dataRoot, "providers/openrouter/models-cache.json");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(dataRoot, "providers/openrouter"), { recursive: true }));
    await writeFile(path, "{broken", "utf8");
    const service = new OpenRouterCatalogService({ dataRoot, now: () => NOW });
    const result = await service.load();
    expect(result.state).toBe("missing");
    expect(result.error?.code).toBe("cache_corrupt");
    await expect(readFile(`${path}.corrupt-2026-07-24T12-00-00-000Z`, "utf8")).resolves.toBe("{broken");
  });

  it("classifies timeout and proxy failures without exposing endpoints", async () => {
    const timeoutFetch: ProviderFetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("secret endpoint");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
    const timeout = new OpenRouterCatalogService({ dataRoot: await root(), directFetch: timeoutFetch, timeoutMs: 1, now: () => NOW });
    expect((await timeout.reload(RUNTIME)).error?.code).toBe("timeout");

    const proxy = new OpenRouterCatalogService({
      dataRoot: await root(),
      createFetch: () => { throw new ProviderProxyError({ cause: new Error("http://secret-proxy") }); },
      now: () => NOW,
    });
    const result = await proxy.reload({ ...RUNTIME, transport: { proxyUrl: "http://127.0.0.1:7890" } });
    expect(result.error?.code).toBe("proxy");
    expect(JSON.stringify(result)).not.toContain("127.0.0.1");
  });
});
