// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionQuerySource } from "@actspace/session-storage";
import { createReadModelSchema } from "../runtime-v2/usage-read-model-schema";
import {
  CONTEXT_BASH_COMMAND_LIMIT,
  CONTEXT_BASH_COMMAND_TEXT_LIMIT,
  CONTEXT_BASH_PROGRAM_LIMIT,
  commitContextBatch,
  contextTables,
  ensureContextBashTables,
} from "../runtime-v2/context-history-projection";
import { queryContextHistory, type ContextHistoryResult } from "../runtime-v2/context-history-query";
import { CONTEXT_PROJECTOR_VERSION } from "../runtime-v2/context-history-version";
import { ContextPanelService } from "../runtime-v2/context-panel-service";
import type { UsageReadModelService } from "../runtime-v2/usage-read-model";

const SESSION = "session-bash";
const BASE = Date.parse("2026-11-02T08:00:00.000Z");
const BASH_TABLES = [
  "context_bash_stats",
  "context_bash_program",
  "context_bash_call",
  "context_bash_command",
  "context_bash_notable",
];
const noYield = async () => undefined;

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  createReadModelSchema(db);
  return db;
}
function source(throughSeq: number): SessionQuerySource {
  return {
    header: { sessionId: SESSION, createdAt: new Date(BASE).toISOString() },
    throughSeq,
    stamp: `stamp-${throughSeq}`,
    codecSetDigest: "codec",
  } as unknown as SessionQuerySource;
}

/** 按 seq 递增生成日志事件；`at` 是相对 BASE 的毫秒数。 */
class Journal {
  events: SessionEventEnvelopeV1[] = [];
  push(type: string, at: number, data: Record<string, unknown>): this {
    this.events.push({
      recordKind: "event",
      seq: this.events.length + 1,
      type,
      eventVersion: 1,
      criticality: "normal",
      time: new Date(BASE + at).toISOString(),
      source: { kind: "runtime" },
      data,
      provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null },
    } as unknown as SessionEventEnvelopeV1);
    return this;
  }
  call(callId: string, command: string, at: number, name = "bash"): this {
    return this.push("tool/call", at, { callId, name, pluginId: "actspace.shell-tools", args: { command } });
  }
  start(callId: string, at: number): this {
    return this.push("tool-workflow/run-start", at, { callId, name: "bash" });
  }
  result(callId: string, status: string, at: number, name = "bash"): this {
    return this.push("tool/result", at, { callId, name, status });
  }
  /** 带 `background-task` 明细的结果：命令转入（或本来就在）后台。 */
  backgroundResult(callId: string, at: number): this {
    return this.push("tool/result", at, {
      callId,
      name: "bash",
      status: "completed",
      detail: [
        { label: "environment", value: { sandboxed: true } },
        { label: "background-task", value: { taskId: `task-${callId}`, status: "running" } },
      ],
    });
  }
  bash(callId: string, command: string, status: string, at: number, duration: number): this {
    return this.call(callId, command, at)
      .start(callId, at + 5)
      .result(callId, status, at + 5 + duration);
  }
}

async function commit(
  db: DatabaseSync,
  events: readonly SessionEventEnvelopeV1[],
  throughSeq: number,
  reset: boolean,
): Promise<void> {
  await commitContextBatch(db, source(throughSeq), events, `cursor-${throughSeq}`, true, true, reset, noYield);
}
function bash(db: DatabaseSync) {
  return queryContextHistory(db, SESSION)!.bash;
}

describe("context history Bash 统计", () => {
  it("一批里 completed / failed / denied 各一次：被拒绝的不计", async () => {
    const db = database();
    const journal = new Journal()
      .bash("a", "ls src", "completed", 0, 100)
      .bash("b", "cat missing", "failed", 1_000, 50)
      .bash("c", "rm -rf /", "denied", 2_000, 0);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toEqual({
      calls: 2,
      failed: 1,
      durationMs: 150,
      programs: [
        { name: "cat", count: 1, failed: 1, subcommands: [] },
        { name: "ls", count: 1, failed: 0, subcommands: [] },
      ],
      slowest: { command: "ls src", durationMs: 100 },
      mostFailedProgram: { program: "cat", count: 1 },
      mostRepeated: null,
      backgroundCount: 0,
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
    expect(bash(db)).toMatchObject({
      calls: 1,
      failed: 0,
      durationMs: 4_500,
      programs: [{ name: "pnpm", count: 1, failed: 0, subcommands: [{ name: "test", count: 1, failed: 0 }] }],
      slowest: { command: "pnpm test", durationMs: 4_500 },
    });
  });

  it("没有 run-start 时从 tool/call 算起；aborted 计入调用但不算失败", async () => {
    const db = database();
    const journal = new Journal().call("a", "sleep 100", 0).result("a", "aborted", 2_000);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toMatchObject({
      calls: 1,
      failed: 0,
      durationMs: 2_000,
      programs: [{ name: "sleep", count: 1, failed: 0 }],
    });
  });

  it("出现一次记一次，失败按程序和子命令各记一次", async () => {
    const db = database();
    const journal = new Journal()
      .bash("a", "cat a && cat b", "failed", 0, 10)
      .bash("b", "git status && git diff && git status", "failed", 100, 10)
      .bash("c", "git status", "completed", 200, 10);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db).programs).toEqual([
      {
        name: "git",
        count: 4,
        failed: 1,
        subcommands: [
          { name: "status", count: 3, failed: 1 },
          { name: "diff", count: 1, failed: 1 },
        ],
      },
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
    expect(first).toMatchObject({
      calls: 2,
      failed: 1,
      programs: [
        { name: "ls", count: 2 },
        { name: "pwd", count: 1, failed: 1 },
      ],
    });
  });

  it("结果还没到不计入；非 Bash 工具不计入", async () => {
    const db = database();
    const journal = new Journal()
      .call("a", "npm run build", 0)
      .start("a", 10)
      .call("b", "ls", 20, "read_file")
      .result("b", "completed", 30, "read_file");
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toEqual({
      calls: 0,
      failed: 0,
      durationMs: 0,
      programs: [],
      slowest: null,
      mostFailedProgram: null,
      mostRepeated: null,
      backgroundCount: 0,
    });
  });

  it("老库补建表后可以整会话重建，并写入新的投影版本", async () => {
    const db = database();
    for (const table of BASH_TABLES) db.exec(`DROP TABLE ${table}; DROP TABLE building_${table};`);
    ensureContextBashTables(db);
    ensureContextBashTables(db);
    const journal = new Journal().bash("a", "make", "completed", 0, 10);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toMatchObject({ calls: 1, programs: [{ name: "make", count: 1 }] });
    expect(db.prepare("SELECT projector_version FROM context_state WHERE session_id=?").get(SESSION)).toEqual({
      projector_version: CONTEXT_PROJECTOR_VERSION,
    });
    expect(CONTEXT_PROJECTOR_VERSION).toBeGreaterThan(1);
    for (const table of BASH_TABLES) {
      expect(contextTables).toContain(table);
      expect(Number((db.prepare(`SELECT COUNT(*) AS n FROM building_${table}`).get() as { n: number }).n)).toBe(0);
    }
  });

  it("非法程序名归入「其他」并排最后；组合超过上限的也归入「其他」", async () => {
    const db = database();
    const many = Array.from({ length: CONTEXT_BASH_PROGRAM_LIMIT + 2 }, (_, index) => `p${index}`).join("; ");
    const journal = new Journal()
      .bash("a", "'a b' x; zz; zz", "completed", 0, 10)
      .bash("b", many, "completed", 100, 10);
    await commit(db, journal.events, journal.events.length, true);
    const programs = bash(db).programs;
    expect(programs[0]).toMatchObject({ name: "zz", count: 2 });
    expect(programs.at(-1)).toMatchObject({ name: "", count: 5 });
    expect(programs.length).toBe(CONTEXT_BASH_PROGRAM_LIMIT);
    expect(
      Number(
        (db.prepare("SELECT COUNT(*) AS n FROM context_bash_program WHERE session_id=?").get(SESSION) as { n: number })
          .n,
      ),
    ).toBe(CONTEXT_BASH_PROGRAM_LIMIT);
  });
});

describe("Bash 值得注意", () => {
  it("最慢取耗时最长的一条（同耗时保留先出现的），口径同合计耗时：不含审批等待", async () => {
    const db = database();
    // b 先等审批 9s 再跑 200ms：run-start 在审批之后，只算 200ms。
    const journal = new Journal()
      .bash("a", "sleep 1", "completed", 0, 100)
      .call("b", "make build", 1_000)
      .start("b", 10_000)
      .result("b", "completed", 10_200)
      .bash("c", "make lint", "completed", 20_000, 200);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db).slowest).toEqual({ command: "make build", durationMs: 200 });
    expect(bash(db).durationMs).toBe(500);
  });

  it("失败最多按程序的失败调用数，同数按名字，不含「其他」", async () => {
    const db = database();
    const journal = new Journal()
      .bash("a", "ls x", "failed", 0, 10)
      .bash("b", "cat a && cat b", "failed", 100, 10)
      .bash("c", "cat c", "failed", 200, 10)
      .bash("d", "ls y", "failed", 300, 10)
      .bash("e", "'a b' z", "failed", 400, 10)
      .bash("f", "'a b' z", "failed", 500, 10)
      .bash("g", "'a b' z", "failed", 600, 10);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db).mostFailedProgram).toEqual({ program: "cat", count: 2 });
  });

  it("重复最多按完全相同的命令原文；最多只出现 1 次时不给", async () => {
    const db = database();
    const journal = new Journal()
      .bash("a", "git status", "completed", 0, 10)
      .bash("b", "git status", "completed", 100, 10)
      .bash("c", "git status ", "completed", 200, 10)
      .bash("d", "git diff", "completed", 300, 10)
      .bash("e", "git diff", "failed", 400, 10)
      .bash("f", "ls", "completed", 500, 10)
      .bash("g", "rm x", "denied", 600, 0)
      .bash("h", "rm x", "denied", 700, 0);
    await commit(db, journal.events, journal.events.length, true);
    // 首尾空白不算差异；同为 3 次时不会被被拒绝的 rm x 干扰。
    expect(bash(db).mostRepeated).toEqual({ command: "git status", count: 3 });
    const single = database();
    const once = new Journal().bash("a", "ls", "completed", 0, 10).bash("b", "pwd", "completed", 100, 10);
    await commit(single, once.events, once.events.length, true);
    expect(bash(single).mostRepeated).toBeNull();
  });

  it("后台调用数：结果带 background-task 明细的才算，被拒绝的不算；耗时只到转入后台为止", async () => {
    const db = database();
    const journal = new Journal()
      .call("a", "pnpm dev", 0)
      .start("a", 5)
      .backgroundResult("a", 300)
      .bash("b", "ls", "completed", 1_000, 10)
      .call("c", "npm start", 2_000)
      .start("c", 2_005)
      .backgroundResult("c", 2_105);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toMatchObject({ calls: 3, backgroundCount: 2, slowest: { command: "pnpm dev", durationMs: 295 } });
  });

  it("没有失败、没有重复、没有后台、没有耗时记录时各项为空", async () => {
    const db = database();
    const journal = new Journal().call("a", "ls", 0).result("a", "completed", 0);
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toMatchObject({
      calls: 1,
      slowest: null,
      mostFailedProgram: null,
      mostRepeated: null,
      backgroundCount: 0,
    });
  });

  it("命令原文截断保存；重放不翻倍；不同命令超过上限后不再参与重复统计", async () => {
    const db = database();
    const long = `echo ${"x".repeat(2_000)}`;
    const journal = new Journal().bash("a", long, "completed", 0, 10).bash("b", long, "completed", 100, 10);
    for (let index = 0; index < CONTEXT_BASH_COMMAND_LIMIT + 3; index++)
      journal.bash(`n${index}`, `echo ${index}`, "completed", 1_000 + index * 100, 1);
    await commit(db, journal.events, journal.events.length, true);
    const first = bash(db);
    expect(first.mostRepeated).toEqual({ command: long.slice(0, CONTEXT_BASH_COMMAND_TEXT_LIMIT), count: 2 });
    await commit(db, journal.events, journal.events.length, true);
    expect(bash(db)).toEqual(first);
    expect(
      Number(
        (db.prepare("SELECT COUNT(*) AS n FROM context_bash_command WHERE session_id=?").get(SESSION) as { n: number })
          .n,
      ),
    ).toBe(CONTEXT_BASH_COMMAND_LIMIT);
  });
});

describe("ContextPanelService 的 bash 字段", () => {
  async function describeWith(indexed: { result: ContextHistoryResult; syncing?: boolean }, throughSeq: number) {
    const runtime = {
      readContextProjection: async () => null,
      readContextEntryText: async () => null,
      sessionQuerySource: async () => source(throughSeq),
      readSessionProjectionValue: async () => undefined,
    };
    const history = {
      contextHistory: () => indexed,
      releaseContext: () => undefined,
    } as unknown as UsageReadModelService;
    const service = new ContextPanelService(
      runtime as unknown as ConstructorParameters<typeof ContextPanelService>[0],
      history,
    );
    return await service.describe({ sessionId: SESSION, consumerId: "test" });
  }

  it("索引追上时给值，同步中为 null", async () => {
    const db = database();
    const journal = new Journal().bash("a", "ls", "completed", 0, 10);
    await commit(db, journal.events, journal.events.length, true);
    const result = queryContextHistory(db, SESSION)!;
    expect(await describeWith({ result }, journal.events.length)).toMatchObject({
      history: { status: "ready" },
      bash: { calls: 1 },
    });
    expect(await describeWith({ result, syncing: true }, journal.events.length + 1)).toMatchObject({
      history: { status: "syncing" },
      bash: null,
      stats: null,
    });
  });
});
