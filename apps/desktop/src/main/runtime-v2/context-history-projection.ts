import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  applyContextEstimate,
  initialContextEstimate,
  viewContextEstimate,
  type ContextContentManifest,
  type ContextEstimateState,
  type ContextPanelEvent,
  type UsageActivityRow,
} from "@actspace/shared";
import type { SessionQuerySource } from "@actspace/session-storage";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { prepare, type ProjectionDatabase } from "./usage-sql";
import { projectUsageJournalBatch } from "./usage-journal-projection";
import { parseBashPrograms } from "./bash-programs";
import { CONTEXT_PROJECTOR_VERSION } from "./context-history-version";
import {
  describeSupplementEvent,
  describeToolChange,
  mergedDetail,
  switchDetail,
  type SupplementMemory,
} from "./context-history-events";

/** 每会话最多记多少个（程序, 子命令）组合，超出的归入「其他」。 */
export const CONTEXT_BASH_PROGRAM_LIMIT = 500;
/** 「值得注意」里每会话最多追踪多少条不同的命令原文（用来找重复最多的），超出的新命令不再参与重复统计。 */
export const CONTEXT_BASH_COMMAND_LIMIT = 500;
/** 命令原文最多存多少个字符；重复判断按截断后的文本。 */
export const CONTEXT_BASH_COMMAND_TEXT_LIMIT = 1_000;

const associationTables = [
  "usage_projection_events",
  "usage_projection_requests",
  "usage_projection_groups",
  "usage_projection_turns",
];
export const contextTables = [
  "context_state",
  "context_estimate_state",
  "context_request",
  "context_manifest_entry",
  "context_event",
  "context_session_stats",
  "context_identity",
  "context_usage_row",
  "context_bash_stats",
  "context_bash_program",
  "context_bash_call",
  "context_bash_command",
  "context_bash_notable",
  ...associationTables.map((name) => `context_${name}`),
];
const pattern = new RegExp(`\\b(${[...contextTables, ...associationTables].join("|")})\\b`, "g");
const connections = new WeakMap<DatabaseSync, Map<boolean, ProjectionDatabase>>();
export function contextConnection(db: DatabaseSync, stage: boolean): ProjectionDatabase {
  let map = connections.get(db);
  if (!map) {
    map = new Map();
    connections.set(db, map);
  }
  let connection = map.get(stage);
  if (!connection) {
    const translate = (sql: string) =>
      sql.replace(
        pattern,
        (name) => `${stage ? "building_" : ""}${associationTables.includes(name) ? "context_" : ""}${name}`,
      );
    connection = { prepare: (sql) => db.prepare(translate(sql)), exec: (sql) => db.exec(translate(sql)) };
    map.set(stage, connection);
  }
  return connection;
}
/**
 * Bash 命令统计（存储设计见归档 `docs/exec-plans/completed/design-archive/frontend/front-Context面板Bash命令统计.md` §4，界面口径见 `front-Context面板规范.md` §5）。`program_failed` 让每个失败调用对每个程序只记一次失败：
 * 记在该程序在这次调用里第一次出现的那一行上。`context_bash_call.occurrences_json` 为 NULL 表示已计入，行保留用来去重；
 * 未计入时它是 `{ occurrences: [程序, 子命令][], command }`（旧格式是只有 occurrences 的数组）。
 * 「值得注意」（归档 §5.1）：`context_bash_command` 按命令原文计数找重复最多的，`context_bash_notable` 记最慢的一条与后台调用数。
 */
const BASH_TABLES_SQL = `
    CREATE TABLE IF NOT EXISTS context_bash_stats(session_id TEXT PRIMARY KEY,calls INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,duration_ms INTEGER NOT NULL DEFAULT 0) STRICT;
    CREATE TABLE IF NOT EXISTS context_bash_program(session_id TEXT NOT NULL,program TEXT NOT NULL,subcommand TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,program_failed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(session_id,program,subcommand)) STRICT;
    CREATE TABLE IF NOT EXISTS context_bash_call(session_id TEXT NOT NULL,call_id TEXT NOT NULL,occurrences_json TEXT,started_at TEXT NOT NULL,PRIMARY KEY(session_id,call_id)) STRICT;
    CREATE TABLE IF NOT EXISTS context_bash_command(session_id TEXT NOT NULL,command TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(session_id,command)) STRICT;
    CREATE TABLE IF NOT EXISTS context_bash_notable(session_id TEXT PRIMARY KEY,slowest_command TEXT NOT NULL DEFAULT '',slowest_ms INTEGER NOT NULL DEFAULT 0,background_count INTEGER NOT NULL DEFAULT 0) STRICT;
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
    CREATE TABLE context_estimate_state(session_id TEXT PRIMARY KEY,state_json TEXT NOT NULL) STRICT;
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
    for (const index of prepare(
      db,
      "SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
    ).all(name) as { name: string; sql: string }[])
      contextConnection(db, false).exec(index.sql.replace(index.name, `context_${index.name}`));
  }
  for (const name of contextTables) {
    const row = prepare(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name) as { sql: string };
    contextConnection(db, true).exec(row.sql);
    for (const index of prepare(
      db,
      "SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
    ).all(name) as { name: string; sql: string }[])
      contextConnection(db, true).exec(index.sql.replace(index.name, `building_${index.name}`));
  }
}
export type ContextHistoryState = {
  target: number;
  revision: number;
  cursor: string | null;
  stamp: string;
  codec: string;
  generation: string;
  projector_version: number;
  building?: boolean;
};
function state(db: ProjectionDatabase, id: string): ContextHistoryState | undefined {
  return prepare(
    db,
    "SELECT target,revision,cursor,stamp,codec,generation,projector_version FROM context_state WHERE session_id=?",
  ).get(id) as unknown as ContextHistoryState | undefined;
}
function sameTarget(saved: ContextHistoryState, source: SessionQuerySource): boolean {
  return (
    saved.target === source.throughSeq &&
    saved.stamp === source.stamp &&
    saved.codec === (source.codecSetDigest ?? "") &&
    saved.projector_version === CONTEXT_PROJECTOR_VERSION
  );
}
export function contextSourceState(db: DatabaseSync, source: SessionQuerySource): ContextHistoryState | null {
  const staging = state(contextConnection(db, true), source.header.sessionId);
  return staging && sameTarget(staging, source)
    ? { ...staging, building: true }
    : (state(db, source.header.sessionId) ?? null);
}
export async function clearContextSession(
  db: DatabaseSync,
  id: string,
  stage: boolean,
  yieldBatch: () => Promise<void>,
): Promise<void> {
  for (const table of [...contextTables].reverse()) {
    const remove = prepare(
      contextConnection(db, stage),
      `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE session_id=? LIMIT 256)`,
    );
    while (remove.run(id).changes) await yieldBatch();
  }
}
export async function commitContextBatch(
  db: DatabaseSync,
  source: SessionQuerySource,
  events: readonly SessionEventEnvelopeV1[],
  cursor: string,
  first: boolean,
  final: boolean,
  reset: boolean,
  yieldBatch: () => Promise<void>,
): Promise<void> {
  const id = source.header.sessionId;
  const saved = state(contextConnection(db, true), id);
  const restart = first && reset;
  const stage = restart || !!(saved && sameTarget(saved, source));
  const target = contextConnection(db, stage);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (restart || (saved && !sameTarget(saved, source))) await clearContextSession(db, id, true, yieldBatch);
    prepare(
      db,
      "INSERT OR IGNORE INTO session_catalog(session_id,title,revision,created_at,updated_at) VALUES(?,NULL,?,?,?)",
    ).run(id, source.throughSeq, source.header.createdAt, source.header.createdAt);
    prepare(target, "INSERT OR IGNORE INTO context_state VALUES(?,?,-1,NULL,?,?,?,?)").run(
      id,
      source.throughSeq,
      source.stamp,
      source.codecSetDigest ?? "",
      randomUUID(),
      CONTEXT_PROJECTOR_VERSION,
    );
    prepare(target, "INSERT OR IGNORE INTO context_session_stats(session_id) VALUES(?)").run(id);
    prepare(target, "INSERT OR IGNORE INTO context_bash_stats(session_id) VALUES(?)").run(id);
    prepare(target, "INSERT OR IGNORE INTO context_bash_notable(session_id) VALUES(?)").run(id);
    await projectContextEvents(target, source, events, yieldBatch);
    prepare(target, "UPDATE context_state SET target=?,revision=?,cursor=?,stamp=?,codec=? WHERE session_id=?").run(
      source.throughSeq,
      final ? source.throughSeq : (events.at(-1)?.seq ?? saved?.revision ?? -1),
      cursor,
      source.stamp,
      source.codecSetDigest ?? "",
      id,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  if (stage && final) {
    db.exec("BEGIN IMMEDIATE");
    try {
      await clearContextSession(db, id, false, yieldBatch);
      for (const table of contextTables) {
        let after = 0;
        for (;;) {
          const ids = prepare(
            db,
            `SELECT rowid AS id FROM building_${table} WHERE session_id=? AND rowid>? ORDER BY rowid LIMIT 256`,
          ).all(id, after) as { id: number }[];
          if (!ids.length) break;
          const end = ids.at(-1)!.id;
          prepare(
            db,
            `INSERT INTO ${table} SELECT * FROM building_${table} WHERE session_id=? AND rowid>? AND rowid<=?`,
          ).run(id, after, end);
          after = end;
          await yieldBatch();
        }
      }
      await clearContextSession(db, id, true, yieldBatch);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
/**
 * 跨批次的折叠状态：估算（与会话投影 `contextEstimate` 同一个函数，agent-spec-request-record.md §6.4）、已见过的 `request/tools` 条数，
 * 以及写上下文事件要用的：当前轮 / 步序号、当前模式、压缩开始时的估算总量、每个补充来源上一次的解析结果、最近写的一条事件（同轮合并用）。
 */
type EstimateRow = {
  estimate: ContextEstimateState;
  toolRecords: number;
  turn?: number | null;
  step?: number | null;
  mode?: string;
  compactionStart?: number | null;
  supplements?: Record<string, SupplementMemory>;
  /** `tail` 不为空时，同轮同来源的下一条可以合进这一行。 */
  last?: { row: ContextPanelEvent; tail?: string } | null;
};
function loadEstimate(db: ProjectionDatabase, id: string): EstimateRow {
  const saved = prepare(db, "SELECT state_json FROM context_estimate_state WHERE session_id=?").get(id) as
    | { state_json: string }
    | undefined;
  if (saved) {
    try {
      return JSON.parse(saved.state_json) as EstimateRow;
    } catch {
      /* 损坏时从头折叠的结果由重建给出 */
    }
  }
  return { estimate: initialContextEstimate(), toolRecords: 0 };
}
type EventValue = Omit<ContextPanelEvent, "at" | "turnIndex" | "stepIndex">;
const supplementTokens = (state: ContextEstimateState, owner: string, id: string) =>
  state.supplements.find((value) => value.owner === owner && value.id === id)?.entry.estimatedTokens ?? 0;
const toolTokens = (state: ContextEstimateState) => state.tools.reduce((sum, entry) => sum + entry.estimatedTokens, 0);
async function projectContextEvents(
  db: ProjectionDatabase,
  source: SessionQuerySource,
  events: readonly SessionEventEnvelopeV1[],
  yieldBatch: () => Promise<void>,
): Promise<void> {
  const id = source.header.sessionId;
  const fold = loadEstimate(db, id);
  /**
   * 写一条事件，位置是当前轮 / 步。`tail` 不为空表示可以合并：上一条事件同轮、同类、同来源时改写那一行（规范 §2 第 6 块）。
   */
  const addEvent = (event: SessionEventEnvelopeV1, value: EventValue, tail?: string) => {
    const at = new Date(event.time).toISOString();
    const turnIndex = fold.turn ?? null;
    const last = fold.last;
    const merge =
      tail !== undefined &&
      last?.tail !== undefined &&
      turnIndex !== null &&
      last.row.turnIndex === turnIndex &&
      last.row.kind === value.kind &&
      last.row.source === value.source &&
      last.row.label === value.label;
    let row: ContextPanelEvent;
    if (merge) {
      const count = (last.row.count ?? 1) + 1;
      const tokenDelta =
        last.row.tokenDelta === null || value.tokenDelta === null ? null : last.row.tokenDelta + value.tokenDelta;
      row = {
        ...value,
        id: last.row.id,
        count,
        detail: mergedDetail(count, tail),
        tokenDelta,
        turnIndex,
        stepIndex: null,
        at,
      };
    } else row = { ...value, turnIndex, stepIndex: fold.step ?? null, at };
    fold.last = { row, ...(tail === undefined ? {} : { tail }) };
    prepare(db, "INSERT OR REPLACE INTO context_event VALUES(?,?,?,?)").run(id, row.id, event.seq, JSON.stringify(row));
  };
  for (const event of events) {
    const data = record(event.data);
    const before = fold.estimate;
    fold.estimate = applyContextEstimate(fold.estimate, event);
    // 「工具清单变化」：第一条 request/tools 之后，每条记一次（工具只在变化时才写这条事件）。
    if (event.type === "request/tools" && fold.toolRecords++ > 0) {
      addEvent(event, {
        id: `${event.seq}:tools`,
        kind: "tools-changed",
        label: "工具清单变化",
        detail: describeToolChange(
          before.tools.map((entry) => entry.title),
          fold.estimate.tools.map((entry) => entry.title),
        ),
        tokenDelta: toolTokens(fold.estimate) - toolTokens(before),
        inferred: true,
      });
    }
    const kind =
      event.type === "turn/start"
        ? "turn"
        : event.type === "step/start"
          ? "step"
          : event.type === "compaction/end"
            ? "compaction"
            : undefined;
    if (kind) {
      const identity = data[kind === "compaction" ? "compactionId" : `${kind}Id`];
      const ordinal =
        kind === "step" && typeof data.stepIndex === "number"
          ? data.stepIndex
          : Number(
              (
                prepare(db, `SELECT ${kind}_count AS n FROM context_session_stats WHERE session_id=?`).get(id) as {
                  n: number;
                }
              ).n,
            ) + 1;
      if (
        typeof identity === "string" &&
        prepare(db, "INSERT OR IGNORE INTO context_identity VALUES(?,?,?,?)").run(id, kind, identity, ordinal).changes
      )
        prepare(db, `UPDATE context_session_stats SET ${kind}_count=${kind}_count+1 WHERE session_id=?`).run(id);
      if (kind !== "compaction" && typeof identity === "string") {
        const known = Number(
          (
            prepare(db, "SELECT ordinal FROM context_identity WHERE session_id=? AND kind=? AND id=?").get(
              id,
              kind,
              identity,
            ) as { ordinal: number } | undefined
          )?.ordinal ?? ordinal,
        );
        if (kind === "turn") {
          fold.turn = known;
          fold.step = null;
        } else fold.step = known;
      }
    }
    // 轮与轮之间发生的事（如空闲时切模式）不挂在上一轮上。
    if (event.type === "turn/end") {
      fold.turn = null;
      fold.step = null;
    }
    if (event.type === "turn/start" && typeof data.mode === "string") fold.mode = data.mode.slice(0, 32);
    if (event.type === "compaction/start") fold.compactionStart = viewContextEstimate(before).totalEstimatedTokens;
    if (event.type === "request/context" && typeof data.requestId === "string") {
      const snapshot = record(data.snapshot);
      const prepared = record(snapshot.prepared);
      const view = viewContextEstimate(fold.estimate);
      const counts = prepare(db, "SELECT turn_count,step_count FROM context_session_stats WHERE session_id=?").get(
        id,
      ) as { turn_count: number; step_count: number };
      const rawModel = record(snapshot.contextModel);
      const positive = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
      const model = {
        modelKey: String(rawModel.modelKey ?? `${prepared.route ?? ""}/${prepared.model ?? ""}`).slice(0, 512),
        label: String(rawModel.label ?? prepared.model ?? "").slice(0, 160),
        contextWindow: positive(rawModel.contextWindow ?? prepared.contextWindow ?? view.contextWindow),
        autoCompactAtTokens: positive(rawModel.autoCompactAtTokens),
      };
      const previous = prepare(
        db,
        "SELECT model_json FROM context_request WHERE session_id=? ORDER BY seq DESC LIMIT 1",
      ).get(id) as { model_json: string } | undefined;
      const previousModel = previous ? record(JSON.parse(previous.model_json)) : null;
      if (previousModel && previousModel.modelKey !== model.modelKey)
        addEvent(event, {
          id: `${event.seq}:model`,
          kind: "model-switch",
          label: "模型切换",
          detail: switchDetail(
            String(previousModel.label || previousModel.modelKey || ""),
            model.label || model.modelKey,
          ),
          tokenDelta: null,
          inferred: true,
        });
      // 只存非对话明细；对话项按 seq 对比（面板服务），不逐条存。
      const entries = view.entries;
      const summary: Omit<ContextContentManifest, "entries"> = {
        schemaVersion: 1,
        estimatorVersion: view.estimatorVersion,
        comparable: true,
        totalEstimatedTokens: view.totalEstimatedTokens,
        buckets: { ...view.buckets },
      };
      prepare(db, "INSERT OR REPLACE INTO context_request VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
        id,
        data.requestId,
        event.seq,
        String(snapshot.logicalAgentScopeId ?? `main:${id}`),
        typeof data.turnId === "string" ? data.turnId : null,
        typeof data.stepId === "string" ? data.stepId : null,
        new Date(event.time).toISOString(),
        JSON.stringify(model),
        JSON.stringify(summary),
        Number(
          (
            prepare(db, "SELECT ordinal FROM context_identity WHERE session_id=? AND kind='turn' AND id=?").get(
              id,
              typeof data.turnId === "string" ? data.turnId : "",
            ) as { ordinal: number } | undefined
          )?.ordinal ?? counts.turn_count,
        ),
        Number(
          (
            prepare(db, "SELECT ordinal FROM context_identity WHERE session_id=? AND kind='step' AND id=?").get(
              id,
              typeof data.stepId === "string" ? data.stepId : "",
            ) as { ordinal: number } | undefined
          )?.ordinal ?? 0,
        ),
      );
      prepare(db, "DELETE FROM context_manifest_entry WHERE session_id=? AND request_id=?").run(id, data.requestId);
      for (const entry of entries)
        prepare(db, "INSERT INTO context_manifest_entry VALUES(?,?,?,?)").run(
          id,
          data.requestId,
          entry.key,
          JSON.stringify(entry),
        );
      prepare(
        db,
        "DELETE FROM context_manifest_entry WHERE session_id=? AND request_id NOT IN (SELECT request_id FROM context_request WHERE session_id=? ORDER BY seq DESC LIMIT 2)",
      ).run(id, id);
    }
    if (event.type === "tool/call" || event.type === "tool-workflow/run-start" || event.type === "tool/result")
      projectBashEvent(db, id, event, data);
    if (event.type === "compaction/end") {
      const start = fold.compactionStart;
      addEvent(event, {
        id: `${event.seq}:compact`,
        kind: "compact",
        label: "上下文已压缩",
        detail: "旧对话换成摘要",
        tokenDelta: typeof start === "number" ? viewContextEstimate(fold.estimate).totalEstimatedTokens - start : null,
      });
      fold.compactionStart = null;
    }
    if (event.type === "agent/mode-set") {
      const mode = String(data.mode ?? "未知").slice(0, 32);
      addEvent(event, {
        id: `${event.seq}:mode`,
        kind: "mode-switch",
        label: "模式切换",
        detail: switchDetail(fold.mode, mode),
        tokenDelta: null,
      });
      fold.mode = mode;
    }
    if (
      event.type === "plugin/actspace.context/supplement" &&
      data.op === "add" &&
      typeof data.owner === "string" &&
      typeof data.id === "string" &&
      typeof data.text === "string"
    ) {
      const key = JSON.stringify([data.owner, data.id]);
      const memory = (fold.supplements ??= {});
      const described = describeSupplementEvent(data.owner, data.id, data.text, memory[key]);
      memory[key] = described.memory;
      const tokenDelta =
        supplementTokens(fold.estimate, data.owner, data.id) - supplementTokens(before, data.owner, data.id);
      addEvent(
        event,
        {
          id: `${event.seq}:inject`,
          kind: described.kind,
          label: described.label,
          detail: described.detail,
          source: data.owner.slice(0, 80),
          tokenDelta,
        },
        described.tail,
      );
    }
  }
  prepare(
    db,
    "INSERT INTO context_estimate_state VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET state_json=excluded.state_json",
  ).run(id, JSON.stringify(fold));
  await projectUsageJournalBatch(
    db,
    { sessionId: id, title: null, throughJournalSeq: source.throughSeq, workspaceRoot: null },
    events.filter((event) => !event.type.startsWith("tool/")),
    async (rows) => {
      for (const row of rows) {
        if (row.kind !== "llm_request") continue;
        const saved = prepare(db, "SELECT row_json FROM context_usage_row WHERE session_id=? AND activity_id=?").get(
          id,
          row.activityId,
        ) as { row_json: string } | undefined;
        if (saved) applyUsage(db, id, JSON.parse(saved.row_json), -1);
        // No prompt/body, only the existing canonical request accounting result.
        const compact = {
          kind: row.kind,
          requestId: row.requestId,
          tokens: row.tokens,
          costAmount: row.costAmount,
          costCurrency: row.costCurrency,
        };
        prepare(db, "INSERT OR REPLACE INTO context_usage_row VALUES(?,?,?)").run(
          id,
          row.activityId,
          JSON.stringify(compact),
        );
        applyUsage(db, id, compact, 1);
      }
      await yieldBatch();
    },
  );
}
/** `tool/call` 记下解析结果，`run-start` 更新开始时间，`tool/result` 计入。只有 `tool/call` 写过行的调用才会被计入。 */
function projectBashEvent(
  db: ProjectionDatabase,
  id: string,
  event: SessionEventEnvelopeV1,
  data: Record<string, unknown>,
): void {
  const callId = data.callId;
  if (typeof callId !== "string") return;
  if (event.type === "tool/call") {
    const command = record(data.args).command;
    if (data.name !== "bash" || typeof command !== "string") return;
    const occurrences = parseBashPrograms(command).map((item) => [item.program, item.subcommand]);
    prepare(db, "INSERT OR IGNORE INTO context_bash_call VALUES(?,?,?,?)").run(
      id,
      callId,
      JSON.stringify({ occurrences, command: command.trim().slice(0, CONTEXT_BASH_COMMAND_TEXT_LIMIT) }),
      event.time,
    );
    return;
  }
  if (event.type === "tool-workflow/run-start") {
    prepare(
      db,
      "UPDATE context_bash_call SET started_at=? WHERE session_id=? AND call_id=? AND occurrences_json IS NOT NULL",
    ).run(event.time, id, callId);
    return;
  }
  const call = prepare(
    db,
    "SELECT occurrences_json,started_at FROM context_bash_call WHERE session_id=? AND call_id=?",
  ).get(id, callId) as { occurrences_json: string | null; started_at: string } | undefined;
  if (!call?.occurrences_json) return;
  prepare(db, "UPDATE context_bash_call SET occurrences_json=NULL WHERE session_id=? AND call_id=?").run(id, callId);
  // 被拒绝的命令没有执行，不计。
  if (data.status === "denied") return;
  const failed = data.status === "failed";
  const started = Date.parse(call.started_at);
  const ended = Date.parse(event.time);
  const duration = Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, Math.round(ended - started)) : 0;
  prepare(
    db,
    "UPDATE context_bash_stats SET calls=calls+1,failed=failed+?,duration_ms=duration_ms+? WHERE session_id=?",
  ).run(Number(failed), duration, id);
  const saved = JSON.parse(call.occurrences_json) as
    | [string, string][]
    | { occurrences: [string, string][]; command?: string };
  const pairs = Array.isArray(saved) ? saved : saved.occurrences;
  const commandText = Array.isArray(saved) ? "" : (saved.command ?? "");
  if (commandText) projectBashNotable(db, id, commandText, duration, hasBackgroundTask(data.detail));
  const failedPairs = new Set<string>();
  const failedPrograms = new Set<string>();
  for (const [rawProgram, rawSubcommand] of pairs) {
    const known = prepare(
      db,
      "SELECT 1 FROM context_bash_program WHERE session_id=? AND program=? AND subcommand=?",
    ).get(id, rawProgram, rawSubcommand);
    const full =
      !known &&
      Number(
        (prepare(db, "SELECT COUNT(*) AS n FROM context_bash_program WHERE session_id=?").get(id) as { n: number }).n,
      ) >= CONTEXT_BASH_PROGRAM_LIMIT;
    const [program, subcommand] = full ? ["", ""] : [rawProgram, rawSubcommand];
    const pair = JSON.stringify([program, subcommand]);
    const pairFailed = failed && !failedPairs.has(pair);
    const programFailed = failed && !failedPrograms.has(program);
    if (pairFailed) failedPairs.add(pair);
    if (programFailed) failedPrograms.add(program);
    prepare(
      db,
      "INSERT INTO context_bash_program VALUES(?,?,?,1,?,?) ON CONFLICT(session_id,program,subcommand) DO UPDATE SET count=count+1,failed=failed+excluded.failed,program_failed=program_failed+excluded.program_failed",
    ).run(id, program, subcommand, Number(pairFailed), Number(programFailed));
  }
}
/** 与 `tool-card.ts` 同一判据：Bash 结果带 `background-task` 明细即转入（或本来就在）后台运行。 */
function hasBackgroundTask(detail: unknown): boolean {
  return Array.isArray(detail) && detail.some((entry) => record(entry).label === "background-task");
}
/** 最慢的一条（耗时与「合计耗时」同一个 `duration`，同耗时保留先出现的）、命令原文重复次数、后台调用数。 */
function projectBashNotable(
  db: ProjectionDatabase,
  id: string,
  command: string,
  duration: number,
  background: boolean,
): void {
  prepare(db, "UPDATE context_bash_notable SET slowest_command=?,slowest_ms=? WHERE session_id=? AND ?>slowest_ms").run(
    command,
    duration,
    id,
    duration,
  );
  if (background)
    prepare(db, "UPDATE context_bash_notable SET background_count=background_count+1 WHERE session_id=?").run(id);
  const known = prepare(db, "SELECT 1 FROM context_bash_command WHERE session_id=? AND command=?").get(id, command);
  if (
    !known &&
    Number(
      (prepare(db, "SELECT COUNT(*) AS n FROM context_bash_command WHERE session_id=?").get(id) as { n: number }).n,
    ) >= CONTEXT_BASH_COMMAND_LIMIT
  )
    return;
  prepare(
    db,
    "INSERT INTO context_bash_command VALUES(?,?,1) ON CONFLICT(session_id,command) DO UPDATE SET count=count+1",
  ).run(id, command);
}
function applyUsage(
  db: ProjectionDatabase,
  id: string,
  row: Pick<UsageActivityRow, "tokens" | "costAmount" | "costCurrency">,
  sign: number,
): void {
  const t = row.tokens;
  const knownUsage = [t.inputTokens, t.outputTokens, t.cacheReadTokens, t.cacheWriteTokens].some(
    (value) => value !== null,
  );
  const knownCost = row.costAmount !== undefined && row.costAmount !== null && row.costCurrency === "USD";
  prepare(
    db,
    "UPDATE context_session_stats SET usage_count=usage_count+?,input_tokens=input_tokens+?,output_tokens=output_tokens+?,cache_read_tokens=cache_read_tokens+?,cache_write_tokens=cache_write_tokens+?,known_cost_count=known_cost_count+?,unknown_cost_count=unknown_cost_count+?,cost_usd=cost_usd+? WHERE session_id=?",
  ).run(
    sign * Number(knownUsage),
    sign * (t.inputTokens ?? 0),
    sign * (t.outputTokens ?? 0),
    sign * (t.cacheReadTokens ?? 0),
    sign * (t.cacheWriteTokens ?? 0),
    sign * Number(knownCost),
    sign * Number(!knownCost),
    sign * (knownCost ? row.costAmount! : 0),
    id,
  );
}
