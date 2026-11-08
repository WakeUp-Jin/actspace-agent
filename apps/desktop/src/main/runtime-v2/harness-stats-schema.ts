import { HARNESS_HISTOGRAM_BUCKETS } from "@actspace/shared";
import { prepare, type ProjectionDatabase } from "./usage-sql";

/**
 * Harness 统计的会话级表。每张表的前五列固定是 session_id、hour、revision、mode、model，
 * 查询层据此统一做时间 / 版本 / 模式 / 模型筛选；工作区与会话类型通过 harness_session_meta 关联。
 * 设计见 docs/design-docs/自进化的方案设计/11-Harness统计设计.md §4；v18 瘦身见 docs/design-docs/frontend/front-统计页规范.md §5.2。
 */
export type HarnessColumnKind = "sum" | "max" | "last" | "hist" | "sleep-hist" | "counts";
export type HarnessTableSpec = {
  readonly name: string;
  /** session_id 之后的主键列（hour / revision / mode / model 是普通维度列，但汇总表把它们放进主键）。 */
  readonly keys: readonly string[];
  readonly integerKeys?: readonly string[];
  readonly columns: Readonly<Record<string, HarnessColumnKind>>;
  /** 归档时是否随会话保留。 */
  readonly archive: boolean;
};

const DIMS = ["hour", "revision", "mode", "model"] as const;
const dims = (...rest: string[]) => [...DIMS, ...rest];

export const HARNESS_TABLES = {
  tool: {
    name: "harness_tool_rollup", keys: dims("tool"), archive: true,
    columns: {
      plugin_id: "last", exposures: "sum", calls: "sum", failed: "sum", failure_codes: "counts", schema_tokens: "sum", schema_samples: "sum",
      approval_wait_ms: "sum", approval_wait_samples: "sum", duration_ms: "sum", duration_samples: "sum", duration_hist: "hist",
      output_tokens: "sum", output_samples: "sum", output_hist: "hist", truncated: "sum", repeated: "sum",
    },
  },
  bash: {
    name: "harness_bash_rollup", keys: dims("program", "subcommand"), archive: true,
    columns: { calls: "sum", failed: "sum", duration_ms: "sum", duration_samples: "sum" },
  },
  entry: {
    name: "harness_entry_rollup", keys: dims("entry_key"), archive: true,
    columns: { kind: "last", bucket: "last", owner: "last", entry_id: "last", appearances: "sum", tokens: "sum", max_tokens: "max", changes: "sum", compared: "sum" },
  },
  request: {
    name: "harness_request", keys: ["request_id"], archive: true,
    columns: {
      hour: "last", revision: "last", mode: "last", model: "last", time: "last", estimated: "last", b_system: "last", b_tools: "last", b_rules: "last", b_skills: "last",
      b_summarized: "last", b_conversation: "last", context_window: "last", input_tokens: "last", cache_read: "last", cache_write: "last", has_manifest: "last",
      harness_changed: "last",
    },
  },
  skill: {
    name: "harness_skill_rollup", keys: dims("skill_id"), archive: true,
    columns: { source: "last", listed: "sum", skill_reads: "sum", asset_reads: "sum", last_read_at: "max" },
  },
  skillFile: {
    name: "harness_skill_file", keys: dims("skill_id", "file"), archive: true,
    columns: { reads: "sum", last_read_at: "max" },
  },
  compaction: {
    name: "harness_compaction", keys: ["compaction_id"], archive: true,
    columns: {
      hour: "last", revision: "last", mode: "last", model: "last", time: "last", trigger: "last", ok: "last", failure_code: "last", duration_ms: "last",
      before_tokens: "last", after_tokens: "last", steps_since: "last", window_ratio: "last", folded: "sum", folded_tokens: "sum", reread: "sum",
    },
  },
  cycle: {
    name: "harness_disclosure_cycle", keys: ["cycle"], integerKeys: ["cycle"], archive: true,
    columns: { hour: "last", revision: "last", mode: "last", model: "last", active: "last", cap_hit: "last", active_read: "last" },
  },
  disclosure: {
    name: "harness_disclosure_rollup", keys: dims(), archive: true,
    columns: { mis_sleeps: "sum", slept_paths: "sum", index_reads: "sum", index_conversions: "sum", sleep_hist: "sleep-hist" },
  },
  path: {
    name: "harness_path_reads", keys: dims("path"), archive: true,
    columns: { reads: "sum", last_read_at: "max" },
  },
  delegation: {
    name: "harness_delegation", keys: ["invocation_id"], archive: true,
    columns: { hour: "last", revision: "last", mode: "last", model: "last", time: "last", preset_id: "last", status: "last", child_session_id: "last", duration_ms: "last" },
  },
  /** 工具输出的 token 数，等压缩折叠时算「拿掉的工具输出」；不归档。 */
  output: {
    name: "harness_tool_output", keys: ["seq"], integerKeys: ["seq"], archive: false,
    columns: { tokens: "last" },
  },
} as const satisfies Record<string, HarnessTableSpec>;
export type HarnessTableId = keyof typeof HARNESS_TABLES;

export const HARNESS_STATE_TABLE = "harness_session_state";
/** 参与会话同步（暂存、发布、清理）的全部表。 */
export const HARNESS_SESSION_TABLES: readonly string[] = [...Object.values(HARNESS_TABLES).map(spec => spec.name), HARNESS_STATE_TABLE];
export const HARNESS_SLEEP_BUCKETS = 6;

function columnType(kind: HarnessColumnKind): string {
  return kind === "sum" ? "REAL NOT NULL DEFAULT 0" : kind === "hist" || kind === "sleep-hist" || kind === "counts" ? "TEXT" : "ANY";
}

export function createHarnessStatsSchema(db: ProjectionDatabase): void {
  const sql: string[] = [];
  for (const spec of Object.values(HARNESS_TABLES) as HarnessTableSpec[]) {
    const keyColumns = spec.keys.map(key => `${key} ${spec.integerKeys?.includes(key) ? "INTEGER" : "TEXT"} NOT NULL`);
    const columns = Object.entries(spec.columns).filter(([name]) => !spec.keys.includes(name)).map(([name, kind]) => `${name} ${columnType(kind)}`);
    sql.push(`CREATE TABLE IF NOT EXISTS ${spec.name}(session_id TEXT NOT NULL,${[...keyColumns, ...columns].join(",")},PRIMARY KEY(session_id,${spec.keys.join(",")})) STRICT;`);
    if (spec.keys.includes("hour") || "hour" in spec.columns) sql.push(`CREATE INDEX IF NOT EXISTS ${spec.name}_hour_idx ON ${spec.name}(hour);`);
  }
  sql.push(`CREATE TABLE IF NOT EXISTS ${HARNESS_STATE_TABLE}(session_id TEXT PRIMARY KEY,last_seq INTEGER NOT NULL,state_json TEXT NOT NULL) STRICT;`);
  // 不参与会话同步：会话删除后仍保留，查询时提供工作区与会话类型。
  sql.push("CREATE TABLE IF NOT EXISTS harness_session_meta(session_id TEXT PRIMARY KEY,workspace_root TEXT,kind TEXT NOT NULL,parent_id TEXT,deleted INTEGER NOT NULL DEFAULT 0) STRICT;");
  // 运行时统计文件与 Harness 版本记录的汇总（全局，不按会话）。
  sql.push("CREATE TABLE IF NOT EXISTS harness_runtime_hourly(hour TEXT NOT NULL,revision TEXT NOT NULL,kind TEXT NOT NULL,plugin TEXT NOT NULL,name TEXT NOT NULL,method TEXT NOT NULL,provider TEXT,calls REAL NOT NULL,errors REAL NOT NULL,total_ms REAL NOT NULL,histogram TEXT NOT NULL,PRIMARY KEY(hour,revision,kind,plugin,name,method)) STRICT;");
  sql.push("CREATE TABLE IF NOT EXISTS harness_plugin_inventory(revision TEXT NOT NULL,plugin TEXT NOT NULL,source TEXT NOT NULL,provides TEXT NOT NULL,loads INTEGER NOT NULL,failures INTEGER NOT NULL,last_error TEXT,load_hist TEXT NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL,PRIMARY KEY(revision,plugin)) STRICT;");
  sql.push("CREATE TABLE IF NOT EXISTS harness_tool_owner(revision TEXT NOT NULL,tool TEXT NOT NULL,plugin TEXT NOT NULL,tool_plugin_id TEXT,last_seen TEXT NOT NULL,PRIMARY KEY(revision,tool)) STRICT;");
  sql.push("CREATE TABLE IF NOT EXISTS harness_revision_info(revision TEXT PRIMARY KEY,harness_id TEXT,number INTEGER,description TEXT,selected_at TEXT,selection_seq INTEGER) STRICT;");
  db.exec(sql.join("\n"));
}

/* ------------------------------ 批内累加 ------------------------------ */

type Value = string | number | null;
type Row = { readonly key: readonly Value[]; values: Record<string, unknown> };

/**
 * 一个输入批次内的累加器：同一主键的多次更新先在内存合并，批末每个主键只读写一次。
 * sum 相加；max 取大；last 非空覆盖；hist 逐档相加；counts 按键相加。
 */
export class HarnessAccumulator {
  readonly #rows = new Map<HarnessTableId, Map<string, Row>>();

  add(table: HarnessTableId, sessionId: string, key: Readonly<Record<string, Value>>, values: Readonly<Record<string, unknown>>): void {
    const spec: HarnessTableSpec = HARNESS_TABLES[table];
    const keyValues = [sessionId, ...spec.keys.map(name => key[name] ?? "")];
    const id = JSON.stringify(keyValues);
    let rows = this.#rows.get(table); if (!rows) { rows = new Map(); this.#rows.set(table, rows); }
    let row = rows.get(id); if (!row) { row = { key: keyValues, values: {} }; rows.set(id, row); }
    mergeValues(spec, row.values, values);
  }

  get size(): number { let size = 0; for (const rows of this.#rows.values()) size += rows.size; return size; }

  flush(db: ProjectionDatabase): void {
    for (const [table, rows] of this.#rows) {
      const spec: HarnessTableSpec = HARNESS_TABLES[table];
      const keyNames = ["session_id", ...spec.keys];
      const columns = Object.keys(spec.columns).filter(name => !spec.keys.includes(name));
      const where = keyNames.map(name => `${name}=?`).join(" AND ");
      const select = prepare(db, `SELECT ${columns.join(",")} FROM ${spec.name} WHERE ${where}`);
      const insert = prepare(db, `INSERT OR REPLACE INTO ${spec.name}(${[...keyNames, ...columns].join(",")}) VALUES(${[...keyNames, ...columns].map(() => "?").join(",")})`);
      for (const row of rows.values()) {
        const existing = select.get(...(row.key as (string | number)[])) as Record<string, unknown> | undefined;
        const merged: Record<string, unknown> = {};
        if (existing) for (const name of columns) merged[name] = decode(spec.columns[name]!, existing[name]);
        mergeValues(spec, merged, row.values);
        insert.run(...(row.key as (string | number)[]), ...columns.map(name => encode(spec.columns[name]!, merged[name])) as (string | number | null)[]);
      }
    }
    this.#rows.clear();
  }
}

function mergeValues(spec: HarnessTableSpec, target: Record<string, unknown>, values: Readonly<Record<string, unknown>>): void {
  for (const [name, value] of Object.entries(values)) {
    const kind = spec.columns[name];
    if (kind === undefined || value === undefined) continue;
    if (kind === "sum") target[name] = Number(target[name] ?? 0) + Number(value ?? 0);
    else if (kind === "max") {
      const current = target[name];
      if (value === null) continue;
      if (current == null || (typeof value === "number" && typeof current === "number" ? value > current : String(value) > String(current))) target[name] = value;
    }
    else if (kind === "last") { if (value !== null) target[name] = value; }
    else if (kind === "hist" || kind === "sleep-hist") {
      const size = kind === "hist" ? HARNESS_HISTOGRAM_BUCKETS : HARNESS_SLEEP_BUCKETS;
      const current = Array.isArray(target[name]) ? target[name] as number[] : Array.from({ length: size }, () => 0);
      const add = value as readonly number[];
      for (let index = 0; index < size; index++) current[index] = (current[index] ?? 0) + (add[index] ?? 0);
      target[name] = current;
    } else {
      const current = (target[name] && typeof target[name] === "object" ? target[name] : {}) as Record<string, number>;
      for (const [code, count] of Object.entries(value as Record<string, number>)) current[code] = (current[code] ?? 0) + count;
      target[name] = current;
    }
  }
}
function decode(kind: HarnessColumnKind, value: unknown): unknown {
  if ((kind === "hist" || kind === "sleep-hist" || kind === "counts") && typeof value === "string") { try { return JSON.parse(value); } catch { return undefined; } }
  return value ?? undefined;
}
function encode(kind: HarnessColumnKind, value: unknown): Value {
  if (kind === "hist" || kind === "sleep-hist" || kind === "counts") return value === undefined ? null : JSON.stringify(value);
  if (kind === "sum") return Number(value ?? 0);
  return value === undefined ? null : value as Value;
}

/** 单点直方图：value 落在哪一档，哪一档记 1。 */
export function harnessHistogramPoint(index: number, size = HARNESS_HISTOGRAM_BUCKETS): number[] {
  const histogram = Array.from({ length: size }, () => 0);
  histogram[Math.max(0, Math.min(size - 1, index))] = 1;
  return histogram;
}
