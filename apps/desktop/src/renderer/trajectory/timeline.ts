import type { TrajectoryCell, TrajectoryCellKind, TrajectoryLayoutTurn, TrajectoryTimeline, TrajectoryTimelineMode, TrajectoryTimelineSpan, TrajectoryTimeRange } from "./contract";

const laneFor = (kind: TrajectoryCellKind): 0 | 1 | 2 => kind === "tool" || kind === "subtool" ? 2 : kind === "message" || kind === "compacted" ? 1 : 0;
const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);

function assistantTiming(cell: TrajectoryCell): { ttftMs: number | null; decodingMs: number | null } {
  const metrics = cell.record.assistantMetrics;
  if (!metrics?.timingRecorded || !finite(metrics.ttftMs) || !finite(metrics.generationMs)) return { ttftMs: null, decodingMs: null };
  return { ttftMs: metrics.ttftMs, decodingMs: metrics.generationMs };
}

const span = (cell: TrajectoryCell, range: TrajectoryTimeRange): TrajectoryTimelineSpan => ({
  ...range, index: cell.index, recordId: cell.recordId, kind: cell.kind, lane: laneFor(cell.kind), isError: cell.isError,
  startedAt: finite(cell.startedAt) ? cell.startedAt : null,
  durationMs: finite(cell.durationMs) ? Math.max(0, cell.durationMs) : null,
  ...assistantTiming(cell),
});

const visibleCells = (turn: TrajectoryLayoutTurn) => turn.groups.flatMap(group => group.cells.filter(cell => !cell.requestOnly));

/**
 * DSH timeline projection. `sequence` gives each record equal width; `duration` uses recorded
 * durations and removes idle gaps; `actual` keeps the gaps; `time` keeps gaps with zero-width records.
 * Running records with no known duration count as zero, so the model does not grow with the clock.
 */
export function deriveTimeline(turns: readonly TrajectoryLayoutTurn[], mode: TrajectoryTimelineMode = "sequence"): TrajectoryTimeline | null {
  if (mode !== "sequence") return timedTimeline(turns, mode === "duration" || mode === "actual", mode === "duration");
  const spans: TrajectoryTimelineSpan[] = [];
  const turnBoundaries: { turn: number; time: number }[] = [];
  for (const turn of turns) {
    const cells = visibleCells(turn);
    if (cells.length === 0) continue;
    if (turn.turn !== null) turnBoundaries.push({ turn: turn.turn, time: spans.length });
    const base = spans.length;
    spans.push(...cells.map((cell, offset) => span(cell, { start: base + offset, end: base + offset + 1 })));
  }
  return spans.length === 0 ? null : { start: 0, end: spans.length, spans, turnBoundaries };
}

function timedTimeline(turns: readonly TrajectoryLayoutTurn[], actualDuration: boolean, compressIdle: boolean): TrajectoryTimeline | null {
  const timed = turns.flatMap(turn => {
    const raw = visibleCells(turn).flatMap(cell => finite(cell.startedAt)
      ? [span(cell, { start: cell.startedAt, end: cell.startedAt + (finite(cell.durationMs) ? Math.max(0, cell.durationMs) : 0) })]
      : []);
    return raw.length === 0 ? [] : [{ turn: turn.turn, raw }];
  });
  const all = timed.flatMap(turn => turn.raw);
  if (all.length === 0) return null;
  const removed = new Map<TrajectoryTimelineSpan, number>();
  let idle = 0;
  let coveredUntil: number | null = null;
  for (const item of [...all].sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (compressIdle && coveredUntil !== null && item.start > coveredUntil) idle += item.start - coveredUntil;
    removed.set(item, idle);
    coveredUntil = coveredUntil === null ? item.end : Math.max(coveredUntil, item.end);
  }
  const spans: TrajectoryTimelineSpan[] = [];
  const turnBoundaries: { turn: number; time: number }[] = [];
  for (const turn of timed) {
    const projected = turn.raw.map(item => {
      const offset = removed.get(item) ?? 0;
      return { ...item, start: item.start - offset, end: (actualDuration ? item.end : item.start) - offset };
    });
    spans.push(...projected);
    if (turn.turn !== null) turnBoundaries.push({ turn: turn.turn, time: Math.min(...projected.map(item => item.start)) });
  }
  return { start: Math.min(...spans.map(item => item.start)), end: Math.max(...spans.map(item => item.end)), spans, turnBoundaries };
}

/** Record ids active at any point inside an inclusive range. */
export function timelineFocusIds(model: TrajectoryTimeline | null, range: TrajectoryTimeRange | null): ReadonlySet<string> | null {
  if (model === null || range === null) return null;
  return new Set(model.spans.filter(item => item.start <= range.end && item.end >= range.start).map(item => item.recordId));
}
