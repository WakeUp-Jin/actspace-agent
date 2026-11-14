import { closeSync, fstatSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  addHarnessHistograms,
  emptyHarnessHistogram,
  harnessHistogramIndex,
  harnessRevisionKey,
  HARNESS_DURATION_BASE_MS,
  type HarnessStatsFileLine,
} from "@actspace/shared";
import { prepare } from "./usage-sql";

/**
 * 读 `<dataRoot>/harness-stats/YYYY-MM.jsonl` 的新增部分（按“文件名 → 已读字节”游标，只处理以换行结尾的完整行），
 * 以及 `<dataRoot>/harness-state/selections.jsonl` 的版本记录。文件变短视为被替换，运行时表整体重读。
 */
const FILE_PATTERN = /^\d{4}-\d{2}\.jsonl$/;
const CURSOR_PREFIX = "harness-stats-file:";
const MAX_READ_BYTES = 32 * 1024 * 1024;

export type HarnessRuntimeIngestResult = { files: number; lines: number; bytes: number; reset: boolean };

export function ingestHarnessRuntimeFiles(db: DatabaseSync, root: string): HarnessRuntimeIngestResult {
  const dir = join(root, "harness-stats");
  let names: string[] = [];
  try {
    names = readdirSync(dir)
      .filter((name) => FILE_PATTERN.test(name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const cursor = prepare(db, "SELECT value FROM index_state WHERE key=?");
  const sizes = new Map(
    names.map((name) => {
      try {
        return [name, statSync(join(dir, name)).size] as const;
      } catch {
        return [name, 0] as const;
      }
    }),
  );
  const reset =
    names.some(
      (name) =>
        Number((cursor.get(CURSOR_PREFIX + name) as { value: string } | undefined)?.value ?? 0) >
        (sizes.get(name) ?? 0),
    ) ||
    (prepare(db, "SELECT key FROM index_state WHERE key LIKE ?").all(`${CURSOR_PREFIX}%`) as { key: string }[]).some(
      (row) => !sizes.has(row.key.slice(CURSOR_PREFIX.length)),
    );
  let lines = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (reset) {
      for (const table of ["harness_runtime_hourly", "harness_plugin_inventory", "harness_tool_owner"])
        db.exec(`DELETE FROM ${table}`);
      prepare(db, "DELETE FROM index_state WHERE key LIKE ?").run(`${CURSOR_PREFIX}%`);
    }
    for (const name of names) {
      const offset = reset
        ? 0
        : Number((cursor.get(CURSOR_PREFIX + name) as { value: string } | undefined)?.value ?? 0);
      const size = sizes.get(name) ?? 0;
      if (size <= offset) continue;
      const { text, consumed } = readComplete(join(dir, name), offset, Math.min(size - offset, MAX_READ_BYTES));
      for (const raw of text.split("\n")) {
        if (!raw.trim()) continue;
        let line: HarnessStatsFileLine;
        try {
          line = JSON.parse(raw) as HarnessStatsFileLine;
        } catch {
          continue;
        }
        if (applyLine(db, line)) lines++;
      }
      prepare(
        db,
        "INSERT INTO index_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(CURSOR_PREFIX + name, String(offset + consumed));
    }
    const bytes = [...sizes.values()].reduce((sum, value) => sum + value, 0);
    ingestSelections(db, root);
    db.exec("COMMIT");
    return { files: names.length, lines, bytes, reset };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function readComplete(path: string, offset: number, length: number): { text: string; consumed: number } {
  const fd = openSync(path, "r");
  try {
    const available = Math.min(length, fstatSync(fd).size - offset);
    if (available <= 0) return { text: "", consumed: 0 };
    const buffer = Buffer.alloc(available);
    const read = readSync(fd, buffer, 0, available, offset);
    const end = buffer.subarray(0, read).lastIndexOf(0x0a);
    if (end < 0) return { text: "", consumed: 0 };
    return { text: buffer.subarray(0, end + 1).toString("utf8"), consumed: end + 1 };
  } finally {
    closeSync(fd);
  }
}

function applyLine(db: DatabaseSync, line: HarnessStatsFileLine): boolean {
  if (!line || typeof line !== "object" || line.v !== 1) return false;
  if (line.t === "runtime") {
    // 旧文件里的 dependency 行（v18 起不再记）直接跳过。
    if (line.kind !== "service" && line.kind !== "listener") return false;
    if (typeof line.hour !== "string" || typeof line.plugin !== "string" || typeof line.name !== "string") return false;
    const hour = line.hour.slice(0, 13);
    const key = [
      hour,
      String(line.revision ?? "unknown"),
      line.kind,
      line.plugin,
      line.name,
      String(line.method ?? ""),
    ];
    const existing = prepare(
      db,
      "SELECT calls,errors,total_ms,histogram FROM harness_runtime_hourly WHERE hour=? AND revision=? AND kind=? AND plugin=? AND name=? AND method=?",
    ).get(...key) as { calls: number; errors: number; total_ms: number; histogram: string } | undefined;
    const histogram = addHarnessHistograms(
      existing ? safeHistogram(existing.histogram) : emptyHarnessHistogram(),
      Array.isArray(line.histogram) ? line.histogram : [],
    );
    prepare(
      db,
      "INSERT OR REPLACE INTO harness_runtime_hourly(hour,revision,kind,plugin,name,method,provider,calls,errors,total_ms,histogram) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      ...key,
      line.provider ?? null,
      (existing?.calls ?? 0) + Number(line.calls ?? 0),
      (existing?.errors ?? 0) + Number(line.errors ?? 0),
      (existing?.total_ms ?? 0) + Number(line.totalMs ?? 0),
      JSON.stringify(histogram),
    );
    return true;
  }
  if (line.t === "inventory") {
    if (typeof line.plugin !== "string") return false;
    const existing = prepare(
      db,
      "SELECT loads,failures,last_error,load_hist,first_seen,last_seen FROM harness_plugin_inventory WHERE revision=? AND plugin=?",
    ).get(line.revision, line.plugin) as
      | {
          loads: number;
          failures: number;
          last_error: string | null;
          load_hist: string;
          first_seen: string;
          last_seen: string;
        }
      | undefined;
    const histogram = existing ? safeHistogram(existing.load_hist) : emptyHarnessHistogram();
    if (typeof line.loadMs === "number") histogram[harnessHistogramIndex(line.loadMs, HARNESS_DURATION_BASE_MS)] += 1;
    prepare(
      db,
      "INSERT OR REPLACE INTO harness_plugin_inventory(revision,plugin,source,provides,loads,failures,last_error,load_hist,first_seen,last_seen) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(
      line.revision,
      line.plugin,
      line.source ?? "unknown",
      JSON.stringify(Array.isArray(line.provides) ? line.provides : []),
      (existing?.loads ?? 0) + 1,
      (existing?.failures ?? 0) + (line.ok ? 0 : 1),
      line.ok ? (existing?.last_error ?? null) : (line.error ?? "unknown"),
      JSON.stringify(histogram),
      minString(existing?.first_seen, line.at),
      maxString(existing?.last_seen, line.at),
    );
    return true;
  }
  if (line.t === "tool-owner") {
    if (typeof line.tool !== "string" || typeof line.plugin !== "string") return false;
    prepare(
      db,
      "INSERT INTO harness_tool_owner(revision,tool,plugin,tool_plugin_id,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(revision,tool) DO UPDATE SET plugin=excluded.plugin,tool_plugin_id=excluded.tool_plugin_id,last_seen=excluded.last_seen",
    ).run(line.revision, line.tool, line.plugin, line.toolPluginId ?? null, line.at);
    return true;
  }
  return false;
}

/** Harness 版本记录：文件很小（每次切换版本一行），每次整体重读。 */
function ingestSelections(db: DatabaseSync, root: string): void {
  let content: string;
  try {
    content = readFileSync(join(root, "harness-state", "selections.jsonl"), "utf8");
  } catch {
    return;
  }
  const upsert = prepare(
    db,
    "INSERT INTO harness_revision_info(revision,harness_id,number,description,selected_at,selection_seq) VALUES(?,?,?,?,?,?) ON CONFLICT(revision) DO UPDATE SET description=excluded.description,selected_at=excluded.selected_at,selection_seq=excluded.selection_seq",
  );
  for (const raw of content.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const entry = JSON.parse(raw) as {
        seq?: number;
        record?: { harnessId?: string; revision?: number; requestDigest?: string; timestamp?: string | number };
      };
      const value = entry.record;
      if (!value || typeof value.harnessId !== "string" || typeof value.revision !== "number") continue;
      const time =
        typeof value.timestamp === "number"
          ? new Date(value.timestamp).toISOString()
          : typeof value.timestamp === "string"
            ? value.timestamp
            : null;
      upsert.run(
        harnessRevisionKey(value.harnessId, value.revision),
        value.harnessId,
        value.revision,
        describeSelection(value.requestDigest),
        time,
        entry.seq ?? null,
      );
    } catch {
      /* 跳过坏行 */
    }
  }
}
function describeSelection(digest: string | undefined): string {
  if (digest === "bootstrap") return "初始版本";
  if (digest === "builtin-upgrade") return "内置升级";
  return digest ? "自进化 / 插件变更" : "未知来源";
}

function safeHistogram(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? addHarnessHistograms(emptyHarnessHistogram(), parsed as number[])
      : emptyHarnessHistogram();
  } catch {
    return emptyHarnessHistogram();
  }
}
function minString(a: string | undefined, b: string): string {
  return a && a < b ? a : b;
}
function maxString(a: string | undefined, b: string): string {
  return a && a > b ? a : b;
}
