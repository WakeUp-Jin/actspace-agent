import type { KairosEventRow, KairosRowKind, KairosRowStatus } from "./kairos-contracts";
import type {
  AssistantMessagePayload,
  EventId,
  ErrorPayload,
  KairosSleepEndPayload,
  KairosSleepInterruptedPayload,
  KairosSleepStartPayload,
  KairosTickInjectedPayload,
  SessionEvent,
  ToolCallPayload,
  ToolExecutionResult
} from "./session";

const TICK_SUMMARY_MAX = 60;
const REPLY_SUMMARY_MAX = 80;
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

// 显式 re-export，方便消费方按 `import { type KairosRowKind } from "@actspace/shared"` 拿到全套。
export type { KairosEventRow, KairosRowKind, KairosRowStatus };
export type { EventId };
