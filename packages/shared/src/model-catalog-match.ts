import type { ModelCatalogEntry, ModelCatalogSnapshot } from "./model-catalog";

export type CatalogMatch = { entry: ModelCatalogEntry; exact: boolean };

const DATE_SUFFIX = /-(\d{8}|\d{4}-\d{2}-\d{2}|\d{4}|latest|preview)$/;
const bare = (id: string) => id.trim().split("/").pop()!.replace(/:.*$/, "").toLowerCase();
/** OpenRouter 写 claude-opus-4.5，官方写 claude-opus-4-5；比较时统一成连字符。 */
const loose = (id: string) => bare(id).replace(/\./g, "-");

/**
 * 模型 id → 目录条目。
 * 1. 精确：优先连接模板对应的目录 provider，其次官方 provider，最后 OpenRouter。
 * 2. 去掉 `vendor/` 前缀、点号与连字符视为相同。
 * 3. 日期 / latest 后缀近似：只作为「像是 X 的日期版本」的建议，exact=false，不自动采用。
 */
export function matchCatalogModel(
  catalog: Pick<ModelCatalogSnapshot, "entries">,
  apiModel: string,
  catalogProvider?: string | null,
): CatalogMatch | null {
  const id = apiModel.trim();
  if (!id) return null;
  const index = indexOf(catalog.entries);
  const rank = (entry: ModelCatalogEntry) =>
    entry.sourceProviderId === catalogProvider ? 0 : entry.sourceProviderId !== "openrouter" ? 1 : 2;
  const best = (rows: readonly ModelCatalogEntry[] | undefined) => rows?.length ? [...rows].sort((a, b) => rank(a) - rank(b))[0] : undefined;
  const exact = best(index.exact.get(id));
  if (exact) return { entry: exact, exact: true };
  const key = loose(id);
  const stripped = best(index.loose.get(key));
  if (stripped) return { entry: stripped, exact: true };
  if (!DATE_SUFFIX.test(key)) return null;
  const near = best(index.loose.get(key.replace(DATE_SUFFIX, "")));
  return near ? { entry: near, exact: false } : null;
}

type CatalogIndex = { exact: Map<string, ModelCatalogEntry[]>; loose: Map<string, ModelCatalogEntry[]> };
const indexes = new WeakMap<readonly ModelCatalogEntry[], CatalogIndex>();
/** 目录有上千条，快照每次都要逐个模型匹配；按 entries 数组缓存索引。 */
function indexOf(entries: readonly ModelCatalogEntry[]): CatalogIndex {
  const cached = indexes.get(entries);
  if (cached) return cached;
  const index: CatalogIndex = { exact: new Map(), loose: new Map() };
  const push = (map: Map<string, ModelCatalogEntry[]>, key: string, entry: ModelCatalogEntry) => {
    const rows = map.get(key);
    if (rows) rows.push(entry); else map.set(key, [entry]);
  };
  for (const entry of entries) {
    push(index.exact, entry.apiModel, entry);
    push(index.loose, loose(entry.apiModel), entry);
  }
  indexes.set(entries, index);
  return index;
}

/** 「沿用」已存的是目录 apiModel；按同样的优先级取回条目。 */
export function findCatalogEntry(
  catalog: Pick<ModelCatalogSnapshot, "entries">,
  apiModel: string,
  catalogProvider?: string | null,
): ModelCatalogEntry | null {
  const match = matchCatalogModel(catalog, apiModel, catalogProvider);
  return match?.exact ? match.entry : null;
}
