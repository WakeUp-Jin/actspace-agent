import type { HarnessPluginSource, HarnessRevisionInfo, HarnessRevisionKey, HarnessStatsRange, HarnessStatsSessionKind } from "@actspace/shared";
import { CONTEXT_BUCKET_REGISTRY, HARNESS_UNKNOWN_REVISION, getContextBucketDisplay } from "@actspace/shared";
import { DASH, fmtTokens } from "../stats/stats-format";

// Harness 统计页自己的文案与换算；通用数字格式在 ../stats/stats-format.ts。

/** `<harnessId>@<revision>` → `@12`；找不到信息时回退到 key 本身。 */
export function revisionLabel(key: HarnessRevisionKey | null | undefined, revisions?: readonly HarnessRevisionInfo[]): string {
  if (!key) return DASH;
  if (key === HARNESS_UNKNOWN_REVISION) return "未知版本";
  const info = revisions?.find((item) => item.key === key);
  if (info?.revision != null) return `@${info.revision}`;
  const at = key.lastIndexOf("@");
  return at >= 0 && /^\d+$/.test(key.slice(at + 1)) ? key.slice(at) : key;
}

export const SOURCE_LABEL: Record<HarnessPluginSource, string> = { builtin: "内置", user: "用户", evolved: "自进化", unknown: "来源未知" };

export const SESSION_KIND_OPTIONS: ReadonlyArray<{ value: HarnessStatsSessionKind; label: string }> = [
  { value: "main", label: "主会话" },
  { value: "child", label: "子 Agent" },
  { value: "side", label: "侧边对话" },
  { value: "all", label: "全部会话" },
];

export const RANGE_OPTIONS: ReadonlyArray<{ value: HarnessStatsRange; label: string }> = [
  { value: "day", label: "24 小时" },
  { value: "week", label: "7 天" },
  { value: "month", label: "30 天" },
  { value: "total", label: "全部" },
];

/** 「把<范围>带的 token 加起来」里的范围说法。 */
export const RANGE_WORD: Record<HarnessStatsRange, string> = { day: "这 24 小时", week: "这 7 天", month: "这 30 天", total: "全部时间里" };

export const TRIGGER_LABEL: Record<string, string> = { auto: "自动", manual: "手动" };
export const triggerLabel = (trigger: string) => TRIGGER_LABEL[trigger] ?? "未知";

const BUCKET_LABEL: Record<string, string> = {
  systemPrompt: "系统提示词",
  tools: "工具定义",
  rules: "规则与注入",
  skills: "Skills 目录",
  summarizedConversation: "压缩摘要",
  conversation: "对话",
};

const KNOWN_BUCKETS = new Set<string>(CONTEXT_BUCKET_REGISTRY.map((entry) => entry.key));

export function bucketLabel(bucket: string): string {
  return KNOWN_BUCKETS.has(bucket) ? (BUCKET_LABEL[bucket] ?? getContextBucketDisplay(bucket).label) : bucket;
}

/** 上下文类别的系列色（CSS 变量引用）。 */
export function bucketColor(bucket: string): string {
  return `var(${getContextBucketDisplay(bucket).colorVar})`;
}

export type BucketSegment = { readonly key: string; readonly label: string; readonly colorVar: string; readonly tokens: number; readonly share: number };

/** 6 类上下文：按注册表顺序排列，缺失的类不画；未知 key 排在最后用兜底色。 */
export function bucketSegments(buckets: readonly { readonly bucket: string; readonly avgTokens: number }[]): BucketSegment[] {
  const sorted = [...buckets].filter((item) => item.avgTokens > 0).sort((a, b) => getContextBucketDisplay(a.bucket).order - getContextBucketDisplay(b.bucket).order);
  const total = sorted.reduce((sum, item) => sum + item.avgTokens, 0);
  return sorted.map((item) => ({
    key: item.bucket,
    label: bucketLabel(item.bucket),
    colorVar: getContextBucketDisplay(item.bucket).colorVar,
    tokens: item.avgTokens,
    share: total > 0 ? item.avgTokens / total : 0,
  }));
}

export const ACTIVE_HISTOGRAM_LABELS = ["0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60–69", "70–79", "80–89", "90–99", "100"];
export const SLEEP_HISTOGRAM_LABELS = ["1", "2", "3", "4", "5", "6+"];

/** 变化率达到这个值的非对话来源标「常变 · 打断缓存」。 */
export const CHURN_RATE = 0.2;
export const isChurning = (bucket: string, changeRate: number | null) => bucket !== "conversation" && changeRate != null && changeRate >= CHURN_RATE;

const MINUS = "−";
const sign = (value: number) => (value > 0 ? "+" : value < 0 ? MINUS : "");

/** 带符号的 token 差：+1.2k / −1.7k。 */
export function fmtSignedTokens(value: number): string {
  return `${sign(value)}${fmtTokens(Math.abs(value))}`;
}

/** 两个比例（0–1）的差，写成百分点：+1.3 点 / −4 点。 */
export function fmtPoints(value: number, digits = 1): string {
  return `${sign(value)}${Math.abs(value * 100).toFixed(digits)} 点`;
}

/** 相对变化：+3.2% / −6.2%。 */
export function fmtSignedPct(value: number, digits = 1): string {
  return `${sign(value)}${Math.abs(value * 100).toFixed(digits)}%`;
}

export function fmtSignedInt(value: number): string {
  return `${sign(value)}${Math.abs(Math.round(value))}`;
}

/** 浮点误差内视为持平。 */
export const isFlat = (value: number) => Math.abs(value) < 1e-9;

/* ---------------------------------------------------------------- 占用 vs 使用 */

export type UsageVerdict = "dead" | "hot" | "ok";

/** 从未调用 → dead；调用率 < 1% 且定义 ≥ 300 token → hot（占用高 · 少用）。 */
export function usageVerdict(calls: number, requests: number, tokens: number): UsageVerdict {
  if (calls === 0) return "dead";
  if (requests > 0 && calls / requests < 0.01 && tokens >= 300) return "hot";
  return "ok";
}

/** 每用一次花多少 token：每次请求带的 token × 带的次数 ÷ 调用次数；一次没调用为 Infinity。 */
export function costPerUse(tokens: number, requests: number, calls: number): number {
  return calls > 0 ? (tokens * requests) / calls : Number.POSITIVE_INFINITY;
}
