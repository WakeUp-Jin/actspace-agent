import type { InstalledModelView } from "@actspace/shared";

// 连接详情「模型」多选框的纯函数：拆出厂商前缀、按厂商分组、排序、生成触发器摘要。

export type ModelSelectorEntry = {
  model: InstalledModelView;
  /** 去掉厂商前缀后的显示名；用户自定义名称原样保留。 */
  name: string;
  /** 完整名称，用于 title 和搜索。 */
  fullLabel: string;
  vendor: string | null;
  enabled: boolean;
};

export type ModelSelectorGroup = {
  vendor: string | null;
  entries: ModelSelectorEntry[];
  enabledCount: number;
};

const VENDOR_PREFIX = /^([^:：]{1,40})[:：]\s*(.+)$/;

/** 「OpenAI: GPT-5.6」拆成厂商和名称；没有前缀时 vendor 为 null。 */
export function splitVendorLabel(label: string): { vendor: string | null; name: string } {
  const match = VENDOR_PREFIX.exec(label.trim());
  if (!match) return { vendor: null, name: label.trim() };
  return { vendor: match[1].trim(), name: match[2].trim() };
}

export function toSelectorEntry(model: InstalledModelView): ModelSelectorEntry {
  const custom = model.settings.customLabel?.trim();
  const split = splitVendorLabel(model.definition.label);
  return {
    model,
    name: custom || split.name,
    fullLabel: custom || model.definition.label,
    vendor: split.vendor,
    enabled: model.settings.enabled,
  };
}

function compareEntries(a: ModelSelectorEntry, b: ModelSelectorEntry): number {
  if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
  return a.name.localeCompare(b.name, "zh-CN");
}

/**
 * 过滤并分组。至少有两个厂商时才按厂商分组，否则放在一个无标题的组里。
 * 已启用的模型排在组内最前，含已启用模型的组排在前面，其余按厂商名排序。
 */
export function buildModelSelectorGroups(models: InstalledModelView[], options: { query?: string; onlyEnabled?: boolean } = {}): ModelSelectorGroup[] {
  const all = models.map(toSelectorEntry);
  const grouped = new Set(all.map((entry) => entry.vendor).filter(Boolean)).size >= 2;
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const visible = all.filter((entry) => {
    if (options.onlyEnabled && !entry.enabled) return false;
    if (!query) return true;
    return `${entry.fullLabel} ${entry.model.definition.apiModel}`.toLocaleLowerCase().includes(query);
  });
  const byVendor = new Map<string | null, ModelSelectorEntry[]>();
  for (const entry of visible) {
    const key = grouped ? entry.vendor : null;
    byVendor.set(key, [...(byVendor.get(key) ?? []), entry]);
  }
  return [...byVendor.entries()]
    .map(([vendor, entries]) => ({ vendor, entries: entries.sort(compareEntries), enabledCount: entries.filter((entry) => entry.enabled).length }))
    .sort((a, b) => {
      if ((a.enabledCount > 0) !== (b.enabledCount > 0)) return a.enabledCount > 0 ? -1 : 1;
      if (a.vendor === null || b.vendor === null) return a.vendor === null ? 1 : -1;
      return a.vendor.localeCompare(b.vendor, "zh-CN");
    });
}

/** 触发器摘要：启用数、前几个模型的短名、剩余数量。 */
export function summarizeEnabledModels(models: InstalledModelView[], maxNames = 2): { enabled: number; total: number; names: string[]; rest: number } {
  const enabled = models.map(toSelectorEntry).filter((entry) => entry.enabled).sort(compareEntries);
  const names = enabled.slice(0, maxNames).map((entry) => entry.name);
  return { enabled: enabled.length, total: models.length, names, rest: enabled.length - names.length };
}

/** 200000 → 「200K」，1000000 → 「1M」。 */
export function formatContextWindow(tokens: number | null | undefined): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M`;
  return `${Math.round(tokens / 1000)}K`;
}
