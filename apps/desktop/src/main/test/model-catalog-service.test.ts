// @vitest-environment node
import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { normalizeModelCatalog } from "@actspace/shared";
import { ModelCatalogService, MODEL_CATALOG_TTL_MS } from "../model-catalog-service";

const payload = (url: string) => url.includes("models.dev") ? { deepseek: { models: { m: { id: "m", cost: { input: 1, output: 2 } } } } } : { data: [{ id: "m", pricing: { prompt: "0.000003", completion: "0.000004" } }] };
const parse = async (source: "models.dev" | "openrouter", text: string) => { const entries = normalizeModelCatalog(source, JSON.parse(text)); return { entries, contentHash: createHash("sha256").update(JSON.stringify(entries)).digest("hex") }; };
describe("local pricing catalog", () => {
  it("rejects oversized and empty responses without replacing the local snapshot", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-pricing-"));
    const fetcher = vi.fn(async () => new Response("{}", { headers: { "content-length": String(17 * 1024 * 1024) } }));
    const service = new ModelCatalogService({ dataRoot, fetch: fetcher as typeof fetch, parse });
    const before = service.snapshot();
    await service.refresh(true); expect(service.status().state).toBe("failed"); expect(service.snapshot()).toEqual(before);
    fetcher.mockImplementation(async () => new Response("{}"));
    await service.refresh(true); expect(service.status().state).toBe("failed"); expect(service.snapshot()).toEqual(before);
    service.dispose(); const count = fetcher.mock.calls.length;
    await service.refresh(true); expect(fetcher).toHaveBeenCalledTimes(count);
  });
  it("is local-first, coalesces refreshes, honors TTL and revalidates with cached bodies", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-pricing-"));
    let now = Date.parse(BUILTIN_MODEL_CATALOG.generatedAt) + MODEL_CATALOG_TTL_MS + 1;
    const fetcher = vi.fn(async (url, options) => { expect(options.headers.authorization).toBeUndefined(); return new Response(JSON.stringify(payload(String(url))), { headers: { etag: "fixture" } }); });
    const service = new ModelCatalogService({ dataRoot, now: () => now, fetch: fetcher as typeof fetch, parse });
    await service.load(); service.status(); service.snapshot(); expect(fetcher).not.toHaveBeenCalled();
    await Promise.all([service.refresh(), service.refresh()]); expect(fetcher).toHaveBeenCalledTimes(2);
    await service.refresh(); expect(fetcher).toHaveBeenCalledTimes(2);
    now += MODEL_CATALOG_TTL_MS;
    fetcher.mockImplementation(async (_url, options) => { expect(options.headers["if-none-match"]).toBe("fixture"); return new Response(null, { status: 304 }); });
    await service.refresh(); expect(fetcher).toHaveBeenCalledTimes(4); expect(service.status().entries).toHaveLength(2);
    const restart = new ModelCatalogService({ dataRoot, now: () => now, fetch: fetcher as typeof fetch, parse }); await restart.load(); expect(restart.status().entries).toHaveLength(2);
    service.dispose(); restart.dispose();
  });
  it("retains good data on errors, cools down, and rejects corrupt cache", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-pricing-"));
    let now = Date.parse(BUILTIN_MODEL_CATALOG.generatedAt) + MODEL_CATALOG_TTL_MS + 1;
    const fetcher = vi.fn(async (url) => new Response(JSON.stringify(payload(String(url)))));
    const service = new ModelCatalogService({ dataRoot, now: () => now, fetch: fetcher as typeof fetch, parse }); await service.refresh();
    const before = service.snapshot(); now += MODEL_CATALOG_TTL_MS;
    fetcher.mockImplementation(async () => new Response("bad", { status: 500 }));
    await service.refresh(); expect(service.status().state).toBe("failed"); expect(service.snapshot()).toEqual(before);
    const count = fetcher.mock.calls.length; await service.refresh(); expect(fetcher).toHaveBeenCalledTimes(count);
    const path = join(dataRoot, "model-catalog/models.dev.json"); expect(JSON.parse(await readFile(path, "utf8")).entries).toHaveLength(1);
    await writeFile(path, '{"schemaVersion":1}'); const restart = new ModelCatalogService({ dataRoot, now: () => now }); await restart.load(); expect(restart.snapshot().entries.length).toBeGreaterThan(2);
    service.dispose(); restart.dispose();
  });
});
