import type { KairosEventRow, KairosRuntimeState, SessionEvent } from "@actspace/shared";

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
