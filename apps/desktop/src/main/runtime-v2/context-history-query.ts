import type { DatabaseSync } from "node:sqlite";
import type { ContextContentManifest, ContextPanelEvent, ContextPanelManifest, ContextPanelModel, ContextPanelStats, ContextPanelTrendPoint, ContextPanelTruncation } from "@actspace/shared";
import { prepare } from "./usage-sql";

export type ContextHistoryResult = { generation: string; revision: number; target: number; logicalAgentScopeId: string; previous: ContextPanelManifest | null; model: ContextPanelModel | null; stats: ContextPanelStats; trend: ContextPanelTrendPoint[]; events: ContextPanelEvent[]; limits: { trend: ContextPanelTruncation; events: ContextPanelTruncation } };
type RequestRow = { request_id: string; seq: number; scope: string; time: string; model_json: string; manifest_json: string; turn_index: number; step_index: number };
export function queryContextHistory(db: DatabaseSync, id: string): ContextHistoryResult | null {
  const state = prepare(db, "SELECT generation,revision,target FROM context_state WHERE session_id=?").get(id) as { generation: string; revision: number; target: number } | undefined;
  if (!state) return null;
  const rows = prepare(db, "SELECT * FROM context_request WHERE session_id=? ORDER BY seq DESC LIMIT 500").all(id) as unknown as RequestRow[];
  const latest = rows[0];
  const entries = latest ? (prepare(db, "SELECT entry_json FROM context_manifest_entry WHERE session_id=? AND request_id=? ORDER BY rowid LIMIT 5000").all(id, latest.request_id) as { entry_json: string }[]).map(row => JSON.parse(row.entry_json)) : [];
  const summary = latest ? JSON.parse(latest.manifest_json) as ContextContentManifest : null;
  const previous = latest && summary ? { requestId: latest.request_id, turnIndex: latest.turn_index, stepIndex: latest.step_index, sentAt: latest.time, totalEstimatedTokens: summary.totalEstimatedTokens, buckets: summary.buckets, entries, comparable: summary.comparable, estimatorVersion: summary.estimatorVersion, ...(summary.comparisonUnavailableReason ? { comparisonUnavailableReason: summary.comparisonUnavailableReason } : {}) } : null;
  const stat = prepare(db, "SELECT * FROM context_session_stats WHERE session_id=?").get(id) as Record<string, number>;
  const stats: ContextPanelStats = { turnCount: stat.turn_count!, stepCount: stat.step_count!, compactionCount: stat.compaction_count!, cumulativeUsage: stat.usage_count! > 0 ? { inputTokens: stat.input_tokens!, outputTokens: stat.output_tokens!, cacheReadTokens: stat.cache_read_tokens!, cacheWriteTokens: stat.cache_write_tokens! } : null, costUsd: stat.known_cost_count! > 0 && stat.unknown_cost_count === 0 ? stat.cost_usd! : null };
  const trend = rows.map(row => {
    const boundary = prepare(db, "SELECT id FROM context_event WHERE session_id=? AND seq<? AND seq>COALESCE((SELECT MAX(seq) FROM context_request WHERE session_id=? AND seq<?),-1) AND json_extract(row_json,'$.kind')='compact' ORDER BY seq DESC LIMIT 1").get(id, row.seq, id, row.seq) as { id: string } | undefined;
    const manifest = JSON.parse(row.manifest_json) as ContextContentManifest;
    const usage = prepare(db, "SELECT row_json FROM context_usage_row WHERE session_id=? AND activity_id=?").get(id, `${id}:request:${row.request_id}`) as { row_json: string } | undefined;
    const tokens = usage ? JSON.parse(usage.row_json).tokens : undefined;
    return { requestId: row.request_id, turnIndex: row.turn_index, stepIndex: row.step_index, sentAt: row.time, estimatedTokens: manifest.totalEstimatedTokens, buckets: manifest.buckets, ...(boundary ? { compactedBefore: { compactionId: boundary.id, reclaimedTokens: null } } : {}), ...(tokens && Object.values(tokens).some(value => value !== null) ? { actual: { inputTokens: tokens.inputTokens ?? 0, outputTokens: tokens.outputTokens ?? 0, cacheReadTokens: tokens.cacheReadTokens ?? 0, cacheWriteTokens: tokens.cacheWriteTokens ?? 0 } } : {}) };
  }).reverse();
  const events = prepare(db, "SELECT seq,row_json FROM context_event WHERE session_id=? ORDER BY seq DESC LIMIT 200").all(id) as { seq: number; row_json: string }[];
  const range = (table: string, values: readonly { seq: number }[]): ContextPanelTruncation => {
    const total = Number((prepare(db, `SELECT COUNT(*) AS n FROM ${table} WHERE session_id=?`).get(id) as { n: number }).n);
    return { total, truncated: total > values.length, returnedCount: values.length, fromSeq: values.at(-1)?.seq ?? null, throughSeq: values[0]?.seq ?? null };
  };
  return { ...state, logicalAgentScopeId: latest?.scope ?? `main:${id}`, previous, model: latest ? JSON.parse(latest.model_json) : null, stats, trend, events: events.map(row => JSON.parse(row.row_json)), limits: { trend: range("context_request", rows), events: range("context_event", events) } };
}
