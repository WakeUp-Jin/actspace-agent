// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionQuerySource } from "@actspace/session-storage";
import { createReadModelSchema } from "../runtime-v2/usage-read-model-schema";
import { CONTEXT_BASH_PROGRAM_LIMIT, commitContextBatch, contextTables, ensureContextBashTables } from "../runtime-v2/context-history-projection";
import { queryContextHistory, type ContextHistoryResult } from "../runtime-v2/context-history-query";
import { CONTEXT_PROJECTOR_VERSION } from "../runtime-v2/context-history-version";
import { ContextPanelService } from "../runtime-v2/context-panel-service";
import type { UsageReadModelService } from "../runtime-v2/usage-read-model";

vi.mock("../runtime-v2/runtime-loader", () => ({
  loadRuntimeV2Module: async () => ({ readPersistedContextManifest: () => ({ schemaVersion: 1, estimatorVersion: "test", comparable: true, totalEstimatedTokens: 0, buckets: {}, entries: [] }) }),
}));

const SESSION = "session-bash";
const BASE = Date.parse("2026-11-02T08:00:00.000Z");
const noYield = async () => undefined;

function database(): DatabaseSync { const db = new DatabaseSync(":memory:"); createReadModelSchema(db); return db; }
function source(throughSeq: number): SessionQuerySource {
  return { header: { sessionId: SESSION, createdAt: new Date(BASE).toISOString() }, throughSeq, stamp: `stamp-${throughSeq}`, codecSetDigest: "codec" } as unknown as SessionQuerySource;
}

/** 按 seq 递增生成日志事件；`at` 是相对 BASE 的毫秒数。 */
class Journal {
  events: SessionEventEnvelopeV1[] = [];
  push(type: string, at: number, data: Record<string, unknown>): this {
    this.events.push({ recordKind: "event", seq: this.events.length + 1, type, eventVersion: 1, criticality: "normal", time: new Date(BASE + at).toISOString(), source: { kind: "runtime" }, data, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as unknown as SessionEventEnvelopeV1);
    return this;
  }
  call(callId: string, command: string, at: number, name = "bash"): this { return this.push("tool/call", at, { callId, name, pluginId: "actspace.shell-tools", args: { command } }); }
  start(callId: string, at: number): this { return this.push("tool-workflow/run-start", at, { callId, name: "bash" }); }
  result(callId: string, status: string, at: number, name = "bash"): this { return this.push("tool/result", at, { callId, name, status }); }
  bash(callId: string, command: string, status: string, at: number, duration: number): this { return this.call(callId, command, at).start(callId, at + 5).result(callId, status, at + 5 + duration); }
}

async function commit(db: DatabaseSync, events: readonly SessionEventEnvelopeV1[], throughSeq: number, reset: boolean): Promise<void> {
  await commitContextBatch(db, source(throughSeq), events, `cursor-${throughSeq}`, true, true, reset, noYield);
}
function bash(db: DatabaseSync) { return queryContextHistory(db, SESSION)!.bash; }

describe("context history Bash 统计", () => {
  it("一批里 completed / failed / denied 各一次：被拒绝的不计", async () => {
    const db = database();
    const journal = new Journal().bash("a", "ls src", "completed", 0, 100).bash("b", "cat missing", "failed", 1_000, 50).bash("c", "rm -rf /", "denied", 2_000, 0);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toEqual({
      calls: 2, failed: 1, durationMs: 150,
      programs: [{ name: "cat", count: 1, failed: 1, subcommands: [] }, { name: "ls", count: 1, failed: 0, subcommands: [] }],
    });
  });

  it("tool/call 与 tool/result 分两批提交也能配对；耗时从 run-start 算起", async () => {
    const db = database();
    const journal = new Journal().call("a", "pnpm test", 0).start("a", 3_000);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toMatchObject({ calls: 0, programs: [] });
    const before = journal.events.length;
    journal.result("a", "completed", 7_500);
    await commit(db, journal.events.slice(before), journal.events.length, false);
    expect(bash(db)).toEqual({ calls: 1, failed: 0, durationMs: 4_500, programs: [{ name: "pnpm", count: 1, failed: 0, subcommands: [{ name: "test", count: 1, failed: 0 }] }] });
  });

  it("没有 run-start 时从 tool/call 算起；aborted 计入调用但不算失败", async () => {
    const db = database();
    const journal = new Journal().call("a", "sleep 100", 0).result("a", "aborted", 2_000);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toMatchObject({ calls: 1, failed: 0, durationMs: 2_000, programs: [{ name: "sleep", count: 1, failed: 0 }] });
  });

  it("出现一次记一次，失败按程序和子命令各记一次", async () => {
    const db = database();
    const journal = new Journal()
      .bash("a", "cat a && cat b", "failed", 0, 10)
      .bash("b", "git status && git diff && git status", "failed", 100, 10)
      .bash("c", "git status", "completed", 200, 10);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db).programs).toEqual([
      { name: "git", count: 4, failed: 1, subcommands: [{ name: "status", count: 3, failed: 1 }, { name: "diff", count: 1, failed: 1 }] },
      { name: "cat", count: 2, failed: 1, subcommands: [] },
    ]);
    expect(bash(db)).toMatchObject({ calls: 3, failed: 2 });
  });

  it("reset 重放与重复投递同一批事件都不会翻倍", async () => {
    const db = database();
    const journal = new Journal().bash("a", "ls && ls", "completed", 0, 10).bash("b", "pwd", "failed", 100, 10);
    await commit(db, journal.events, journal.events.length, true);
    const first = bash(db);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toEqual(first);
    await commit(db, journal.events, journal.events.length, false);
    expect(bash(db)).toEqual(first);
    expect(first).toMatchObject({ calls: 2, failed: 1, programs: [{ name: "ls", count: 2 }, { name: "pwd", count: 1, failed: 1 }] });
  });

  it("结果还没到不计入；非 Bash 工具不计入", async () => {
    const db = database();
    const journal = new Journal().call("a", "npm run build", 0).start("a", 10).call("b", "ls", 20, "read_file").result("b", "completed", 30, "read_file");
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toEqual({ calls: 0, failed: 0, durationMs: 0, programs: [] });
  });

  it("老库补建表后可以整会话重建，并写入新的投影版本", async () => {
    const db = database();
    for (const table of ["context_bash_stats", "context_bash_program", "context_bash_call"]) db.exec(`DROP TABLE ${table}; DROP TABLE building_${table};`);
    ensureContextBashTables(db);
    ensureContextBashTables(db);
    const journal = new Journal().bash("a", "make", "completed", 0, 10);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toMatchObject({ calls: 1, programs: [{ name: "make", count: 1 }] });
    expect(db.prepare("SELECT projector_version FROM context_state WHERE session_id=?").get(SESSION)).toEqual({ projector_version: CONTEXT_PROJECTOR_VERSION });
    expect(CONTEXT_PROJECTOR_VERSION).toBeGreaterThan(1);
    for (const table of ["context_bash_stats", "context_bash_program", "context_bash_call"]) {
      expect(contextTables).toContain(table);
      expect(Number((db.prepare(`SELECT COUNT(*) AS n FROM building_${table}`).get() as { n: number }).n)).toBe(0);
    }
  });

  it("非法程序名归入「其他」并排最后；组合超过上限的也归入「其他」", async () => {
    const db = database();
    const many = Array.from({ length: CONTEXT_BASH_PROGRAM_LIMIT + 2 }, (_, index) => `p${index}`).join("; ");
    const journal = new Journal().bash("a", "'a b' x; zz; zz", "completed", 0, 10).bash("b", many, "completed", 100, 10);
    await commit(db, journal.events, journal.events.length, true);
    const programs = bash(db).programs;
    expect(programs[0]).toMatchObject({ name: "zz", count: 2 });
    expect(programs.at(-1)).toMatchObject({ name: "", count: 5 });
    expect(programs.length).toBe(CONTEXT_BASH_PROGRAM_LIMIT);
    expect(Number((db.prepare("SELECT COUNT(*) AS n FROM context_bash_program WHERE session_id=?").get(SESSION) as { n: number }).n)).toBe(CONTEXT_BASH_PROGRAM_LIMIT);
  });
});

describe("ContextPanelService 的 bash 字段", () => {
  async function describeWith(indexed: { result: ContextHistoryResult; syncing?: boolean }, throughSeq: number) {
    const runtime = { readContextProjection: async () => null, readContextEntryText: async () => null, sessionQuerySource: async () => source(throughSeq) };
    const history = { contextHistory: () => indexed, releaseContext: () => undefined } as unknown as UsageReadModelService;
    const service = new ContextPanelService(runtime as unknown as ConstructorParameters<typeof ContextPanelService>[0], history);
    return await service.describe({ sessionId: SESSION, consumerId: "test" });
  }

  it("索引追上时给值，同步中为 null", async () => {
    const db = database();
    const journal = new Journal().bash("a", "ls", "completed", 0, 10);
    await commit(db, journal.events, journal.events.length, true);
    const result = queryContextHistory(db, SESSION)!;
    expect(await describeWith({ result }, journal.events.length)).toMatchObject({ history: { status: "ready" }, bash: { calls: 1 } });
    expect(await describeWith({ result, syncing: true }, journal.events.length + 1)).toMatchObject({ history: { status: "syncing" }, bash: null, stats: null });
  });
});
