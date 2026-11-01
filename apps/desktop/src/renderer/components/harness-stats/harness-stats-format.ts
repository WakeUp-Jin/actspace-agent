import type { HarnessPluginSource, HarnessRevisionInfo, HarnessRevisionKey, HarnessStatsSessionKind } from "@actspace/shared";
import { CONTEXT_BUCKET_REGISTRY, HARNESS_UNKNOWN_REVISION, getContextBucketDisplay } from "@actspace/shared";

/** null / 非有限数一律显示「—」。 */
export const DASH = "—";

export function fmtInt(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? DASH : Math.round(value).toLocaleString("zh-CN");
}

/** 比例（0–1）转百分数；null 显示「—」。 */
export function fmtPct(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? DASH : `${(value * 100).toFixed(digits)}%`;
}

/** 带正负号的变化率，如 +3.2% / -6.2%。 */
export function fmtSignedPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

/** token 数的紧凑写法：12,345 → 12.3k，1,200,000 → 1.2M。 */
export function fmtTokens(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e4) return `${(value / 1e3).toFixed(1)}k`;
  return fmtInt(value);
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return DASH;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** 直方图分位数是所在档的上界，文案写「约」。 */
export function fmtApproxDuration(ms: number | null | undefined): string {
  return ms == null || !Number.isFinite(ms) ? DASH : `约 ${fmtDuration(ms)}`;
}
export function fmtApproxTokens(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? DASH : `约 ${fmtTokens(value)}`;
}

export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return DASH;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** ISO 时间 → 今天 / 昨天 / MM-DD；null 或无法解析显示「—」。`now` 只给测试用。 */
export function fmtDay(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 趋势图的日期标签：2026-10-31 → 10-31。 */
export function fmtShortDay(day: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(day) ? day.slice(5, 10) : day;
}

/** `<harnessId>@<revision>` → r8；找不到信息时回退到 key 本身。 */
export function revisionLabel(key: HarnessRevisionKey | null | undefined, revisions?: readonly HarnessRevisionInfo[]): string {
  if (!key) return DASH;
  if (key === HARNESS_UNKNOWN_REVISION) return "未知版本";
  const info = revisions?.find((item) => item.key === key);
  if (info?.revision != null) return `r${info.revision}`;
  const at = key.lastIndexOf("@");
  return at >= 0 && /^\d+$/.test(key.slice(at + 1)) ? `r${key.slice(at + 1)}` : key;
}

export function workspaceLabel(root: string): string {
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}

export const SOURCE_LABEL: Record<HarnessPluginSource, string> = { builtin: "内置", user: "用户安装", evolved: "自进化", unknown: "来源未知" };

export const SESSION_KIND_OPTIONS: ReadonlyArray<{ value: HarnessStatsSessionKind; label: string }> = [
  { value: "main", label: "主会话" },
  { value: "child", label: "子 Agent" },
  { value: "side", label: "侧边对话" },
  { value: "all", label: "全部会话" },
];

const BUCKET_LABEL: Record<string, string> = {
  systemPrompt: "系统提示词",
  tools: "工具定义",
  rules: "规则",
  skills: "Skills",
  summarizedConversation: "压缩摘要",
  conversation: "对话",
};

export type BucketSegment = { readonly key: string; readonly label: string; readonly colorVar: string; readonly tokens: number; readonly share: number };

/** 6 类上下文：按注册表顺序排列，缺失的类不画；未知 key 排在最后用兜底色。 */
export function bucketSegments(buckets: readonly { readonly bucket: string; readonly avgTokens: number }[]): BucketSegment[] {
  const known = new Set<string>(CONTEXT_BUCKET_REGISTRY.map((entry) => entry.key));
  const sorted = [...buckets].filter((item) => item.avgTokens > 0).sort((a, b) => getContextBucketDisplay(a.bucket).order - getContextBucketDisplay(b.bucket).order);
  const total = sorted.reduce((sum, item) => sum + item.avgTokens, 0);
  return sorted.map((item) => ({
    key: item.bucket,
    label: known.has(item.bucket) ? (BUCKET_LABEL[item.bucket] ?? getContextBucketDisplay(item.bucket).label) : item.bucket,
    colorVar: getContextBucketDisplay(item.bucket).colorVar,
    tokens: item.avgTokens,
    share: total > 0 ? item.avgTokens / total : 0,
  }));
}

export const ACTIVE_HISTOGRAM_LABELS = ["0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60–69", "70–79", "80–89", "90–99", "100"];
export const SLEEP_HISTOGRAM_LABELS = ["1", "2", "3", "4", "5", "6+"];
export const STEPS_BETWEEN_LABELS = ["<10", "10–19", "20–29", "30–39", "40–49", "50–59", "60–69", "70–79", "80+"];
export const TURN_STEPS_LABELS = ["1", "2–3", "4–5", "6–8", "9–12", "13–16", "17–24", "25–32", "33–48", "49–64", "65+"];

/** 工具调用率：被调用次数 ÷ 出现在多少次请求里。 */
export function callRate(calls: number, exposures: number): number | null {
  return ratio(calls, exposures);
}

/** 每次调用摊到的定义 token：定义 token × 出现次数 ÷ 调用次数。 */
export function costPerCall(schemaTokens: number | null, exposures: number, calls: number): number | null {
  return schemaTokens == null || calls <= 0 ? null : (schemaTokens * exposures) / calls;
}
