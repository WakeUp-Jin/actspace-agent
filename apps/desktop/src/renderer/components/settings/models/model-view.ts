import {
  THINKING_LEVELS,
  type ConnectionModelView,
  type ConnectionView,
  type EffectiveModel,
  type ModelOverrides,
  type ModelRates,
  type ModelThinking,
  type ProviderLogoKey,
  type PurposeBinding,
  type PurposeId,
  type ThinkingLevel,
} from "@actspace/shared";

/** 设置 › 模型的格式化与判断。纯函数，组件只管排版。 */

export type PurposeMeta = { id: PurposeId; label: string; description: string; follow?: PurposeId; needImage?: boolean };

// 自动审批不设时由后端退回会话默认模型（不是轻量任务），这里照实写。
export const PURPOSES: readonly PurposeMeta[] = [
  { id: "chat", label: "会话默认", description: "新会话一开始用的模型" },
  { id: "utility", label: "轻量任务", description: "起标题、写摘要、压缩上下文", follow: "chat" },
  { id: "autoReview", label: "自动审批", description: "判断工具调用能否自动放行", follow: "chat" },
  { id: "explore", label: "子 Agent 探索", description: "读代码、搜资料的子 Agent", follow: "chat" },
  { id: "vision", label: "看图", description: "当前模型看不了图时，由它代看", follow: "chat", needImage: true },
];

export const LEVEL_LABELS: Record<ThinkingLevel, string> = { off: "关", low: "低", medium: "中", high: "高", xhigh: "超高", max: "最高" };
export const LEVEL_DESCRIPTIONS: Record<ThinkingLevel, string> = {
  off: "不思考，直接回答",
  low: "少量推理，较快",
  medium: "均衡",
  high: "复杂任务",
  xhigh: "更深入，更慢更贵",
  max: "最多推理，最慢",
};

export type ThinkingKind = "unknown" | "none" | "toggle" | "always" | "levels" | "mandatory";

export function thinkingKind(thinking: ModelThinking | null): ThinkingKind {
  if (!thinking) return "unknown";
  const on = thinking.levels.filter((level) => level !== "off");
  const canOff = thinking.levels.includes("off");
  if (on.length === 0) return "none";
  if (on.length === 1) return canOff ? "toggle" : "always";
  return canOff ? "levels" : "mandatory";
}

/** 档位在下拉、单选里的叫法：只有开 / 关两档的模型叫「开」「关」。 */
export function levelName(levels: readonly ThinkingLevel[], level: ThinkingLevel): string {
  if (levels.length === 2 && levels.includes("off")) return level === "off" ? "关" : "开";
  return LEVEL_LABELS[level];
}

/** 用途按钮上「模型名 · 档位」里的档位部分；没得选的模型不显示。 */
export function purposeLevelLabel(thinking: ModelThinking | null, level: ThinkingLevel | null): string {
  const kind = thinkingKind(thinking);
  const value = level ?? thinking?.default ?? null;
  if (!value || kind === "unknown" || kind === "none" || kind === "always") return "";
  if (kind === "toggle") return value === "off" ? "思考关" : "思考开";
  return value === "off" ? "思考关" : LEVEL_LABELS[value];
}

export function sortLevels(levels: Iterable<ThinkingLevel>): ThinkingLevel[] {
  const set = new Set(levels);
  return THINKING_LEVELS.filter((level) => set.has(level));
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  return `${Math.round(value / 1000)}K`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${Number(value.toFixed(3))}`;
}

export function formatMultiplier(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** 输入框里的 token 数：整千写成 K，整百万写成 M，按 1024 整除的也写成 K（262144 → 256K）。 */
export function formatTokenInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  if (value % 1_048_576 === 0) return `${value / 1_048_576}M`;
  if (value % 1000 === 0) return `${value / 1000}K`;
  if (value % 1024 === 0) return `${value / 1024}K`;
  return String(value);
}

/** 解析 token 数，接受 128000、128K、1M；空 → null，非法 → undefined。 */
export function parseTokens(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const match = /^(\d+(?:\.\d+)?)\s*([kKmM]?)$/.exec(trimmed);
  if (!match) return undefined;
  const unit = match[2].toLowerCase();
  const value = Math.round(Number(match[1]) * (unit === "m" ? 1_000_000 : unit === "k" ? 1000 : 1));
  return value > 0 ? value : undefined;
}

/** 输入框里的价格：去掉多余的小数位，未知为空。 */
export function formatRateInput(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "" : String(Number(value.toFixed(6)));
}

/** 解析用户输入的正数；空 → null，非法 → undefined。 */
export function parsePositive(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseRate(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/^\$/, "");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** 收起时行尾的摘要：「256K · 思考高 · 看图」。什么都不知道的模型没有摘要。 */
export function modelMeta(effective: EffectiveModel): string {
  const parts: string[] = [];
  if (effective.contextWindow) parts.push(formatTokens(effective.contextWindow));
  const thinking = effective.thinking;
  const kind = thinkingKind(thinking);
  if (kind === "toggle") parts.push(thinking!.default === "off" ? "思考关" : "思考开");
  else if (kind === "levels" || kind === "mandatory") parts.push(thinking!.default === "off" ? "思考关" : `思考${LEVEL_LABELS[thinking!.default ?? "medium"]}`);
  else if (kind === "always") parts.push("始终思考");
  if (canSeeImages(effective)) parts.push("看图");
  return parts.join(" · ");
}

/** 字段旁的「已修改 · 恢复」：只有目录认得的模型才有可恢复的值。 */
export function canRestore(effective: EffectiveModel, field: keyof EffectiveModel["sources"]): boolean {
  if (effective.sources[field] !== "user") return false;
  return field === "label" || Boolean(effective.catalog?.exact) || effective.aliased;
}

/** 名字后面那句灰黄小字：什么都不知道的模型才有。 */
export function unknownNote(effective: EffectiveModel): string | null {
  if (effective.sources.contextWindow !== "unknown" || effective.sources.thinking !== "unknown") return null;
  return effective.catalog && !effective.catalog.exact ? `像是 ${effective.catalog.name} 的日期版本` : "不在模型目录中";
}

/** 展开区只给三项关键信息的模型：目录或服务商给齐了上下文。其余要展开完整字段让用户补。 */
export function isWellKnown(effective: EffectiveModel): boolean {
  return Boolean(effective.catalog?.exact) || effective.aliased || effective.sources.contextWindow === "provider";
}

export function canSeeImages(effective: EffectiveModel): boolean {
  return effective.input.includes("image");
}

export function pendingCount(connection: ConnectionView): number {
  return connection.models.filter((model) => unknownNote(model.effective) !== null).length;
}

/** 价格后面的「×倍率」：只有参考价乘了倍率才显示。 */
export function rateMultiplierNote(effective: EffectiveModel): string | null {
  return effective.ratesScaled && effective.multiplier !== 1 ? `×${formatMultiplier(effective.multiplier)}` : null;
}

export function withOverride<K extends keyof ModelOverrides>(overrides: ModelOverrides | null, field: K, value: ModelOverrides[K] | undefined): ModelOverrides | null {
  const next: ModelOverrides = { ...(overrides ?? {}) };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return Object.keys(next).length > 0 ? next : null;
}

/** 勾选 / 取消一个思考档位；默认档位不在新列表里时交给后端按规则补。 */
export function toggleLevel(thinking: ModelThinking | null, level: ThinkingLevel): ModelThinking {
  const current = new Set(thinking?.levels ?? []);
  if (current.has(level)) current.delete(level);
  else current.add(level);
  const levels = sortLevels(current);
  return thinking?.default && levels.includes(thinking.default) ? { levels, default: thinking.default } : { levels };
}

export const EMPTY_RATES: ModelRates = { input: 0, output: 0, cacheRead: null, cacheWrite: null };

export type PickerGroup = { connection: ConnectionView; models: ConnectionModelView[] };

/** 选择器左栏：模型按连接分组；看图只列能看图的。 */
export function pickerGroups(connections: readonly ConnectionView[], purpose: PurposeMeta, query: string): PickerGroup[] {
  const q = query.trim().toLowerCase();
  return connections
    .filter((connection) => connection.enabled)
    .map((connection) => ({
      connection,
      models: connection.models.filter((model) => (!purpose.needImage || canSeeImages(model.effective))
        && (!q || model.apiModel.toLowerCase().includes(q) || model.effective.label.toLowerCase().includes(q))),
    }))
    .filter((group) => group.models.length > 0);
}

export function findModel(connections: readonly ConnectionView[], key: string | null): ConnectionModelView | null {
  if (!key) return null;
  for (const connection of connections) {
    const model = connection.models.find((item) => item.key === key);
    if (model) return model;
  }
  return null;
}

export function purposeSummary(connections: readonly ConnectionView[], binding: PurposeBinding): { label: string; level: string; missing: boolean } | null {
  if (!binding.model) return null;
  const model = findModel(connections, binding.model);
  if (!model) return { label: "模型已不可用，重新选择", level: "", missing: true };
  return { label: model.effective.label, level: purposeLevelLabel(model.effective.thinking, binding.thinking), missing: false };
}

const FAMILY_LOGOS: readonly [RegExp, ProviderLogoKey][] = [
  [/^claude/, "anthropic"],
  [/^(gpt|o\d|chatgpt|codex)/, "openai"],
  [/^deepseek/, "deepseek"],
  [/^(kimi|moonshot)/, "moonshot"],
  [/^glm/, "zai"],
  [/^minimax/, "minimax"],
  [/^mimo/, "xiaomi"],
  [/^doubao/, "volcengine"],
  [/^qwen/, "alibaba"],
  [/^grok/, "grok"],
  [/^(mistral|codestral|devstral)/, "mistral"],
];

/** 模型家族 mark：按目录 id（没有就按原始 id）前缀认，认不出返回 null。 */
export function familyLogo(model: { apiModel: string; effective: EffectiveModel }): ProviderLogoKey | null {
  const id = (model.effective.catalog?.exact ? model.effective.catalog.apiModel : model.apiModel).split("/").pop()!.toLowerCase();
  return FAMILY_LOGOS.find(([pattern]) => pattern.test(id))?.[1] ?? null;
}
