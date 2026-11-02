import { loadRuntimeV2Module } from "./runtime-loader";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ContextContentManifest, ContextPanelEvent, UsageActivityRow } from "@actspace/shared";
import type { SessionQuerySource } from "@actspace/session-storage";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { prepare, type ProjectionDatabase } from "./usage-sql";
import { projectUsageJournalBatch } from "./usage-journal-projection";
import { parseBashPrograms } from "./bash-programs";
import { CONTEXT_PROJECTOR_VERSION } from "./context-history-version";

/** 每会话最多记多少个（程序, 子命令）组合，超出的归入「其他」。 */
export const CONTEXT_BASH_PROGRAM_LIMIT = 500;

const associationTables = ["usage_projection_events", "usage_projection_requests", "usage_projection_groups", "usage_projection_turns"];
export const contextTables = ["context_state", "context_request", "context_manifest_entry", "context_event", "context_session_stats", "context_identity", "context_usage_row", "context_bash_stats", "context_bash_program", "context_bash_call", ...associationTables.map(name => `context_${name}`)];
const pattern = new RegExp(`\\b(${[...contextTables, ...associationTables].join("|")})\\b`, "g");
const connections = new WeakMap<DatabaseSync, Map<boolean, ProjectionDatabase>>();
export function contextConnection(db: DatabaseSync, stage: boolean): ProjectionDatabase {
  let map = connections.get(db); if (!map) { map = new Map(); connections.set(db, map); }
  let connection = map.get(stage);
  if (!connection) {
    const translate = (sql: string) => sql.replace(pattern, name => `${stage ? "building_" : ""}${associationTables.includes(name) ? "context_" : ""}${name}`);
    connection = { prepare: sql => db.prepare(translate(sql)), exec: sql => db.exec(translate(sql)) }; map.set(stage, connection);
  }
  return connection;
}
/**
 * Bash 命令统计（`front-Context面板Bash命令统计.md` §4）。`program_failed` 让每个失败调用对每个程序只记一次失败：
 * 记在该程序在这次调用里第一次出现的那一行上。`context_bash_call.occurrences_json` 为 NULL 表示已计入，行保留用来去重。
 */
const BASH_TABLES_SQL = `
    CREATE TABLE IF NOT EXISTS context_bash_stats(session_id TEXT PRIMARY KEY,calls INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,duration_ms INTEGER NOT NULL DEFAULT 0) STRICT;
    CREATE TABLE IF NOT EXISTS context_bash_program(session_id TEXT NOT NULL,program TEXT NOT NULL,subcommand TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,program_failed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(session_id,program,subcommand)) STRICT;
    CREATE TABLE IF NOT EXISTS context_bash_call(session_id TEXT NOT NULL,call_id TEXT NOT NULL,occurrences_json TEXT,started_at TEXT NOT NULL,PRIMARY KEY(session_id,call_id)) STRICT;
`;
/** 使用统计库 Schema 版本不变；Worker 打开老库时补建 Bash 统计表（含 `building_*`）。 */
export function ensureContextBashTables(db: DatabaseSync): void {
  contextConnection(db, false).exec(BASH_TABLES_SQL);
  contextConnection(db, true).exec(BASH_TABLES_SQL);
}
export function createContextHistorySchema(db: DatabaseSync): void {
  db.exec(BASH_TABLES_SQL);
  db.exec(`
    CREATE TABLE context_state(session_id TEXT PRIMARY KEY,target INTEGER NOT NULL,revision INTEGER NOT NULL,cursor TEXT,stamp TEXT NOT NULL,codec TEXT NOT NULL,generation TEXT NOT NULL,projector_version INTEGER NOT NULL) STRICT;
    CREATE TABLE context_request(session_id TEXT NOT NULL,request_id TEXT NOT NULL,seq INTEGER NOT NULL,scope TEXT NOT NULL,turn_id TEXT,step_id TEXT,time TEXT NOT NULL,model_json TEXT,manifest_json TEXT,turn_index INTEGER NOT NULL,step_index INTEGER NOT NULL,PRIMARY KEY(session_id,request_id)) STRICT;
    CREATE INDEX context_request_seq ON context_request(session_id,seq DESC);
    CREATE TABLE context_manifest_entry(session_id TEXT NOT NULL,request_id TEXT NOT NULL,key TEXT NOT NULL,entry_json TEXT NOT NULL,PRIMARY KEY(session_id,request_id,key)) STRICT;
    CREATE TABLE context_event(session_id TEXT NOT NULL,id TEXT NOT NULL,seq INTEGER NOT NULL,row_json TEXT NOT NULL,PRIMARY KEY(session_id,id)) STRICT;
    CREATE INDEX context_event_seq ON context_event(session_id,seq DESC);
    CREATE TABLE context_identity(session_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,ordinal INTEGER NOT NULL,PRIMARY KEY(session_id,kind,id)) STRICT;
    CREATE TABLE context_usage_row(session_id TEXT NOT NULL,activity_id TEXT NOT NULL,row_json TEXT NOT NULL,PRIMARY KEY(session_id,activity_id)) STRICT;
    CREATE TABLE context_session_stats(session_id TEXT PRIMARY KEY,turn_count INTEGER NOT NULL DEFAULT 0,step_count INTEGER NOT NULL DEFAULT 0,compaction_count INTEGER NOT NULL DEFAULT 0,usage_count INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,cache_read_tokens INTEGER NOT NULL DEFAULT 0,cache_write_tokens INTEGER NOT NULL DEFAULT 0,known_cost_count INTEGER NOT NULL DEFAULT 0,unknown_cost_count INTEGER NOT NULL DEFAULT 0,cost_usd REAL NOT NULL DEFAULT 0) STRICT;
  `);
  for (const name of associationTables) {
    const row = prepare(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name) as { sql: string };
    contextConnection(db, false).exec(row.sql);
    for (const index of prepare(db, "SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(name) as { name: string; sql: string }[]) contextConnection(db, false).exec(index.sql.replace(index.name, `context_${index.name}`));
  }
  for (const name of contextTables) {
    const row = prepare(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name) as { sql: string };
    contextConnection(db, true).exec(row.sql);
    for (const index of prepare(db, "SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(name) as { name: string; sql: string }[]) contextConnection(db, true).exec(index.sql.replace(index.name, `building_${index.name}`));
  }
}
export type ContextHistoryState = { target: number; revision: number; cursor: string | null; stamp: string; codec: string; generation: string; projector_version: number; building?: boolean };
function state(db: ProjectionDatabase, id: string): ContextHistoryState | undefined { return prepare(db, "SELECT target,revision,cursor,stamp,codec,generation,projector_version FROM context_state WHERE session_id=?").get(id) as unknown as ContextHistoryState | undefined; }
function sameTarget(saved: ContextHistoryState, source: SessionQuerySource): boolean { return saved.target === source.throughSeq && saved.stamp === source.stamp && saved.codec === (source.codecSetDigest ?? "") && saved.projector_version === CONTEXT_PROJECTOR_VERSION; }
export function contextSourceState(db: DatabaseSync, source: SessionQuerySource): ContextHistoryState | null {
  const staging = state(contextConnection(db, true), source.header.sessionId);
  return staging && sameTarget(staging, source) ? { ...staging, building: true } : state(db, source.header.sessionId) ?? null;
}
export async function clearContextSession(db: DatabaseSync, id: string, stage: boolean, yieldBatch: () => Promise<void>): Promise<void> {
  for (const table of [...contextTables].reverse()) {
    const remove = prepare(contextConnection(db, stage), `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE session_id=? LIMIT 256)`);
    while (remove.run(id).changes) await yieldBatch();
  }
}
export async function commitContextBatch(db: DatabaseSync, source: SessionQuerySource, events: readonly SessionEventEnvelopeV1[], cursor: string, first: boolean, final: boolean, reset: boolean, yieldBatch: () => Promise<void>): Promise<void> {
  const id = source.header.sessionId;
  const saved = state(contextConnection(db, true), id);
  const restart = first && reset;
  const stage = restart || !!(saved && sameTarget(saved, source));
  const target = contextConnection(db, stage);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (restart || (saved && !sameTarget(saved, source))) await clearContextSession(db, id, true, yieldBatch);
    prepare(db, "INSERT OR IGNORE INTO session_catalog(session_id,title,revision,created_at,updated_at) VALUES(?,NULL,?,?,?)").run(id, source.throughSeq, source.header.createdAt, source.header.createdAt);
    prepare(target, "INSERT OR IGNORE INTO context_state VALUES(?,?,-1,NULL,?,?,?,?)").run(id, source.throughSeq, source.stamp, source.codecSetDigest ?? "", randomUUID(), CONTEXT_PROJECTOR_VERSION);
    prepare(target, "INSERT OR IGNORE INTO context_session_stats(session_id) VALUES(?)").run(id);
    prepare(target, "INSERT OR IGNORE INTO context_bash_stats(session_id) VALUES(?)").run(id);
    await projectContextEvents(target, source, events, yieldBatch);
    prepare(target, "UPDATE context_state SET target=?,revision=?,cursor=?,stamp=?,codec=? WHERE session_id=?").run(source.throughSeq, final ? source.throughSeq : events.at(-1)?.seq ?? saved?.revision ?? -1, cursor, source.stamp, source.codecSetDigest ?? "", id);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  if (stage && final) {
    db.exec("BEGIN IMMEDIATE");
    try {
      await clearContextSession(db, id, false, yieldBatch);
      for (const table of contextTables) {
        let after = 0;
        for (;;) {
          const ids = prepare(db, `SELECT rowid AS id FROM building_${table} WHERE session_id=? AND rowid>? ORDER BY rowid LIMIT 256`).all(id, after) as { id: number }[];
          if (!ids.length) break;
          const end = ids.at(-1)!.id;
          prepare(db, `INSERT INTO ${table} SELECT * FROM building_${table} WHERE session_id=? AND rowid>? AND rowid<=?`).run(id, after, end); after = end; await yieldBatch();
        }
      }
      await clearContextSession(db, id, true, yieldBatch);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
}
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
async function projectContextEvents(db: ProjectionDatabase, source: SessionQuerySource, events: readonly SessionEventEnvelopeV1[], yieldBatch: () => Promise<void>): Promise<void> {
  const { readPersistedContextManifest } = await loadRuntimeV2Module();
  const id = source.header.sessionId;
  const addEvent = (event: SessionEventEnvelopeV1, value: Omit<ContextPanelEvent, "at" | "turnIndex" | "stepIndex">) => prepare(db, "INSERT OR REPLACE INTO context_event VALUES(?,?,?,?)").run(id, value.id, event.seq, JSON.stringify({ ...value, at: new Date(event.time).toISOString(), turnIndex: null, stepIndex: null }));
  for (const event of events) {
    const data = record(event.data);
    const kind = event.type === "turn/start" ? "turn" : event.type === "step/start" ? "step" : event.type === "compaction/end" ? "compaction" : undefined;
    if (kind) {
      const identity = data[kind === "compaction" ? "compactionId" : `${kind}Id`];
      const ordinal = kind === "step" && typeof data.stepIndex === "number" ? data.stepIndex : Number((prepare(db, `SELECT ${kind}_count AS n FROM context_session_stats WHERE session_id=?`).get(id) as { n: number }).n) + 1;
      if (typeof identity === "string" && prepare(db, "INSERT OR IGNORE INTO context_identity VALUES(?,?,?,?)").run(id, kind, identity, ordinal).changes) prepare(db, `UPDATE context_session_stats SET ${kind}_count=${kind}_count+1 WHERE session_id=?`).run(id);
    }
    if (event.type === "request/context" && typeof data.requestId === "string") {
      const snapshot = record(data.snapshot); const prepared = record(snapshot.prepared); const manifest = readPersistedContextManifest(snapshot);
      const counts = prepare(db, "SELECT turn_count,step_count FROM context_session_stats WHERE session_id=?").get(id) as { turn_count: number; step_count: number };
      const rawModel = record(snapshot.contextModel);
      const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
      const model = { modelKey: String(rawModel.modelKey ?? `${prepared.route ?? ""}/${prepared.model ?? ""}`).slice(0, 512), label: String(rawModel.label ?? prepared.model ?? "").slice(0, 160), contextWindow: positive(rawModel.contextWindow ?? prepared.contextWindow), autoCompactAtTokens: positive(rawModel.autoCompactAtTokens) };
      const previous = prepare(db, "SELECT model_json,manifest_json FROM context_request WHERE session_id=? ORDER BY seq DESC LIMIT 1").get(id) as { model_json: string; manifest_json: string } | undefined;
      if (previous && record(JSON.parse(previous.model_json)).modelKey !== record(model).modelKey) addEvent(event, { id: `${event.seq}:model`, kind: "model-switch", label: "模型已切换", tokenDelta: null, inferred: true });
      const previousTools = previous ? prepare(db, "SELECT key FROM context_manifest_entry WHERE session_id=? AND request_id=(SELECT request_id FROM context_request WHERE session_id=? ORDER BY seq DESC LIMIT 1) AND json_extract(entry_json,'$.bucket')='tools' ORDER BY key").all(id, id).map(row => row.key) : [];
      const tools = manifest.entries.filter(entry => entry.bucket === "tools").map(entry => entry.key).sort();
      if (previous && record(JSON.parse(previous.manifest_json)).comparable === true && manifest.comparable && JSON.stringify(previousTools) !== JSON.stringify(tools)) addEvent(event, { id: `${event.seq}:tools`, kind: "tools-changed", label: "工具清单已变化", tokenDelta: null, inferred: true });
      const { entries, ...summary } = manifest;
      prepare(db, "INSERT OR REPLACE INTO context_request VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, data.requestId, event.seq, String(snapshot.logicalAgentScopeId ?? `main:${id}`), typeof data.turnId === "string" ? data.turnId : null, typeof data.stepId === "string" ? data.stepId : null, new Date(event.time).toISOString(), JSON.stringify(model), JSON.stringify(summary), Number((prepare(db, "SELECT ordinal FROM context_identity WHERE session_id=? AND kind='turn' AND id=?").get(id, typeof data.turnId === "string" ? data.turnId : "") as { ordinal: number } | undefined)?.ordinal ?? counts.turn_count), Number((prepare(db, "SELECT ordinal FROM context_identity WHERE session_id=? AND kind='step' AND id=?").get(id, typeof data.stepId === "string" ? data.stepId : "") as { ordinal: number } | undefined)?.ordinal ?? 0));
      prepare(db, "DELETE FROM context_manifest_entry WHERE session_id=? AND request_id=?").run(id, data.requestId);
      for (const entry of entries) {
        const { preview: _preview, fullTextAvailable: _full, ...metadata } = entry;
        prepare(db, "INSERT INTO context_manifest_entry VALUES(?,?,?,?)").run(id, data.requestId, entry.key, JSON.stringify(metadata));
      }
      prepare(db, "DELETE FROM context_manifest_entry WHERE session_id=? AND request_id NOT IN (SELECT request_id FROM context_request WHERE session_id=? ORDER BY seq DESC LIMIT 2)").run(id, id);
    }
    if (event.type === "tool/call" || event.type === "tool-workflow/run-start" || event.type === "tool/result") projectBashEvent(db, id, event, data);
    if (event.type === "compaction/end") addEvent(event, { id: `${event.seq}:compact`, kind: "compact", label: "上下文已压缩", tokenDelta: null });
    if (event.type === "agent/mode-set") addEvent(event, { id: `${event.seq}:mode`, kind: "mode-switch", label: `模式：${String(data.mode ?? "未知").slice(0, 32)}`, tokenDelta: null });
    if (event.type === "plugin/actspace.context/supplement" && data.op === "add") addEvent(event, { id: `${event.seq}:inject`, kind: "inject", label: "上下文补充", source: String(data.owner ?? "").slice(0, 80), tokenDelta: null });
  }
  await projectUsageJournalBatch(db, { sessionId: id, title: null, throughJournalSeq: source.throughSeq, workspaceRoot: null }, events.filter(event => !event.type.startsWith("tool/")), async rows => {
    for (const row of rows) {
      if (row.kind !== "llm_request") continue;
      const saved = prepare(db, "SELECT row_json FROM context_usage_row WHERE session_id=? AND activity_id=?").get(id, row.activityId) as { row_json: string } | undefined;
      if (saved) applyUsage(db, id, JSON.parse(saved.row_json), -1);
      // No prompt/body, only the existing canonical request accounting result.
      const compact = { kind: row.kind, requestId: row.requestId, tokens: row.tokens, costAmount: row.costAmount, costCurrency: row.costCurrency };
      prepare(db, "INSERT OR REPLACE INTO context_usage_row VALUES(?,?,?)").run(id, row.activityId, JSON.stringify(compact));
      applyUsage(db, id, compact, 1);
    }
    await yieldBatch();
  });
}
/** `tool/call` 记下解析结果，`run-start` 更新开始时间，`tool/result` 计入。只有 `tool/call` 写过行的调用才会被计入。 */
function projectBashEvent(db: ProjectionDatabase, id: string, event: SessionEventEnvelopeV1, data: Record<string, unknown>): void {
  const callId = data.callId;
  if (typeof callId !== "string") return;
  if (event.type === "tool/call") {
    const command = record(data.args).command;
    if (data.name !== "bash" || typeof command !== "string") return;
    const occurrences = parseBashPrograms(command).map(item => [item.program, item.subcommand]);
    prepare(db, "INSERT OR IGNORE INTO context_bash_call VALUES(?,?,?,?)").run(id, callId, JSON.stringify(occurrences), event.time);
    return;
  }
  if (event.type === "tool-workflow/run-start") {
    prepare(db, "UPDATE context_bash_call SET started_at=? WHERE session_id=? AND call_id=? AND occurrences_json IS NOT NULL").run(event.time, id, callId);
    return;
  }
  const call = prepare(db, "SELECT occurrences_json,started_at FROM context_bash_call WHERE session_id=? AND call_id=?").get(id, callId) as { occurrences_json: string | null; started_at: string } | undefined;
  if (!call?.occurrences_json) return;
  prepare(db, "UPDATE context_bash_call SET occurrences_json=NULL WHERE session_id=? AND call_id=?").run(id, callId);
  // 被拒绝的命令没有执行，不计。
  if (data.status === "denied") return;
  const failed = data.status === "failed";
  const started = Date.parse(call.started_at); const ended = Date.parse(event.time);
  const duration = Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, Math.round(ended - started)) : 0;
  prepare(db, "UPDATE context_bash_stats SET calls=calls+1,failed=failed+?,duration_ms=duration_ms+? WHERE session_id=?").run(Number(failed), duration, id);
  const failedPairs = new Set<string>(); const failedPrograms = new Set<string>();
  for (const [rawProgram, rawSubcommand] of JSON.parse(call.occurrences_json) as [string, string][]) {
    const known = prepare(db, "SELECT 1 FROM context_bash_program WHERE session_id=? AND program=? AND subcommand=?").get(id, rawProgram, rawSubcommand);
    const full = !known && Number((prepare(db, "SELECT COUNT(*) AS n FROM context_bash_program WHERE session_id=?").get(id) as { n: number }).n) >= CONTEXT_BASH_PROGRAM_LIMIT;
    const [program, subcommand] = full ? ["", ""] : [rawProgram, rawSubcommand];
    const pair = JSON.stringify([program, subcommand]);
    const pairFailed = failed && !failedPairs.has(pair); const programFailed = failed && !failedPrograms.has(program);
    if (pairFailed) failedPairs.add(pair);
    if (programFailed) failedPrograms.add(program);
    prepare(db, "INSERT INTO context_bash_program VALUES(?,?,?,1,?,?) ON CONFLICT(session_id,program,subcommand) DO UPDATE SET count=count+1,failed=failed+excluded.failed,program_failed=program_failed+excluded.program_failed").run(id, program, subcommand, Number(pairFailed), Number(programFailed));
  }
}
function applyUsage(db: ProjectionDatabase, id: string, row: Pick<UsageActivityRow, "tokens" | "costAmount" | "costCurrency">, sign: number): void {
  const t = row.tokens; const knownUsage = [t.inputTokens, t.outputTokens, t.cacheReadTokens, t.cacheWriteTokens].some(value => value !== null);
  const knownCost = row.costAmount !== undefined && row.costAmount !== null && row.costCurrency === "USD";
  prepare(db, "UPDATE context_session_stats SET usage_count=usage_count+?,input_tokens=input_tokens+?,output_tokens=output_tokens+?,cache_read_tokens=cache_read_tokens+?,cache_write_tokens=cache_write_tokens+?,known_cost_count=known_cost_count+?,unknown_cost_count=unknown_cost_count+?,cost_usd=cost_usd+? WHERE session_id=?").run(sign * Number(knownUsage), sign * (t.inputTokens ?? 0), sign * (t.outputTokens ?? 0), sign * (t.cacheReadTokens ?? 0), sign * (t.cacheWriteTokens ?? 0), sign * Number(knownCost), sign * Number(!knownCost), sign * (knownCost ? row.costAmount! : 0), id);
}
