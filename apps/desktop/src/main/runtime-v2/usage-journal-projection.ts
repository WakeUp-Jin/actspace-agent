import { prepare } from "./usage-sql";
import type { DatabaseSync } from "node:sqlite";
import { projectSessionUsageActivities } from "@actspace/client/sessions";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { UsageActivityRow } from "@actspace/shared";

export type UsageJournalSource = { querySource?: import("@actspace/session-storage").SessionQuerySource; sessionId: string; title: string | null; throughJournalSeq: number; workspaceRoot: string | null };
type Json = Record<string, unknown>;
const record = (value: unknown): Json => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};

export function createUsageJournalSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_projection_events(session_id TEXT NOT NULL,seq INTEGER NOT NULL,group_key TEXT NOT NULL,event_json TEXT NOT NULL,PRIMARY KEY(session_id,seq),FOREIGN KEY(session_id) REFERENCES session_catalog(session_id) ON DELETE CASCADE) STRICT;
    CREATE INDEX IF NOT EXISTS usage_projection_group_idx ON usage_projection_events(session_id,group_key,seq);
    CREATE TABLE IF NOT EXISTS usage_projection_requests(session_id TEXT NOT NULL,request_id TEXT NOT NULL,group_key TEXT NOT NULL,PRIMARY KEY(session_id,request_id),FOREIGN KEY(session_id) REFERENCES session_catalog(session_id) ON DELETE CASCADE) STRICT;
    CREATE TABLE IF NOT EXISTS usage_projection_groups(session_id TEXT NOT NULL,group_key TEXT NOT NULL,turn_id TEXT,PRIMARY KEY(session_id,group_key),FOREIGN KEY(session_id) REFERENCES session_catalog(session_id) ON DELETE CASCADE) STRICT;
    CREATE INDEX IF NOT EXISTS usage_projection_turn_idx ON usage_projection_groups(session_id,turn_id);
    CREATE TABLE IF NOT EXISTS usage_projection_turns(session_id TEXT NOT NULL,turn_id TEXT NOT NULL,run_id TEXT NOT NULL,PRIMARY KEY(session_id,turn_id),FOREIGN KEY(session_id) REFERENCES session_catalog(session_id) ON DELETE CASCADE) STRICT;
  `);
}

export function clearUsageJournal(db: DatabaseSync, sessionId: string): void {
  for (const table of ["events", "requests", "groups", "turns"]) prepare(db, `DELETE FROM usage_projection_${table} WHERE session_id=?`).run(sessionId);
  prepare(db, "DELETE FROM index_state WHERE key=?").run(`cursor:${sessionId}`);
}

/** Persist only fields used by the existing Usage projection, never transcript/tool bodies.
 * Reproject affected step/call groups, so retries and terminal events can cross read batches. */
export async function projectUsageJournalBatch(db: DatabaseSync, source: UsageJournalSource, events: readonly SessionEventEnvelopeV1[], write: (rows: UsageActivityRow[]) => Promise<void>): Promise<void> {
  const dirtyGroups = new Set<string>();
  let dirtyBytes = 0;
  const dirty = { add(key: string) {
    if (dirtyGroups.has(key)) return;
    dirtyBytes += Buffer.byteLength(key);
    if (dirtyGroups.size >= 10_000 || dirtyBytes > 8 * 1024 * 1024) throw new Error("Usage dirty groups exceed bounded query budget.");
    dirtyGroups.add(key);
  } };
  // These caches last for one bounded input batch. Durable associations remain
  // in SQLite, including late events and retries arriving in later batches.
  const runs = new Map<string, string | undefined>();
  const requests = new Map<string, string>();
  const groupTurns = new Map<string, string | null>();
  const runFor = (turnId: string) => {
    if (runs.has(turnId)) return runs.get(turnId);
    const run = (prepare(db, "SELECT run_id FROM usage_projection_turns WHERE session_id=? AND turn_id=?").get(source.sessionId, turnId) as { run_id: string } | undefined)?.run_id;
    remember(runs, turnId, run);
    return run;
  };
  const saveEvent = prepare(db, "INSERT INTO usage_projection_events(session_id,seq,group_key,event_json) VALUES(?,?,?,?)");
  for (const event of events) {
    const data = record(event.data);
    if (typeof data.turnId === "string" && typeof data.agentRunId === "string") {
      if (runFor(data.turnId) !== data.agentRunId) {
        prepare(db, "INSERT INTO usage_projection_turns VALUES(?,?,?) ON CONFLICT(session_id,turn_id) DO UPDATE SET run_id=excluded.run_id").run(source.sessionId, data.turnId, data.agentRunId);
        remember(runs, data.turnId, data.agentRunId);
        for (const group of prepare(db, "SELECT group_key FROM usage_projection_groups WHERE session_id=? AND turn_id=?").iterate(source.sessionId, data.turnId)) dirty.add(String(group.group_key));
      }
    }
    const reduced = compactUsageEvent(event);
    if (!reduced) continue;
    let groupKey: string | undefined;
    if (event.type === "request/header") {
      if (typeof data.requestId !== "string" || typeof data.stepId !== "string" || typeof data.turnId !== "string") continue;
      groupKey = `step:${data.stepId}`;
      prepare(db, "INSERT INTO usage_projection_requests VALUES(?,?,?) ON CONFLICT(session_id,request_id) DO UPDATE SET group_key=excluded.group_key").run(source.sessionId, data.requestId, groupKey);
      remember(requests, data.requestId, groupKey);
      prepare(db, "UPDATE usage_projection_events SET group_key=? WHERE session_id=? AND group_key=?").run(groupKey, source.sessionId, `request:${data.requestId}`);
    } else if (event.type === "step/end" && typeof data.stepId === "string") groupKey = `step:${data.stepId}`;
    else if (event.type.startsWith("tool/")) {
      const callId = data.callId ?? data.toolCallId;
      if (typeof callId === "string") groupKey = `call:${callId}`;
    } else if (typeof data.requestId === "string") {
      groupKey = requests.get(data.requestId) ?? (prepare(db, "SELECT group_key FROM usage_projection_requests WHERE session_id=? AND request_id=?").get(source.sessionId, data.requestId) as { group_key: string } | undefined)?.group_key ?? `request:${data.requestId}`;
      remember(requests, data.requestId, groupKey);
    }
    if (!groupKey) continue;
    const turnId = typeof data.turnId === "string" ? data.turnId : null;
    if (!groupTurns.has(groupKey) || (turnId !== null && groupTurns.get(groupKey) !== turnId)) {
      prepare(db, "INSERT INTO usage_projection_groups VALUES(?,?,?) ON CONFLICT(session_id,group_key) DO UPDATE SET turn_id=COALESCE(excluded.turn_id,turn_id)").run(source.sessionId, groupKey, turnId);
      remember(groupTurns, groupKey, turnId);
    }
    saveEvent.run(source.sessionId, event.seq, groupKey, JSON.stringify(reduced));
    dirty.add(groupKey);
  }
  const snapshot = { sessionId: source.sessionId, throughJournalSeq: source.throughJournalSeq, workspaceRoot: source.workspaceRoot, metadata: { title: source.title, pinned: false, archived: false } };
  let pendingRows: UsageActivityRow[] = [];
  for (const key of dirtyGroups) {
    // An abnormal single step cannot turn a bounded batch into an unbounded JS allocation.
    const journal: SessionEventEnvelopeV1[] = [];
    let bytes = 0;
    for (const row of prepare(db, "SELECT event_json FROM usage_projection_events WHERE session_id=? AND group_key=? ORDER BY seq").iterate(source.sessionId, key)) {
      const json = String(row.event_json);
      bytes += Buffer.byteLength(json);
      if (journal.length >= 10_000 || bytes > 8 * 1024 * 1024) throw new Error("Usage step projection exceeds bounded query budget.");
      journal.push(JSON.parse(json) as SessionEventEnvelopeV1);
    }
    const turnIds = new Set(journal.map(event => record(event.data).turnId).filter((id): id is string => typeof id === "string"));
    for (const turnId of turnIds) {
      const agentRunId = runFor(turnId);
      if (agentRunId && journal[0]) {
        const relation = { ...journal[0], type: "usage/run-association", data: { turnId, agentRunId } };
        bytes += Buffer.byteLength(JSON.stringify(relation));
        if (journal.length >= 10_000 || bytes > 8 * 1024 * 1024) throw new Error("Usage step projection exceeds bounded query budget.");
        journal.push(relation);
      }
    }
    for (const row of projectSessionUsageActivities(snapshot, journal)) {
      pendingRows.push(row);
      if (pendingRows.length >= 128) { await write(pendingRows); pendingRows = []; }
    }
  }
  if (pendingRows.length) await write(pendingRows);
}

function remember<T extends string | null | undefined>(cache: Map<string, T>, key: string, value: T): void {
  // Oversized/exceptional identities remain queryable without being retained.
  if (key.length > 1024 || (typeof value === "string" && value.length > 1024)) { cache.delete(key); return; }
  if (cache.size < 256 || cache.has(key)) cache.set(key, value);
}

export function compactUsageEvent(event: SessionEventEnvelopeV1): SessionEventEnvelopeV1 | undefined {
  const data = record(event.data);
  const fields: Record<string, readonly string[]> = {
    "request/header": ["requestId", "turnId", "stepId", "routeId", "model", "attempt"],
    "request/context": ["requestId"],
    "assistant/message": ["requestId", "finishReason", "reason", "usage"],
    "llm/retry": ["requestId", "nextAttempt", "retryId", "usage"],
    "llm/retry-started": ["requestId"],
    "step/end": ["stepId", "finishReason", "reason", "usage"],
    "tool/call": ["callId", "toolCallId", "turnId", "stepId", "agentRunId", "name"],
    "tool/result": ["callId", "toolCallId", "status"],
    "tool/recovery-outcome": ["callId", "toolCallId", "status"],
  };
  const selected = fields[event.type];
  if (!selected) return undefined;
  const result: Json = {};
  for (const field of selected) if (data[field] !== undefined) result[field] = data[field];
  if (event.type === "request/context") {
    const prepared = record(record(data.snapshot).prepared);
    result.snapshot = { prepared: { ...(typeof prepared.route === "string" ? { route: prepared.route } : {}), ...(typeof prepared.model === "string" ? { model: prepared.model } : {}) } };
  }
  return { ...event, surface: null, data: result as SessionEventEnvelopeV1["data"] };
}
