import { describe, expect, it } from "vitest";
import { BUILTIN_MODEL_CATALOG } from "../generated/model-catalog.generated";
import type { ModelCatalogEntry, ModelCatalogPriceOverride } from "../model-catalog";
import { catalogEntryKey, compareCatalogEntries, mergeModelCatalog } from "../model-catalog-merge";
import { MODEL_CATALOG_PRICE_OVERRIDES } from "../model-catalog-overrides";

const entry = (sourceProviderId: string, apiModel: string, input: number | null, patch: Partial<ModelCatalogEntry> = {}): ModelCatalogEntry => ({
  source: "models.dev", sourceProviderId, apiModel, name: apiModel, currency: "USD",
  rates: { input, output: 2, cacheRead: null, cacheWrite: null },
  unsupportedBilling: false, contextWindow: 1000, maxOutput: 100, input: ["text"], reasoning: false, ...patch,
});
const override = (sourceProviderId: string, apiModel: string, input: number): ModelCatalogPriceOverride => ({
  source: "models.dev", sourceProviderId, apiModel, rates: { input, output: 3, cacheRead: null, cacheWrite: null }, sourceUrl: "https://example.test/pricing", checkedAt: "2026-11-08",
});

describe("mergeModelCatalog", () => {
  it("locks existing entries whole, adds new ones and keeps delisted ones", () => {
    const previous = [entry("openai", "a", 1), entry("openai", "gone", 5)];
    const fetched = [entry("openai", "a", 9, { name: "A renamed", contextWindow: 2 }), entry("openai", "new", 4)];
    const { entries, report } = mergeModelCatalog(previous, fetched, []);
    expect(entries.map(catalogEntryKey)).toEqual(["models.dev/openai/a", "models.dev/openai/gone", "models.dev/openai/new"]);
    expect(entries[0]).toEqual(previous[0]);
    expect(report).toMatchObject({ added: ["models.dev/openai/new"], kept: 2, delisted: ["models.dev/openai/gone"], overridden: [] });
    expect(report.locked).toEqual([{ key: "models.dev/openai/a", from: previous[0]!.rates, to: fetched[0]!.rates }]);
  });

  it("keeps the same model under different providers separate", () => {
    const { entries, report } = mergeModelCatalog([entry("openai", "m", 1)], [entry("openai", "m", 1), entry("opencode-go", "m", 7)], []);
    expect(entries.map((row) => [row.sourceProviderId, row.rates.input])).toEqual([["openai", 1], ["opencode-go", 7]]);
    expect(report.locked).toEqual([]);
  });

  it("applies overrides every run, online and offline, without reporting them as locked", () => {
    const previous = [entry("openai", "a", 1)];
    const online = mergeModelCatalog(previous, [entry("openai", "a", 9)], [override("openai", "a", 6)]);
    expect(online.entries[0]!.rates).toEqual({ input: 6, output: 3, cacheRead: null, cacheWrite: null });
    expect(online.report.locked).toEqual([]);
    expect(online.report.overridden).toHaveLength(1);
    const again = mergeModelCatalog(online.entries, null, [override("openai", "a", 6)]);
    expect(again.entries).toEqual(online.entries);
    expect(again.report.overridden).toEqual([]);
  });

  it("rejects an override that names a missing entry, and duplicate existing keys", () => {
    expect(() => mergeModelCatalog([entry("openai", "a", 1)], null, [override("openai", "missing", 1)])).toThrow(/missing/);
    expect(() => mergeModelCatalog([entry("openai", "a", 1), entry("openai", "a", 2)], null, [])).toThrow(/Duplicate/);
  });

  it("offline with no overrides is the identity", () => {
    const previous = [entry("openai", "a", 1), entry("deepseek", "b", null)].sort(compareCatalogEntries);
    expect(mergeModelCatalog(previous, null, []).entries).toEqual(previous);
  });
});

describe("generated catalog", () => {
  it("is sorted, unique and already has every price override applied", () => {
    const rows = BUILTIN_MODEL_CATALOG.entries;
    expect([...rows].sort(compareCatalogEntries)).toEqual(rows);
    expect(new Set(rows.map(catalogEntryKey)).size).toBe(rows.length);
    for (const item of MODEL_CATALOG_PRICE_OVERRIDES) {
      expect(rows.find((row) => catalogEntryKey(row) === catalogEntryKey(item))?.rates, catalogEntryKey(item)).toEqual(item.rates);
      expect(item.sourceUrl).toMatch(/^https:\/\//);
      expect(item.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
