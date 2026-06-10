import type {
  KairosEventRow,
  KairosRowKind,
  KairosRowStatus,
  KairosUsageSummary,
} from "./kairos-contracts";
import type {
  AssistantMessagePayload,
  EventId,
  ErrorPayload,
  KairosSleepEndPayload,
  KairosSleepInterruptedPayload,
  KairosSleepStartPayload,
  KairosTickInjectedPayload,
  LlmUsageCost,
  LlmUsagePayload,
  SessionEvent,
  ThinkingPayload,
  ToolCallPayload,
  ToolExecutionResult
} from "./session";

const TICK_SUMMARY_MAX = 60;
const REPLY_SUMMARY_MAX = 80;
const THINKING_SUMMARY_MAX = 80;
const TOOL_SUMMARY_MAX = 80;
const ERROR_SUMMARY_MAX = 80;
const INTERRUPT_SUMMARY_MAX = 80;

/**
 * 把"Kairos 短期记忆"中的原始 SessionEvent 流折叠为前端表格行。
 *
 * 规则总览：
 * - 输入按 timestamp 升序；本函数会内部排序一次（O(n log n)）以容错。
 * - 一个 `kairos_tick_injected` 开启一行 `tick` 父行，直到下一个 `kairos_tick_injected`
 *   或事件流结束时关闭；区间内所有 event 的 id 都计入 relatedEventIds。
 * - `tool_call` + 同 toolCallId 的 `tool_result` 折叠成单行 `tool`；缺 result 标 running。
 * - `assistant_message` / `assistant_reply` 各自单行 `reply`。
 * - `thinking` 各自单行 `thinking`（弱化展示；summary 取首行截断）。
 * - `kairos_sleep_start` + 同 turnId 的下一个 sleep_end / sleep_interrupted 折叠成单行 `sleep`；
 *   被打断时**额外**产出一行独立的 `interrupt`。
 * - `error` 各自单行 `error`，并把所在 tick 行的 status 推为 failed。
 *
 * 该函数是**纯函数**，无副作用，shared 包同时被 main 和 renderer 进程消费。
 */
export function aggregateKairosEvents(events: SessionEvent[]): KairosEventRow[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const rows: KairosEventRow[] = [];
  let currentTick: KairosEventRow | null = null;
  const pendingTools = new Map<string, KairosEventRow>();
  let pendingSleep: KairosEventRow | null = null;

  const finalizeTick = (lastTimestamp: string) => {
    if (!currentTick) return;
    currentTick.finishedAt = lastTimestamp;
    currentTick.durationMs = diffMs(currentTick.startedAt, lastTimestamp);
    rows.push(currentTick);
    currentTick = null;
  };

  const attachToTick = (event: SessionEvent) => {
    if (!currentTick) return;
    currentTick.relatedEventIds.push(event.id);
    currentTick.finishedAt = event.timestamp;
  };

  for (const event of sorted) {
    switch (event.type) {
      case "kairos_tick_injected": {
        if (currentTick) finalizeTick(event.timestamp);
        const payload = event.payload as KairosTickInjectedPayload;
        currentTick = {
          id: event.id,
          kind: "tick",
          startedAt: event.timestamp,
          status: "success",
          summary: buildTickSummary(payload),
          relatedEventIds: [event.id]
        };
        break;
      }

      case "tool_call": {
        attachToTick(event);
        const payload = event.payload as ToolCallPayload;
        const row: KairosEventRow = {
          id: event.id,
          kind: "tool",
          startedAt: event.timestamp,
          status: "running",
          summary: buildToolStartSummary(payload),
          relatedEventIds: [event.id]
        };
        pendingTools.set(payload.id, row);
        rows.push(row);
        break;
      }

      case "tool_result": {
        attachToTick(event);
        const payload = event.payload as ToolExecutionResult;
        const toolCallId = payload.toolCallId;
        const row = toolCallId ? pendingTools.get(toolCallId) : undefined;
        if (row) {
          row.finishedAt = event.timestamp;
          row.durationMs = diffMs(row.startedAt, event.timestamp);
          row.status = payload.ok === false ? "failed" : "success";
          row.summary = buildToolFinishSummary(payload, row.summary);
          row.relatedEventIds.push(event.id);
          if (toolCallId) pendingTools.delete(toolCallId);
        }
        // tool_result 无 matching tool_call 时静默忽略——不构造孤立行。
        break;
      }

      case "assistant_message":
      case "assistant_reply": {
        attachToTick(event);
        const payload = event.payload as AssistantMessagePayload;
        rows.push({
          id: event.id,
          kind: "reply",
          startedAt: event.timestamp,
          finishedAt: event.timestamp,
          durationMs: 0,
          status: "success",
          summary: truncate(payload?.content ?? "", REPLY_SUMMARY_MAX),
          relatedEventIds: [event.id]
        });
        break;
      }

      case "thinking": {
        attachToTick(event);
        const payload = event.payload as ThinkingPayload;
        rows.push({
          id: event.id,
          kind: "thinking",
          startedAt: event.timestamp,
          finishedAt: event.timestamp,
          durationMs: 0,
          status: "success",
          summary: truncate(payload?.content ?? "", THINKING_SUMMARY_MAX),
          relatedEventIds: [event.id]
        });
        break;
      }

      case "kairos_sleep_start": {
        attachToTick(event);
        const payload = event.payload as KairosSleepStartPayload;
        const row: KairosEventRow = {
          id: event.id,
          kind: "sleep",
          startedAt: event.timestamp,
          status: "running",
          summary: `Sleep ${payload.plannedSeconds}s (${payload.reason})`,
          relatedEventIds: [event.id]
        };
        pendingSleep = row;
        rows.push(row);
        break;
      }

      case "kairos_sleep_end": {
        attachToTick(event);
        const payload = event.payload as KairosSleepEndPayload;
        if (pendingSleep) {
          pendingSleep.finishedAt = event.timestamp;
          pendingSleep.durationMs = diffMs(pendingSleep.startedAt, event.timestamp);
          pendingSleep.status = "success";
          pendingSleep.summary = `Slept ${payload.actualSeconds}s`;
          pendingSleep.relatedEventIds.push(event.id);
          pendingSleep = null;
        }
        break;
      }

      case "kairos_sleep_interrupted": {
        attachToTick(event);
        const payload = event.payload as KairosSleepInterruptedPayload;
        if (pendingSleep) {
          pendingSleep.finishedAt = event.timestamp;
          pendingSleep.durationMs = diffMs(pendingSleep.startedAt, event.timestamp);
          pendingSleep.status = "interrupted";
          pendingSleep.relatedEventIds.push(event.id);
          pendingSleep = null;
        }
        rows.push({
          id: event.id,
          kind: "interrupt",
          startedAt: event.timestamp,
          finishedAt: event.timestamp,
          durationMs: 0,
          status: "success",
          summary: truncate(`Interrupted by ${payload.reason}`, INTERRUPT_SUMMARY_MAX),
          relatedEventIds: [event.id]
        });
        break;
      }

      case "error": {
        attachToTick(event);
        if (currentTick) currentTick.status = "failed";
        const payload = event.payload as ErrorPayload;
        rows.push({
          id: event.id,
          kind: "error",
          startedAt: event.timestamp,
          finishedAt: event.timestamp,
          durationMs: 0,
          status: "failed",
          summary: truncate(payload?.message ?? "error", ERROR_SUMMARY_MAX),
          relatedEventIds: [event.id]
        });
        break;
      }

      default: {
        attachToTick(event);
        break;
      }
    }
  }

  if (currentTick) {
    const lastTs = currentTick.finishedAt ?? currentTick.startedAt;
    finalizeTick(lastTs);
  }

  return rows.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function buildTickSummary(payload: KairosTickInjectedPayload): string {
  const head = `[${payload.trigger}]`;
  const body = truncate(payload.content ?? "", TICK_SUMMARY_MAX);
  return body ? `${head} ${body}` : head;
}

function buildToolStartSummary(payload: ToolCallPayload): string {
  const argsBrief = briefArgs(payload.arguments);
  return truncate(`${payload.name} ${argsBrief}`.trim(), TOOL_SUMMARY_MAX);
}

function buildToolFinishSummary(result: ToolExecutionResult, fallback: string): string {
  if (result.summary) return truncate(`${result.toolName}: ${result.summary}`, TOOL_SUMMARY_MAX);
  if (result.error?.message) return truncate(`${result.toolName}: ${result.error.message}`, TOOL_SUMMARY_MAX);
  return fallback;
}

function briefArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const path = pickStringField(args, "path", "file", "dir", "filePath");
  if (path) return path;
  const query = pickStringField(args, "query", "pattern", "command");
  if (query) return query;
  return "";
}

function pickStringField(args: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function diffMs(start: string, end: string): number {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, e - s);
}

// ─── llm_usage 聚合 ─────────────────────────────────────────────────────

/**
 * 出厂默认值；controller 启动时若磁盘没有 accumulator 文件就用这个，
 * renderer 在 state 未到位时也用这个保证 UI 渲染兜底。
 */
export function emptyKairosUsageSummary(): KairosUsageSummary {
  return {
    callCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    cost: 0,
    currency: "USD",
  };
}

/**
 * 从一段 SessionEvent 流中聚合出 Kairos 的 token / 成本汇总。
 *
 * 数据来源：Kairos runner 在每次 LLM 回复后落一条 `llm_usage` SessionEvent（含
 * `cost` 字段，按调用时 model-config 价格快照算好）。本函数仅做求和和币种一致性
 * 校验，纯函数、无副作用。
 *
 * **使用范围说明**：当前生产链路上 KairosController 维护跨重启的双维度累加器并通过
 * `KairosRuntimeState.usageLifetime` / `usageSinceReset` 推送给 renderer，因此
 * KairosPage UI 不再直接调用本函数。它保留主要服务于：
 * - 单测 / fixture 校验 controller 的累加结果与事件流一致；
 * - 未来如要做"按时间窗汇总"或"按 brief 维度切片"，可以从事件流派生子集再聚合。
 */
export function aggregateKairosUsage(events: SessionEvent[]): KairosUsageSummary {
  const summary = emptyKairosUsageSummary();
  let seenCurrency: LlmUsageCost["currency"] | null = null;
  let currencyMixed = false;

  for (const event of events) {
    if (event.type !== "llm_usage") continue;
    const payload = event.payload as LlmUsagePayload | undefined;
    if (!payload) continue;

    accumulateKairosUsage(summary, payload, {
      onCurrencyObserved: (currency) => {
        if (seenCurrency === null) {
          seenCurrency = currency;
        } else if (seenCurrency !== currency) {
          currencyMixed = true;
        }
      },
    });
  }

  if (currencyMixed) {
    summary.currency = "MIXED";
  } else if (seenCurrency) {
    summary.currency = seenCurrency;
  }
  return summary;
}

/**
 * 把单条 `LlmUsagePayload` 增量累加到 `summary` 中。
 *
 * KairosController 在 eventSink 收到 `llm_usage` 时调用本函数同步增量更新 lifetime
 * 和 sinceReset 两份累加器；状态通过 `KairosRuntimeState` 推送给 renderer，因此
 * 累计的边界**不再随 ring buffer 滚动而失真**——只要事件成功写盘，就一定累加过。
 *
 * `onCurrencyObserved` 回调把币种一致性校验外推：单条累加时调用方不知道全局
 * "之前见过 USD 还是 CNY"，由外部状态机维护即可，函数本身保持无副作用。
 */
export function accumulateKairosUsage(
  summary: KairosUsageSummary,
  payload: LlmUsagePayload,
  opts: { onCurrencyObserved?: (currency: LlmUsageCost["currency"]) => void } = {},
): void {
  summary.callCount += 1;
  summary.promptTokens += safeNumber(payload.promptTokens);
  summary.completionTokens += safeNumber(payload.completionTokens);
  summary.totalTokens +=
    safeNumber(payload.totalTokens)
    || safeNumber(payload.promptTokens) + safeNumber(payload.completionTokens);
  summary.reasoningTokens += safeNumber(payload.reasoningTokens);
  summary.cacheHitTokens += safeNumber(payload.cacheHitTokens);
  summary.cacheMissTokens += safeNumber(payload.cacheMissTokens);

  const cost = payload.cost;
  if (cost && typeof cost.total === "number" && Number.isFinite(cost.total)) {
    summary.cost += cost.total;
    opts.onCurrencyObserved?.(cost.currency);
  }
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// 显式 re-export，方便消费方按 `import { type KairosRowKind } from "@actspace/shared"` 拿到全套。
export type { KairosEventRow, KairosRowKind, KairosRowStatus };
export type { EventId };
