import type { DatabaseSync } from "node:sqlite";
import type {
  ContextContentManifest,
  ContextPanelBashCount,
  ContextPanelBashProgram,
  ContextPanelBashStats,
  ContextPanelEvent,
  ContextPanelManifest,
  ContextPanelModel,
  ContextPanelStats,
  ContextPanelTrendPoint,
  ContextPanelTruncation,
} from "@actspace/shared";
import { prepare } from "./usage-sql";
import { BASH_SUBCOMMAND_PROGRAMS } from "./bash-programs";

export type ContextHistoryResult = {
  generation: string;
  revision: number;
  target: number;
  logicalAgentScopeId: string;
  previous: ContextPanelManifest | null;
  model: ContextPanelModel | null;
  stats: ContextPanelStats;
  bash: ContextPanelBashStats;
  trend: ContextPanelTrendPoint[];
  events: ContextPanelEvent[];
  limits: { trend: ContextPanelTruncation; events: ContextPanelTruncation };
};
type RequestRow = {
  request_id: string;
  seq: number;
  scope: string;
  time: string;
  model_json: string;
  manifest_json: string;
  turn_index: number;
  step_index: number;
};
export function queryContextHistory(db: DatabaseSync, id: string): ContextHistoryResult | null {
  const state = prepare(db, "SELECT generation,revision,target FROM context_state WHERE session_id=?").get(id) as
    | { generation: string; revision: number; target: number }
    | undefined;
  if (!state) return null;
  const rows = prepare(db, "SELECT * FROM context_request WHERE session_id=? ORDER BY seq DESC LIMIT 500").all(
    id,
  ) as unknown as RequestRow[];
  const latest = rows[0];
  const entries = latest
    ? (
        prepare(
          db,
          "SELECT entry_json FROM context_manifest_entry WHERE session_id=? AND request_id=? ORDER BY rowid LIMIT 5000",
        ).all(id, latest.request_id) as { entry_json: string }[]
      ).map((row) => JSON.parse(row.entry_json))
    : [];
  const summary = latest ? (JSON.parse(latest.manifest_json) as ContextContentManifest) : null;
  const previous =
    latest && summary
      ? {
          requestId: latest.request_id,
          seq: latest.seq,
          turnIndex: latest.turn_index,
          stepIndex: latest.step_index,
          sentAt: latest.time,
          totalEstimatedTokens: summary.totalEstimatedTokens,
          buckets: summary.buckets,
          entries,
          comparable: summary.comparable,
          estimatorVersion: summary.estimatorVersion,
          ...(summary.comparisonUnavailableReason
            ? { comparisonUnavailableReason: summary.comparisonUnavailableReason }
            : {}),
        }
      : null;
  const stat = prepare(db, "SELECT * FROM context_session_stats WHERE session_id=?").get(id) as Record<string, number>;
  const stats: ContextPanelStats = {
    turnCount: stat.turn_count,
    stepCount: stat.step_count,
    compactionCount: stat.compaction_count,
    cumulativeUsage:
      stat.usage_count > 0
        ? {
            inputTokens: stat.input_tokens,
            outputTokens: stat.output_tokens,
            cacheReadTokens: stat.cache_read_tokens,
            cacheWriteTokens: stat.cache_write_tokens,
          }
        : null,
    costUsd: stat.known_cost_count > 0 && stat.unknown_cost_count === 0 ? stat.cost_usd : null,
  };
  const trend = rows
    .map((row) => {
      const boundary = prepare(
        db,
        "SELECT id FROM context_event WHERE session_id=? AND seq<? AND seq>COALESCE((SELECT MAX(seq) FROM context_request WHERE session_id=? AND seq<?),-1) AND json_extract(row_json,'$.kind')='compact' ORDER BY seq DESC LIMIT 1",
      ).get(id, row.seq, id, row.seq) as { id: string } | undefined;
      const manifest = JSON.parse(row.manifest_json) as ContextContentManifest;
      const usage = prepare(db, "SELECT row_json FROM context_usage_row WHERE session_id=? AND activity_id=?").get(
        id,
        `${id}:request:${row.request_id}`,
      ) as { row_json: string } | undefined;
      const tokens = usage ? JSON.parse(usage.row_json).tokens : undefined;
      return {
        requestId: row.request_id,
        turnIndex: row.turn_index,
        stepIndex: row.step_index,
        sentAt: row.time,
        estimatedTokens: manifest.totalEstimatedTokens,
        buckets: manifest.buckets,
        ...(boundary ? { compactedBefore: { compactionId: boundary.id, reclaimedTokens: null } } : {}),
        ...(tokens && Object.values(tokens).some((value) => value !== null)
          ? {
              actual: {
                inputTokens: tokens.inputTokens ?? 0,
                outputTokens: tokens.outputTokens ?? 0,
                cacheReadTokens: tokens.cacheReadTokens ?? 0,
                cacheWriteTokens: tokens.cacheWriteTokens ?? 0,
              },
            }
          : {}),
      };
    })
    .reverse();
  const events = prepare(
    db,
    "SELECT seq,row_json FROM context_event WHERE session_id=? ORDER BY seq DESC LIMIT 200",
  ).all(id) as { seq: number; row_json: string }[];
  const range = (table: string, values: readonly { seq: number }[]): ContextPanelTruncation => {
    const total = Number(
      (prepare(db, `SELECT COUNT(*) AS n FROM ${table} WHERE session_id=?`).get(id) as { n: number }).n,
    );
    return {
      total,
      truncated: total > values.length,
      returnedCount: values.length,
      fromSeq: values.at(-1)?.seq ?? null,
      throughSeq: values[0]?.seq ?? null,
    };
  };
  return {
    ...state,
    logicalAgentScopeId: latest?.scope ?? `main:${id}`,
    previous,
    model: latest ? JSON.parse(latest.model_json) : null,
    stats,
    bash: queryBashStats(db, id),
    trend,
    events: events.map((row) => JSON.parse(row.row_json)),
    limits: { trend: range("context_request", rows), events: range("context_event", events) },
  };
}

/** 按 count 降序、同数按名字；`""`（其他）固定排最后。 */
function compareBashCounts(a: ContextPanelBashCount, b: ContextPanelBashCount): number {
  return Number(a.name === "") - Number(b.name === "") || b.count - a.count || a.name.localeCompare(b.name);
}
function queryBashStats(db: DatabaseSync, id: string): ContextPanelBashStats {
  const total = prepare(db, "SELECT calls,failed,duration_ms FROM context_bash_stats WHERE session_id=?").get(id) as
    | { calls: number; failed: number; duration_ms: number }
    | undefined;
  const rows = prepare(
    db,
    "SELECT program,subcommand,count,failed,program_failed FROM context_bash_program WHERE session_id=?",
  ).all(id) as { program: string; subcommand: string; count: number; failed: number; program_failed: number }[];
  const programs = new Map<string, ContextPanelBashProgram>();
  for (const row of rows) {
    let program = programs.get(row.program);
    if (!program) {
      program = { name: row.program, count: 0, failed: 0, subcommands: [] };
      programs.set(row.program, program);
    }
    program.count += Number(row.count);
    program.failed += Number(row.program_failed);
    if (BASH_SUBCOMMAND_PROGRAMS.has(row.program))
      program.subcommands.push({ name: row.subcommand, count: Number(row.count), failed: Number(row.failed) });
  }
  for (const program of programs.values()) program.subcommands.sort(compareBashCounts);
  const sorted = [...programs.values()].sort(compareBashCounts);
  const notable = prepare(
    db,
    "SELECT slowest_command,slowest_ms,background_count FROM context_bash_notable WHERE session_id=?",
  ).get(id) as { slowest_command: string; slowest_ms: number; background_count: number } | undefined;
  const repeated = prepare(
    db,
    "SELECT command,count FROM context_bash_command WHERE session_id=? AND count>=2 ORDER BY count DESC,command ASC LIMIT 1",
  ).get(id) as { command: string; count: number } | undefined;
  const failedProgram = sorted
    .filter((program) => program.name !== "" && program.failed > 0)
    .sort((a, b) => b.failed - a.failed || a.name.localeCompare(b.name))[0];
  return {
    calls: Number(total?.calls ?? 0),
    failed: Number(total?.failed ?? 0),
    durationMs: Number(total?.duration_ms ?? 0),
    programs: sorted,
    slowest:
      notable && Number(notable.slowest_ms) > 0 && notable.slowest_command
        ? { command: notable.slowest_command, durationMs: Number(notable.slowest_ms) }
        : null,
    mostFailedProgram: failedProgram ? { program: failedProgram.name, count: failedProgram.failed } : null,
    mostRepeated: repeated ? { command: repeated.command, count: Number(repeated.count) } : null,
    backgroundCount: Number(notable?.background_count ?? 0),
  };
}
