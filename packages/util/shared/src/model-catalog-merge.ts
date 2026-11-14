import type { CatalogRates, ModelCatalogEntry, ModelCatalogPriceOverride } from "./model-catalog";

/**
 * 模型目录合并规则（`pnpm models:generate` 使用，运行时不调用）。
 * - 已有条目整条锁定，不随上游变化；上游新条目新增；上游下架的条目保留。
 * - 改价清单每次都重新覆盖对应条目的价格；清单指向不存在的条目时报错。
 * 本文件只允许 type import：生成脚本单独转译并加载它。
 */
export type CatalogPriceChange = { key: string; from: CatalogRates; to: CatalogRates };
export type CatalogMergeReport = {
  added: string[];
  kept: number;
  locked: CatalogPriceChange[];
  delisted: string[];
  overridden: CatalogPriceChange[];
};

export function catalogEntryKey(entry: Pick<ModelCatalogEntry, "source" | "sourceProviderId" | "apiModel">): string {
  return `${entry.source}/${entry.sourceProviderId}/${entry.apiModel}`;
}

const sameRates = (a: CatalogRates, b: CatalogRates) =>
  a.input === b.input && a.output === b.output && a.cacheRead === b.cacheRead && a.cacheWrite === b.cacheWrite;

/** 与 normalizeModelCatalog 的排序一致：先按来源，再按「服务商/模型」。 */
export function compareCatalogEntries(a: ModelCatalogEntry, b: ModelCatalogEntry): number {
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  return `${a.sourceProviderId}/${a.apiModel}`.localeCompare(`${b.sourceProviderId}/${b.apiModel}`);
}

/** `fetched` 为 null 表示离线：只重新应用改价清单。 */
export function mergeModelCatalog(
  previous: readonly ModelCatalogEntry[],
  fetched: readonly ModelCatalogEntry[] | null,
  overrides: readonly ModelCatalogPriceOverride[],
): { entries: ModelCatalogEntry[]; report: CatalogMergeReport } {
  const merged = new Map<string, ModelCatalogEntry>();
  for (const entry of previous) {
    const key = catalogEntryKey(entry);
    if (merged.has(key)) throw new Error(`Duplicate catalog entry: ${key}`);
    merged.set(key, entry);
  }
  const overrideKeys = new Set(overrides.map(catalogEntryKey));
  const report: CatalogMergeReport = { added: [], kept: merged.size, locked: [], delisted: [], overridden: [] };
  if (fetched) {
    const seen = new Set<string>();
    for (const entry of fetched) {
      const key = catalogEntryKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, entry);
        report.added.push(key);
      } else if (!overrideKeys.has(key) && !sameRates(existing.rates, entry.rates)) {
        report.locked.push({ key, from: existing.rates, to: entry.rates });
      }
    }
    report.delisted = previous.map(catalogEntryKey).filter((key) => !seen.has(key));
  }
  for (const override of overrides) {
    const key = catalogEntryKey(override);
    const existing = merged.get(key);
    if (!existing) throw new Error(`Price override has no catalog entry: ${key}`);
    if (!sameRates(existing.rates, override.rates))
      report.overridden.push({ key, from: existing.rates, to: override.rates });
    merged.set(key, { ...existing, rates: { ...override.rates } });
  }
  return { entries: [...merged.values()].sort(compareCatalogEntries), report };
}
