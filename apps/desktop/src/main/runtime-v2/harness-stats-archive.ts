import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { prepare } from "./usage-sql";
import { HARNESS_TABLES, type HarnessTableSpec } from "./harness-stats-schema";

/**
 * 会话删除后 Harness 统计永久保留（D9 / D15）：
 * 会话从目录移除时，把它在各会话级表里的行打包追加到 `<dataRoot>/harness-stats/archived-sessions.jsonl`；
 * SQLite 里的行同时保留，只把 harness_session_meta 标为已删除。统计库重建时读回归档。
 * 归档行按列名写入，读回时只取当前表存在的列，缺的列为空，因此 Schema 变化不需要迁移脚本。
 */
export const HARNESS_ARCHIVE_VERSION = 1;
type ArchiveLine = {
  v: number;
  sessionId: string;
  archivedAt: string;
  meta: { workspaceRoot: string | null; kind: string; parentId: string | null };
  tables: Record<string, { columns: string[]; rows: unknown[][] }>;
};

export function harnessArchivePath(root: string): string { return join(root, "harness-stats", "archived-sessions.jsonl"); }

/** 用会话目录刷新工作区、会话类型；目录里没有的会话保持原样（已删除的会话靠它筛选）。 */
export function refreshHarnessSessionMeta(db: DatabaseSync): void {
  prepare(db, `INSERT INTO harness_session_meta(session_id,workspace_root,kind,parent_id,deleted)
    SELECT session_id,COALESCE(json_extract(worktree_json,'$.sourceWorkspaceRoot'),workspace_root),
      CASE WHEN side_chat_parent_id IS NOT NULL THEN 'side' WHEN is_child_session=1 THEN 'child' ELSE 'main' END,side_chat_parent_id,0
    FROM session_catalog WHERE true
    ON CONFLICT(session_id) DO UPDATE SET workspace_root=excluded.workspace_root,kind=excluded.kind,parent_id=excluded.parent_id,deleted=0
    WHERE harness_session_meta.workspace_root IS NOT excluded.workspace_root OR harness_session_meta.kind<>excluded.kind OR harness_session_meta.parent_id IS NOT excluded.parent_id OR harness_session_meta.deleted<>0`).run();
}

/** 在删除会话目录行之前调用：写归档、标记删除、清掉只用于增量同步的表。 */
export function archiveHarnessSession(db: DatabaseSync, root: string, sessionId: string, now = new Date()): void {
  refreshHarnessSessionMeta(db);
  const meta = prepare(db, "SELECT workspace_root,kind,parent_id FROM harness_session_meta WHERE session_id=?").get(sessionId) as { workspace_root: string | null; kind: string; parent_id: string | null } | undefined;
  const tables: ArchiveLine["tables"] = {};
  let rows = 0;
  for (const spec of Object.values(HARNESS_TABLES) as HarnessTableSpec[]) {
    if (!spec.archive) continue;
    const columns = (prepare(db, `PRAGMA table_info(${spec.name})`).all() as { name: string }[]).map(row => row.name);
    const values = prepare(db, `SELECT * FROM ${spec.name} WHERE session_id=?`).all(sessionId) as Record<string, unknown>[];
    if (!values.length) continue;
    tables[spec.name] = { columns, rows: values.map(value => columns.map(name => value[name] ?? null)) };
    rows += values.length;
  }
  prepare(db, "DELETE FROM harness_tool_output WHERE session_id=?").run(sessionId);
  prepare(db, "DELETE FROM harness_session_state WHERE session_id=?").run(sessionId);
  prepare(db, "INSERT INTO harness_session_meta(session_id,workspace_root,kind,parent_id,deleted) VALUES(?,?,?,?,1) ON CONFLICT(session_id) DO UPDATE SET deleted=1").run(sessionId, meta?.workspace_root ?? null, meta?.kind ?? "main", meta?.parent_id ?? null);
  if (!rows) return;
  const line: ArchiveLine = { v: HARNESS_ARCHIVE_VERSION, sessionId, archivedAt: now.toISOString(), meta: { workspaceRoot: meta?.workspace_root ?? null, kind: meta?.kind ?? "main", parentId: meta?.parent_id ?? null }, tables };
  mkdirSync(join(root, "harness-stats"), { recursive: true });
  appendFileSync(harnessArchivePath(root), `${JSON.stringify(line)}\n`, { mode: 0o600 });
}

/** 新建（或重建）统计库后读回归档。同一会话多行时取最后一行。返回读回的会话数。 */
export function ingestHarnessArchive(db: DatabaseSync, root: string): number {
  let content: string;
  try { content = readFileSync(harnessArchivePath(root), "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0; throw error; }
  const latest = new Map<string, ArchiveLine>();
  for (const raw of content.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const line = JSON.parse(raw) as ArchiveLine;
      if (typeof line.sessionId === "string" && line.tables && typeof line.tables === "object") latest.set(line.sessionId, line);
    } catch { /* 写到一半的行：跳过 */ }
  }
  if (!latest.size) return 0;
  const known = new Map<string, Set<string>>();
  for (const spec of Object.values(HARNESS_TABLES) as HarnessTableSpec[]) known.set(spec.name, new Set((prepare(db, `PRAGMA table_info(${spec.name})`).all() as { name: string }[]).map(row => row.name)));
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const line of latest.values()) {
      for (const [table, data] of Object.entries(line.tables)) {
        const columns = known.get(table); if (!columns || !Array.isArray(data.columns)) continue;
        const indexes = data.columns.map((name, index) => [name, index] as const).filter(([name]) => columns.has(name));
        if (!indexes.some(([name]) => name === "session_id")) continue;
        const insert = prepare(db, `INSERT OR REPLACE INTO ${table}(${indexes.map(([name]) => name).join(",")}) VALUES(${indexes.map(() => "?").join(",")})`);
        for (const row of data.rows) if (Array.isArray(row)) insert.run(...indexes.map(([, index]) => row[index] as string | number | null));
      }
      prepare(db, "INSERT INTO harness_session_meta(session_id,workspace_root,kind,parent_id,deleted) VALUES(?,?,?,?,1) ON CONFLICT(session_id) DO NOTHING").run(line.sessionId, line.meta?.workspaceRoot ?? null, line.meta?.kind ?? "main", line.meta?.parentId ?? null);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return latest.size;
}
