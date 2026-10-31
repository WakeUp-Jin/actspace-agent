import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type {
  TrajectoryApproval,
  TrajectoryCell,
  TrajectoryCellKind,
  TrajectoryGroup,
  TrajectoryLayout,
  TrajectoryLayoutTurn,
  TrajectoryRecord,
  TrajectoryRuntimeSnapshot,
  TrajectoryTableRow,
} from "./contract";
import { parseTimestamp } from "./format";
import { deriveRequests, requestKeyOf } from "./requests";
import { T, stepLabel, stepsSummary, toolCallsSummary } from "./strings";

type Data = Readonly<Record<string, RuntimeV2JsonValue>>;
const asData = (value: RuntimeV2JsonValue | undefined): Data =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const firstSeq = (record: TrajectoryRecord) => record.sourceSequences[0] ?? 0;

function cellKind(record: TrajectoryRecord): TrajectoryCellKind | null {
  switch (record.kind) {
    case "system": return "system";
    case "user": return "user";
    case "context": return "context";
    case "assistant": return "message";
    case "tool": return record.parentCallId ? "subtool" : "tool";
    case "compaction": return "compacted";
    default: return null;
  }
}

/** Approval folds into the tool row: the last permission event per call wins. */
function approvals(raw: readonly TrajectoryRecord[]): Map<string, TrajectoryApproval> {
  const result = new Map<string, TrajectoryApproval>();
  for (const record of raw) {
    if (record.callId === null) continue;
    if (record.eventType === "permission/asked") result.set(record.callId, "pending");
    if (record.eventType === "permission/decided") {
      const data = asData(record.raw);
      const decision = String(data.kind ?? data.decision ?? "");
      result.set(record.callId, decision === "deny" || decision === "denied" || decision === "rejected" ? "denied" : "allowed");
    }
  }
  return result;
}

function groupOf(record: TrajectoryRecord, kind: TrajectoryCellKind): { key: string; title: string } {
  if (kind === "system") return { key: "system", title: T.messageGroup };
  if (kind === "compacted") return { key: `compaction:${record.id}`, title: T.compactionPurpose };
  if (kind === "user" || kind === "context" || record.stepId === null) return { key: "message", title: T.messageGroup };
  return { key: `step:${record.stepId}`, title: record.stepNumber === null ? T.messageGroup : stepLabel(record.stepNumber) };
}

/** Builder records → DSH Turn → Group → Cell. Requests that have no visible record yet become request-only cells. */
export function deriveLayout(runtime: TrajectoryRuntimeSnapshot): TrajectoryLayout {
  const raw = runtime.rawRecords ?? [];
  const turnNumber = new Map(runtime.turns.map(turn => [turn.id, turn.number]));
  const requests = deriveRequests(runtime);
  const approval = approvals(raw);
  const covered = new Set(runtime.records.map(record => requestKeyOf(record, requests)).filter(Boolean));
  const pending = raw.filter(record => {
    if (record.eventType !== "request/header" && record.eventType !== "llm/auxiliary-start" && record.eventType !== "llm/auxiliary-end") return false;
    const key = requests.byRequestId.get(record.requestId ?? "");
    return key !== undefined && !covered.has(key) && covered.add(key);
  });

  const ordered: { record: TrajectoryRecord; requestOnly: boolean }[] = [];
  for (const record of runtime.records) {
    while (pending[0] && record.systemChange !== "initial" && firstSeq(pending[0]) < firstSeq(record)) ordered.push({ record: pending.shift()!, requestOnly: true });
    ordered.push({ record, requestOnly: false });
  }
  ordered.push(...pending.map(record => ({ record, requestOnly: true })));

  const cells: TrajectoryCell[] = [];
  const turns: { section: number; turn: number | null; groups: { key: string; title: string; cells: TrajectoryCell[] }[] }[] = [];
  for (const { record, requestOnly } of ordered) {
    const kind = requestOnly ? "message" : cellKind(record);
    if (kind === null) continue;
    const turn = record.turnNumber ?? (record.turnId === null ? null : turnNumber.get(record.turnId) ?? null);
    const group = requestOnly ? { key: `step:${record.stepId}`, title: T.messageGroup } : groupOf(record, kind);
    const metrics = record.assistantMetrics;
    const timed = kind === "message" && metrics?.stepStartTime != null && metrics.completedTime != null ? metrics.completedTime - metrics.stepStartTime : null;
    const cell: TrajectoryCell = {
      index: cells.length + 1,
      recordId: record.id,
      record,
      kind,
      turn,
      group: group.key,
      requestKey: requestKeyOf(record, requests) ?? (kind === "compacted" ? `compaction:${record.id}` : null),
      requestOnly,
      startedAt: parseTimestamp(record.startedAt),
      durationMs: requestOnly ? null : timed ?? record.durationMs,
      isError: !requestOnly && (record.isError || record.state === "failed" || (kind === "message" && record.state === "aborted")),
      approval: record.callId === null ? null : approval.get(record.callId) ?? null,
    };
    cells.push(cell);
    let section = turns.at(-1);
    if (section === undefined || section.turn !== turn) {
      section = { section: turns.length, turn, groups: [] };
      turns.push(section);
    }
    const last = section.groups.at(-1);
    if (last?.key === group.key) last.cells.push(cell);
    else section.groups.push({ ...group, cells: [cell] });
  }
  return { turns: turns as readonly TrajectoryLayoutTurn[], cells, requests: requests.finish(cells) };
}

type Row = { -readonly [K in keyof TrajectoryTableRow]: TrajectoryTableRow[K] };
const rowKey = (cell: TrajectoryCell, collapsed?: "turn" | "assistant") =>
  collapsed === undefined ? cell.recordId : `${cell.recordId}\u0000summary\u0000${collapsed}`;
const opensTurn = (cell: TrajectoryCell) => !cell.requestOnly && cell.kind !== "system" && (cell.kind !== "compacted" || cell.turn === null);

/** DSH flattenRecords: the turn label sits on the first suitable record of each section. */
export function flattenLayout(turns: readonly TrajectoryLayoutTurn[]): TrajectoryTableRow[] {
  return turns.flatMap(turn => {
    let first = true;
    const rows: Row[] = turn.groups.flatMap((group: TrajectoryGroup) => group.cells.map((cell, index) => {
      const turnStart = first && opensTurn(cell);
      if (turnStart) first = false;
      return { key: rowKey(cell), cell, section: turn.section, groupStart: index === 0, turnStart, turnEnd: false };
    }));
    const last = rows.at(-1);
    if (last) last.turnEnd = true;
    return rows;
  });
}

/** Search keeps matching rows only and recomputes group/turn edges. */
export function filterRows(rows: readonly TrajectoryTableRow[], matches: ReadonlySet<string>): TrajectoryTableRow[] {
  const filtered: Row[] = rows.filter(row => !row.cell.requestOnly && matches.has(row.cell.recordId))
    .map(row => ({ ...row, groupStart: false, turnStart: false, turnEnd: false }));
  const started = new Set<number>();
  filtered.forEach((row, index) => {
    const previous = filtered[index - 1];
    const next = filtered[index + 1];
    row.groupStart = previous === undefined || previous.section !== row.section || previous.cell.group !== row.cell.group;
    row.turnStart = !started.has(row.section) && opensTurn(row.cell);
    if (row.turnStart) started.add(row.section);
    row.turnEnd = next === undefined || next.section !== row.section;
  });
  return filtered;
}

const isToolCell = (cell: TrajectoryCell) => cell.kind === "tool" || cell.kind === "subtool";

function summarizeTurn(rows: readonly TrajectoryTableRow[], layout: TrajectoryLayout): string {
  const steps = new Set(rows.map(row => row.cell.requestKey).filter(key => key !== null && layout.requests.has(key))).size;
  return [stepsSummary(steps), toolCallsSummary(rows.filter(row => isToolCell(row.cell)).length)].join(" · ");
}

/** A folded turn keeps its first content row and adds one summary row. */
export function collapseTurns(rows: readonly TrajectoryTableRow[], collapsed: ReadonlySet<number>, layout: TrajectoryLayout): TrajectoryTableRow[] {
  if (collapsed.size === 0) return [...rows];
  const content = new Map<number, TrajectoryTableRow[]>();
  for (const row of rows) {
    if (row.cell.turn === null || row.cell.requestOnly || row.cell.kind === "system") continue;
    content.set(row.cell.turn, [...(content.get(row.cell.turn) ?? []), row]);
  }
  return rows.flatMap(row => {
    const turn = row.cell.turn;
    if (turn === null || !collapsed.has(turn) || row.cell.requestOnly || row.cell.kind === "system") return [row];
    const turnRows = content.get(turn) ?? [row];
    if (turnRows.length <= 1) return [row];
    if (row.cell.index !== turnRows[0]!.cell.index) return [];
    return [
      { ...row, turnEnd: false },
      { ...row, key: rowKey(row.cell, "turn"), groupStart: false, turnStart: false, turnEnd: true, collapsed: { kind: "turn" as const, summary: summarizeTurn(turnRows.slice(1), layout) } },
    ];
  });
}

/** A folded assistant hides the tool rows that directly follow it. */
export function collapseAssistants(rows: readonly TrajectoryTableRow[], collapsed: ReadonlySet<string>): TrajectoryTableRow[] {
  if (collapsed.size === 0) return [...rows];
  const out: TrajectoryTableRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    out.push(row);
    if (row.cell.kind !== "message" || !collapsed.has(row.cell.recordId)) continue;
    const calls = assistantCalls(rows, index);
    if (calls.length === 0) continue;
    const names = [...new Set(calls.map(call => call.cell.record.toolName ?? "").filter(Boolean))];
    const summary = toolCallsSummary(calls.length);
    out[out.length - 1] = { ...row, turnEnd: false };
    out.push({ ...row, key: rowKey(row.cell, "assistant"), groupStart: false, turnStart: false, turnEnd: calls.at(-1)!.turnEnd, collapsed: { kind: "assistant", summary: names.length ? `${summary} · ${names.join(", ")}` : summary } });
    index += calls.length;
  }
  return out;
}

/** Tool rows directly after the assistant row at `index`. */
export function assistantCalls(rows: readonly TrajectoryTableRow[], index: number): TrajectoryTableRow[] {
  const calls: TrajectoryTableRow[] = [];
  for (let next = index + 1; next < rows.length; next += 1) {
    const candidate = rows[next]!;
    if (candidate.collapsed || !isToolCell(candidate.cell)) break;
    calls.push(candidate);
  }
  return calls;
}

/** The request dot sits on the first non-input row of each request group. */
export function requestBoundaries(rows: readonly TrajectoryTableRow[], layout: TrajectoryLayout): ReadonlyMap<number, string> {
  const seen = new Set<string>();
  const result = new Map<number, string>();
  for (const { cell } of rows) {
    const key = cell.requestKey;
    if (key === null || !layout.requests.has(key) || seen.has(key) || cell.kind === "user" || cell.kind === "context") continue;
    seen.add(key);
    result.set(cell.index, key);
  }
  return result;
}

/** Consecutive request-only dots fan out by 8px; the content row after them continues the run. */
export function requestBoundaryRuns(rows: readonly TrajectoryTableRow[], layout: TrajectoryLayout): ReadonlyMap<number, number> {
  const result = new Map<number, number>();
  let run = 0;
  for (const row of rows) {
    if (row.cell.requestOnly) { result.set(row.cell.index, run++); continue; }
    if (run > 0 && row.groupStart && row.cell.requestKey !== null && layout.requests.has(row.cell.requestKey)) result.set(row.cell.index, run);
    run = 0;
  }
  return result;
}
