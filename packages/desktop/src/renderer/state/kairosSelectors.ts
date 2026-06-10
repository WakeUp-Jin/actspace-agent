import type { KairosEventRow, KairosRuntimeState, KairosUsageSummary, SessionEvent } from "@actspace/shared";
import { emptyKairosUsageSummary } from "@actspace/shared";

export type KairosReplySummary = {
  text: string;
  timestamp: string | null;
  row: KairosEventRow | null;
  events: SessionEvent[];
};

export type KairosToolDetail = {
  name: string;
  input: string;
  output: string;
  ok: boolean;
};

export function getKairosDisplayRows(
  rows: KairosEventRow[],
  opts: { newestFirst?: boolean; limit?: number } = {},
): KairosEventRow[] {
  const displayRows = opts.newestFirst === false ? rows.slice() : rows.slice().reverse();
  return typeof opts.limit === "number" ? displayRows.slice(0, opts.limit) : displayRows;
}

export function findLatestKairosReplyEvents(rows: KairosEventRow[], events: SessionEvent[]): SessionEvent[] {
  const latestReply = rows.filter((row) => row.kind === "reply").at(-1);
  if (!latestReply) return [];
  const ids = new Set(latestReply.relatedEventIds);
  return events.filter((event) => ids.has(event.id));
}

export function getLatestKairosReply(events: SessionEvent[], rows: KairosEventRow[]): KairosReplySummary {
  const row = rows.filter((candidate) => candidate.kind === "reply").at(-1) ?? null;
  const replyEvents = row ? findEventsForRow(row, events) : [];
  return {
    text: findKairosReplyText(replyEvents),
    timestamp: row?.startedAt ?? null,
    row,
    events: replyEvents,
  };
}

export function findKairosReplyText(events: SessionEvent[]): string {
  const reply = events
    .filter((event) => event.type === "assistant_message" || event.type === "assistant_reply")
    .at(-1);
  const payload = asRecord(reply?.payload);
  const content = payload?.content;
  return typeof content === "string" ? content : "";
}

/** 从一行 thinking 行的关联事件里取思考全文（payload.content）。 */
export function findKairosThinkingText(events: SessionEvent[]): string {
  const thinking = events.filter((event) => event.type === "thinking").at(-1);
  const payload = asRecord(thinking?.payload);
  const content = payload?.content;
  return typeof content === "string" ? content : "";
}

export function findKairosToolDetail(events: SessionEvent[]): KairosToolDetail | null {
  const call = events.find((event) => event.type === "tool_call");
  const result = events.find((event) => event.type === "tool_result");
  if (!call && !result) return null;
  const callPayload = asRecord(call?.payload);
  const resultPayload = asRecord(result?.payload);
  const name = stringField(resultPayload, "toolName")
    || stringField(callPayload, "name")
    || "tool";
  const input = stringifyCompact(callPayload?.arguments);
  const error = asRecord(resultPayload?.error);
  const output = stringField(resultPayload, "summary")
    || stringField(error, "message")
    || stringifyCompact(resultPayload?.output)
    || stringifyCompact(resultPayload?.result);
  return {
    name,
    input,
    output,
    ok: resultPayload?.ok !== false,
  };
}

/**
 * Header 用量胶囊的展示模式。
 *
 * - `lifetime`：自 Kairos 第一次有 `llm_usage` 起的全期账。`重置今日` 不清，只有删
 *   accumulator 文件才归零。
 * - `sinceReset`：自上一次 `重置今日` 起累计；阶段账。
 */
export type KairosUsageBadgeMode = "lifetime" | "sinceReset";

/**
 * Header 用量胶囊的展示模型。
 *
 * - `mode` / `oppositeMode`：当前展示哪个维度 + 另一维度（点击切换 logo 时跳转目标）。
 * - `tokensLabel` / `costLabel`：当前 mode 下的紧凑展示文本。
 * - `tooltip`：多行明细，hover 展开；明确标注"当前是哪个维度"以及"另一维度的简要数字"，
 *   让用户即便没切换也能瞥一眼总览。
 */
export interface KairosUsageBadgeModel {
  mode: KairosUsageBadgeMode;
  oppositeMode: KairosUsageBadgeMode;
  modeLabel: string;
  oppositeModeLabel: string;
  oppositeModeHint: string;
  summary: KairosUsageSummary;
  hasData: boolean;
  tokensLabel: string;
  costLabel: string | null;
  tooltip: string;
}

const USAGE_MODE_LABELS: Record<KairosUsageBadgeMode, string> = {
  lifetime: "累计",
  sinceReset: "本阶段",
};

/**
 * 数据来源：`KairosRuntimeState.usageLifetime` + `usageSinceReset`，由 KairosController
 * 维护跨重启的双维度累加器后通过 IPC 推过来。
 *
 * 这样可以保证：
 * - 不受 ring buffer 容量限制；
 * - 跨 app 重启不丢账（accumulator 文件持久化）；
 * - `重置今日` 只清"本阶段"，不破坏"累计"——用户对账单的信任。
 *
 * 传入 `null`（state 尚未到位）时两份维度都退化为空 summary，胶囊展示 `0 tok`。
 */
export function buildKairosUsageBadge(
  usage:
    | { lifetime: KairosUsageSummary; sinceReset: KairosUsageSummary }
    | null,
  mode: KairosUsageBadgeMode,
): KairosUsageBadgeModel {
  const lifetime: KairosUsageSummary = usage?.lifetime ?? emptyKairosUsageSummary();
  const sinceReset: KairosUsageSummary = usage?.sinceReset ?? emptyKairosUsageSummary();
  const active = mode === "lifetime" ? lifetime : sinceReset;
  const opposite = mode === "lifetime" ? sinceReset : lifetime;
  const oppositeMode: KairosUsageBadgeMode = mode === "lifetime" ? "sinceReset" : "lifetime";

  const hasData = active.callCount > 0;
  const tokensLabel = `${formatKairosTokenCount(active.totalTokens)} tok`;
  const costLabel = hasData ? formatKairosCost(active.cost, active.currency) : null;

  const modeLabel = USAGE_MODE_LABELS[mode];
  const oppositeModeLabel = USAGE_MODE_LABELS[oppositeMode];
  const oppositeTokens = formatKairosTokenCount(opposite.totalTokens);
  const oppositeCost =
    opposite.callCount > 0
      ? formatKairosCost(opposite.cost, opposite.currency, { precise: true }) ?? "--"
      : "--";
  const oppositeModeHint = `${oppositeModeLabel} ${oppositeTokens} tok · ${oppositeCost}`;

  const tooltipLines: string[] = [];
  tooltipLines.push(`【${modeLabel}】LLM 调用 ${active.callCount} 次 · Token 合计 ${formatKairosTokenCount(active.totalTokens)}`);
  tooltipLines.push(
    `输入 ${formatKairosTokenCount(active.promptTokens)}（缓存命中 ${formatKairosTokenCount(active.cacheHitTokens)}） · 输出 ${formatKairosTokenCount(active.completionTokens)}`,
  );
  if (active.reasoningTokens > 0) {
    tooltipLines.push(`推理 ${formatKairosTokenCount(active.reasoningTokens)}`);
  }
  if (hasData) {
    const costForTooltip = formatKairosCost(active.cost, active.currency, { precise: true });
    tooltipLines.push(`累计成本 ${costForTooltip ?? "--"}${active.currency === "MIXED" ? "（混合币种，按各模型快照估算）" : ""}`);
  } else {
    tooltipLines.push("暂无 LLM 调用记录");
  }
  tooltipLines.push("");
  tooltipLines.push(`点击图标切换至「${oppositeModeLabel}」：${oppositeModeHint}`);

  return {
    mode,
    oppositeMode,
    modeLabel,
    oppositeModeLabel,
    oppositeModeHint,
    summary: active,
    hasData,
    tokensLabel,
    costLabel,
    tooltip: tooltipLines.join("\n"),
  };
}

/**
 * 把整数 token 格式化成 `1.2K` / `15.4K` / `124K` / `1.5M` 这种紧凑形式。
 *
 * - `< 1000` 时直接展示原始整数（`450`、`27` 等）。
 * - 100 以下的 K/M 保留 1 位小数（`15.4K`），避免把"15400 → 15K"这种 6% 误差直接喂给用户。
 * - ≥ 100 K/M 改用整数（`124K`、`15M`），节省宽度。
 * - 非有限值 / 负数视为 0。
 */
export function formatKairosTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 100 ? k.toFixed(1) : Math.round(k)}K`;
  }
  const m = n / 1_000_000;
  return `${m < 100 ? m.toFixed(1) : Math.round(m)}M`;
}

/**
 * 按 `KairosUsageSummary.currency` 选符号格式化成本：
 * - `USD` → `$0.0234`
 * - `CNY` → `¥0.12`
 * - `MIXED` → `≈ $0.02`（混合币种按 USD-equiv 估算，加 `≈` 提醒用户精度有限）
 *
 * `precise` 控制小数位数：
 * - 紧凑模式（默认）：cost < 0.01 用 4 位小数（`$0.0034`），否则 2 位；
 * - precise=true：统一 4 位小数，用于 tooltip 明细。
 */
export function formatKairosCost(
  cost: number,
  currency: KairosUsageSummary["currency"],
  opts: { precise?: boolean } = {},
): string | null {
  if (!Number.isFinite(cost) || cost < 0) return null;
  const symbol = currency === "CNY" ? "¥" : "$";
  const decimals = opts.precise ? 4 : cost < 0.01 ? 4 : 2;
  const body = `${symbol}${cost.toFixed(decimals)}`;
  return currency === "MIXED" ? `≈ ${body}` : body;
}

export function buildKairosStats(
  state: KairosRuntimeState | null,
  rows: KairosEventRow[],
  sleepRemaining: number | null,
): Array<{ label: string; value: string }> {
  const toolCount = rows.filter((row) => row.kind === "tool").length;
  const tickCount = state?.todayTickCount ?? rows.filter((row) => row.kind === "tick").length;
  const errorCount = rows.filter((row) => row.kind === "error" || row.status === "failed").length;
  return [
    { label: "工具调用", value: String(toolCount) },
    { label: "巡检", value: String(tickCount) },
    { label: "异常", value: String(errorCount) },
    { label: "睡眠剩余", value: sleepRemaining === null ? "--" : formatKairosDuration(sleepRemaining) },
  ];
}

export function getKairosStatusLabel(
  state: KairosRuntimeState | null,
  sleepRemaining: number | null,
): string {
  if (!state) return "Loading";
  if (state.state === "sleeping" && sleepRemaining !== null) {
    return `Sleeping · ${formatKairosDuration(sleepRemaining)}`;
  }
  return kairosStateLabel(state.state);
}

export function kairosKindLabel(kind: KairosEventRow["kind"]): string {
  switch (kind) {
    case "reply":
      return "最终回复";
    case "thinking":
      return "思考";
    case "tool":
      return "工具执行";
    case "tick":
      return "巡检";
    case "sleep":
      return "睡眠";
    case "interrupt":
      return "中断";
    case "error":
      return "异常";
  }
}

export function kairosStateLabel(state: KairosRuntimeState["state"]): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "ticking":
      return "Ticking";
    case "sleeping":
      return "Sleeping";
    case "interrupted":
      return "Interrupted";
    case "cooldown":
      return "Cooldown";
    case "stopped":
      return "Stopped";
    case "budget_exhausted":
      return "额度不足";
  }
}

export function findEventsForRow(row: KairosEventRow, events: SessionEvent[]): SessionEvent[] {
  const ids = new Set(row.relatedEventIds);
  return events.filter((event) => ids.has(event.id));
}

export function formatKairosTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatKairosTimeShort(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatKairosDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h${pad2(m)}m`;
  if (m > 0) return `${m}m${pad2(s)}s`;
  return `${s}s`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function stringifyCompact(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
