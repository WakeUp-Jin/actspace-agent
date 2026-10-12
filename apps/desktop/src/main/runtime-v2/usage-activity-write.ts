import { writeUsageBatch } from "./usage-batch-write";
import type { ProjectionDatabase } from "./usage-sql";
import type { IndexedUsageSource } from "@actspace/client/sessions";
import { prepare } from "./usage-sql";

/** Shared row binding for the durable index and bounded Session fallback. */
export function insertUsageActivities(database: ProjectionDatabase, source: IndexedUsageSource): void {
  const insert = prepare(database, `INSERT INTO usage_activity(activity_id,search_key,session_id,session_title,started_at,ended_at,kind,status,model,model_key,provider_id,connection_id,tool_name,agent_run_id,turn_id,step_id,request_id,retry_id,retry_of_request_id,source_event_seq,workspace_root,duration_ms,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,total_tokens,cost_usd,cost_amount,cost_currency,historical_unverified,row_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const write = () => {
  for (const original of source.rows) {
    // SQLite ordering and rollup bucket keys require canonical UTC strings;
    // Session envelopes also allow valid RFC3339 offsets.
    const row = { ...original, startedAt: new Date(original.startedAt).toISOString(), ...(original.endedAt ? { endedAt: new Date(original.endedAt).toISOString() } : {}) };
    insert.run(row.activityId, JSON.stringify([row.model ?? null, row.providerId ?? null, row.connectionId ?? null, row.toolName ?? null]), source.sessionId, source.title, row.startedAt, row.endedAt ?? null, row.kind, row.status, row.model ?? null, row.modelKey ? JSON.stringify(row.modelKey) : null, row.providerId ?? null, row.connectionId ?? null, row.toolName ?? null, row.agentRunId, row.turnId ?? null, row.stepId ?? null, row.requestId ?? null, row.retryId ?? null, row.retryOfRequestId ?? null, row.sourceEventSeq, row.workspaceRoot ?? null, row.durationMs ?? null, row.tokens.inputTokens, row.tokens.outputTokens, row.tokens.cacheReadTokens, row.tokens.cacheWriteTokens, row.tokens.reasoningTokens, row.tokens.totalTokens, row.costUsd, row.costAmount ?? null, row.costCurrency ?? null, row.historicalUnverified ? 1 : 0, JSON.stringify(row));
  }
  };
  if (source.rows.length >= 8) writeUsageBatch(database, write); else write();
}
