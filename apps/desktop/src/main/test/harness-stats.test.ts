// @vitest-environment node
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { HarnessStatsData, HarnessStatsFilter, HarnessStatsQueryInput } from "@actspace/shared";
import { createReadModelSchema } from "../runtime-v2/usage-read-model-schema";
import { projectHarnessJournalBatch } from "../runtime-v2/harness-stats-projection";
import { harnessFingerprint, queryHarnessStats } from "../runtime-v2/harness-stats-query";
import { archiveHarnessSession, ingestHarnessArchive } from "../runtime-v2/harness-stats-archive";
import { ingestHarnessRuntimeFiles } from "../runtime-v2/harness-stats-runtime-ingest";
import { projectUsageJournalBatch } from "../runtime-v2/usage-journal-projection";
import { UsageSessionFallback } from "../runtime-v2/usage-session-fallback";
import { estimateItem, foldContextEstimate, viewContextEstimate, type UsageActivityRow } from "@actspace/shared";

const BASE = Date.parse("2026-10-30T08:00:00.000Z");
const TOOLS = [{ name: "read_file", pluginId: "x", description: "Read a file from the workspace.", inputSchema: { type: "object", properties: { path: { type: "string" } } } }, { name: "bash", pluginId: "x", description: "Run a shell command.", inputSchema: {} }];
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function database(): DatabaseSync { const db = new DatabaseSync(":memory:"); createReadModelSchema(db); return db; }
function tempRoot(): string { const dir = mkdtempSync(join(tmpdir(), "harness-stats-")); dirs.push(dir); return dir; }
const filter: HarnessStatsFilter = { range: "total", sessionKind: "all" };
function query<K extends HarnessStatsQueryInput["kind"]>(db: DatabaseSync, kind: K, extra: Partial<HarnessStatsQueryInput> = {}): Extract<HarnessStatsData, { kind: K }>["value"] {
  return (queryHarnessStats(db, { requestId: "r", kind, filter, ...extra }, new Date(BASE + 86_400_000)) as Extract<HarnessStatsData, { kind: K }>).value;
}

/** 一段覆盖工具、审批、bash、压缩折叠、Skills、披露、子 Agent 的会话日志（后台任务事件不再统计，留着验证会被忽略）。 */
function journal(): SessionEventEnvelopeV1[] {
  let seq = 0;
  const events: SessionEventEnvelopeV1[] = [];
  const e = (type: string, data: Record<string, unknown>) => {
    const current = seq++;
    events.push({ recordKind: "event", seq: current, type, eventVersion: 1, criticality: "required", time: new Date(BASE + current * 1000).toISOString(), source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [] } } as unknown as SessionEventEnvelopeV1);
    return current;
  };
  const time = (offset: number) => new Date(BASE + offset * 1000).toISOString();
  e("plugin/actspace.agent-service/run", { op: "start", runId: "run1", harness: { harnessId: "main", revision: 3 }, configuration: { model: "m1", selectedSkillIds: ["writer"] } });
  e("turn/start", { turnId: "t1", agentRunId: "run1", mode: "agent" });
  e("step/start", {});
  e("request/header", { requestId: "q1", turnId: "t1", model: "m1" });
  // 提示词、工具各一条，只在变化时写；request/context 只留小字段（agent-spec-request-record.md）。
  e("request/system-prompt", { requestId: "q1", turnId: "t1", stepId: "s1", digest: "p1", contributorProvenance: [], sections: [{ owner: "actspace.context-system", id: "core", order: 0, content: "core prompt" }],
    modelFacts: [{ owner: "actspace.context-skills", id: "core/skills-catalog", order: 0, content: [{ id: "writer", location: "/skills/writer/SKILL.md", source: "user" }] }] });
  e("request/tools", { requestId: "q1", turnId: "t1", stepId: "s1", digest: "t1", tools: TOOLS });
  e("request/context", { requestId: "q1", snapshot: { schemaVersion: 3, contextModel: { contextWindow: 1000 } } });
  e("assistant/message", { requestId: "q1", usage: { inputTokens: 100, cacheReadTokens: 300 } });
  e("plugin/actspace.context/state", { op: "fact", paths: [{ path: "/w/a.ts", read: true }] });
  e("tool/call", { callId: "c1", name: "read_file", requestId: "q1", turnId: "t1", args: { path: "/skills/writer/SKILL.md" } });
  const firstOutput = e("tool/result", { callId: "c1", status: "completed", modelOutput: [{ type: "text", text: "x".repeat(400) }], detail: [{ label: "actspace.context.file", value: { path: "/skills/writer/SKILL.md", kind: "file", operation: "read" } }] });
  e("tool/call", { callId: "c2", name: "read_file", requestId: "q1", turnId: "t1", args: { path: "/skills/writer/SKILL.md" } });
  e("tool/result", { callId: "c2", status: "failed", failure: { code: "io" }, modelOutput: [] });
  e("tool/call", { callId: "c3", name: "bash", requestId: "q1", turnId: "t1", args: { command: "ls", sandbox_permissions: "require_escalated" } });
  e("permission/asked", { requestId: "p1", callId: "c3", requestedAt: time(100) });
  e("permission/decided", { requestId: "p1", kind: "once", decidedAt: time(102) });
  e("background/task", { op: "start", taskId: "bg1", callId: "c3", kind: "bash", startedAt: time(14) });
  e("tool/result", { callId: "c3", status: "completed", modelOutput: [{ type: "text", text: "started" }], detail: [{ label: "environment", value: { sandboxed: false } }] });
  e("background/task", { op: "settle", taskId: "bg1", status: "completed", endedAt: time(30), delivery: "notify" });
  e("compaction/start", { compactionId: "k1" });
  e("surface/replaced", { compactionId: "k1", sourceEventSeqs: [firstOutput] });
  e("compaction/end", { compactionId: "k1", trigger: "auto", beforeTokens: 900, afterTokens: 300, durationMs: 1200 });
  e("step/start", {});
  e("plugin/actspace.context/state", { op: "fact", paths: [{ path: "/w/a.ts", read: true }] });
  e("delegation/requested", { invocationId: "i1", presetId: "explore", childSessionId: "child1" });
  e("delegation/child-terminal", { invocationId: "i1", childSessionId: "child1", presetId: "explore", status: "completed", text: "y".repeat(80), durationMs: 5000, toolUseCount: 3 });
  e("turn/end", { turnId: "t1", reason: "completed" });
  e("plugin/actspace.agent-service/run", { op: "finish", runId: "run1" });
  return events;
}

describe("Harness 统计投影", () => {
  it("把工具、命令、Skills、压缩和子 Agent 统计进各张表", () => {
    const db = database();
    projectHarnessJournalBatch(db, "s1", journal());
    const usageVs = query(db, "usage-vs");
    const read = usageVs.tools.find(row => row.name === "read_file")!;
    expect(read).toMatchObject({ calls: 2, failed: 1, exposures: 1, schemaTokens: estimateItem(TOOLS[0]), repeated: 1 });
    expect(read.failureCodes).toEqual([{ code: "io", count: 1 }]);
    expect(usageVs.requests).toBe(1);
    expect(usageVs.skills.find(skill => skill.id === "writer")).toMatchObject({ listed: 1, skillReads: 1, assetReads: 0 });

    // 审批等待记在工具汇总上；bash 命令按程序记。
    expect(db.prepare("SELECT SUM(approval_wait_ms) AS wait,SUM(approval_wait_samples) AS samples FROM harness_tool_rollup WHERE tool='bash'").get()).toEqual({ wait: 2000, samples: 1 });
    expect(db.prepare("SELECT program,subcommand,calls,failed FROM harness_bash_rollup").all()).toEqual([{ program: "ls", subcommand: "", calls: 1, failed: 0 }]);
    expect(db.prepare("SELECT skill_id,file,reads FROM harness_skill_file").all()).toEqual([{ skill_id: "writer", file: "SKILL.md", reads: 1 }]);
    // 第一次请求没有可比较的上一次：缓存是否被打断留空。
    expect(db.prepare("SELECT harness_changed FROM harness_request").get()).toEqual({ harness_changed: null });
    expect(db.prepare("SELECT preset_id,status,duration_ms FROM harness_delegation").get()).toEqual({ preset_id: "explore", status: "completed", duration_ms: 5000 });

    const disclosure = query(db, "disclosure");
    expect(disclosure.compaction).toMatchObject({ count: 1, auto: 1, foldedOutputs: 1, foldedTokens: 100, avgBeforeTokens: 900 });
    // 压缩前读过 /w/a.ts，压缩后 5 步内又读：算重读。
    expect(disclosure.compaction.rereadRate).toBe(1);
    expect(disclosure.records).toEqual([expect.objectContaining({ id: "k1", trigger: "auto", ok: true, beforeTokens: 900, afterTokens: 300, rereads: 1 })]);

    const context = query(db, "context");
    expect(context.requests).toBe(1);
    // 平均估算 = 请求时折叠出的估算（提示词 + 两个工具 + 技能目录，还没有对话）。
    const view = viewContextEstimate(foldContextEstimate(journal().filter(event => event.seq <= 6)));
    expect(view.totalEstimatedTokens).toBeGreaterThan(0);
    expect(context.avgEstimatedTokens).toBeCloseTo(view.totalEstimatedTokens);
    expect(context.sources.some(source => source.kind === "skills" && source.id === "writer")).toBe(true);

    const options = query(db, "options");
    expect(options.revisions.map(info => info.key)).toContain("main@3");
    expect(options.models).toEqual(["m1"]);

    const overview = query(db, "overview");
    expect(overview.current).toBe("main@3");
    expect(overview.previous).toBeNull();
    expect(overview.metrics).toMatchObject({ requests: 1, toolCalls: 3, compactions: 1, rereadRate: 1, foldedTokens: 100, cacheBrokenRate: null });
    expect(overview.metrics!.toolFailureRate).toBeCloseTo(1 / 3);
    expect(overview.metrics!.topFailedTool).toEqual({ name: "read_file", failed: 1 });
  });

  it("指标卡与上一版本对比：每个版本各算一份", () => {
    const db = database();
    const request = (session: string, id: string, revision: string, changed: number | null, cacheRead: number) => db.prepare(
      "INSERT INTO harness_request(session_id,request_id,hour,revision,mode,model,time,estimated,b_system,b_tools,b_rules,b_skills,has_manifest,harness_changed,input_tokens,cache_read) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(session, id, "2026-10-30T08", revision, "agent", "m1", "2026-10-30T08:00:00.000Z", 1000, 100, 200, 0, 50, 1, changed, 100, cacheRead);
    request("a", "q1", "main@1", null, 0); request("a", "q2", "main@1", 0, 300);
    request("b", "q3", "main@2", null, 0); request("b", "q4", "main@2", 1, 100); request("b", "q5", "main@2", 0, 900);
    const overview = query(db, "overview");
    expect([overview.current, overview.previous]).toEqual(["main@2", "main@1"]);
    expect(overview.metrics).toMatchObject({ requests: 3, avgContextTokens: 1000, fixedOverheadTokens: 350, cacheBrokenRate: 0.5 });
    expect(overview.metrics!.cacheHitBroken).toBeCloseTo(100 / 200);
    expect(overview.metrics!.cacheHitOther).toBeCloseTo(900 / 1100);
    expect(overview.previousMetrics).toMatchObject({ requests: 2, cacheBrokenRate: 0 });
    // 选中旧版本：它就是当前，没有更旧的版本。
    expect(query(db, "overview", { filter: { ...filter, revision: "main@1" } })).toMatchObject({ current: "main@1", previous: null });
    const versions = query(db, "versions");
    expect([versions.from, versions.to]).toEqual(["main@1", "main@2"]);
    expect(versions.toMetrics!.requests).toBe(3);
  });

  it("重放同一批事件不会重复计数，分批写入与一次写入结果一致", () => {
    const events = journal();
    const once = database();
    projectHarnessJournalBatch(once, "s1", events);
    projectHarnessJournalBatch(once, "s1", events);
    const split = database();
    for (let index = 0; index < events.length; index += 3) projectHarnessJournalBatch(split, "s1", events.slice(index, index + 3));
    const snapshot = (db: DatabaseSync) => ({ usage: query(db, "usage-vs"), overview: query(db, "overview"), disclosure: query(db, "disclosure") });
    expect(snapshot(split)).toEqual(snapshot(once));
    expect(query(once, "usage-vs").tools.find(row => row.name === "read_file")!.calls).toBe(2);
  });

  it("新会话按子智能体激活统计：续派算一次，中断算停止，失败与丢失算失败", () => {
    const events: SessionEventEnvelopeV1[] = [];
    const time = (offset: number) => new Date(BASE + offset * 1000).toISOString();
    const e = (type: string, data: Record<string, unknown>) => { events.push({ recordKind: "event", seq: events.length, type, eventVersion: 1, criticality: "required", time: time(events.length), source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as SessionEventEnvelopeV1); };
    const start = (agentId: string, activationId: string, at: number) => e("subagent/activation", { op: "start", agentId, activationId, trigger: "spawn", callId: `call-${activationId}`, background: true, startedAt: time(at) });
    const settle = (agentId: string, activationId: string, status: string, at: number) => e("subagent/activation", { op: "settle", agentId, activationId, status, summary: status, delivery: "notified", endedAt: time(at) });
    e("turn/start", { turnId: "t1", agentRunId: "run1", mode: "agent" });
    e("subagent/spawned", { agentId: "sa-1", kind: "local", preset: "explore", description: "Map", transcriptPath: "/t/sa-1.md", callId: "call-a1", createdAt: time(1) });
    start("sa-1", "a1", 1); settle("sa-1", "a1", "completed", 5);
    start("sa-1", "a2", 10); settle("sa-1", "a2", "interrupted", 12);
    e("subagent/spawned", { agentId: "sa-2", kind: "local", preset: "general", description: "Fix", transcriptPath: "/t/sa-2.md", callId: "call-b1", createdAt: time(20) });
    start("sa-2", "b1", 20); settle("sa-2", "b1", "max_steps", 30);
    start("sa-2", "b2", 31); settle("sa-2", "b2", "lost", 33);
    e("turn/end", { turnId: "t1", reason: "completed" });

    const rows = (db: DatabaseSync) => db.prepare("SELECT invocation_id,preset_id,status,duration_ms FROM harness_delegation ORDER BY invocation_id").all();
    const once = database();
    projectHarnessJournalBatch(once, "s2", events);
    expect(rows(once)).toEqual([
      { invocation_id: "a1", preset_id: "actspace.subagent.explore", status: "completed", duration_ms: 4000 },
      { invocation_id: "a2", preset_id: "actspace.subagent.explore", status: "aborted", duration_ms: 2000 },
      { invocation_id: "b1", preset_id: "actspace.subagent.general", status: "failed", duration_ms: 10_000 },
      { invocation_id: "b2", preset_id: "actspace.subagent.general", status: "failed", duration_ms: 2000 },
    ]);
    const split = database();
    for (const event of events) projectHarnessJournalBatch(split, "s2", [event]);
    expect(rows(split)).toEqual(rows(once));
  });

  it("输出被截断按结果里的标记识别：分页尾注、单行截短、运行时兜底；模型自己分段的读取不算", () => {
    const db = database();
    let seq = 0;
    const call = (id: string, args: Record<string, unknown>, output: string) => [
      ev(seq++, "tool/call", { callId: id, name: "read_file", requestId: "q1", turnId: "t1", stepId: "s1", args }),
      ev(seq++, "tool/result", { callId: id, status: "completed", modelOutput: [{ type: "text", text: output }] }),
    ];
    projectHarnessJournalBatch(db, "s1", [
      ev(seq++, "turn/start", { turnId: "t1", agentRunId: "run1", mode: "agent" }),
      ev(seq++, "step/start", { stepId: "s1", turnId: "t1" }),
      ev(seq++, "request/header", { requestId: "q1", turnId: "t1", stepId: "s1", model: "m1" }),
      ...call("c1", { path: "a" }, "     1|ok"),
      ...call("c2", { path: "b" }, "     1|x\n\n[Showing lines 1-200 of 900. Use offset=201 to continue.]"),
      ...call("c3", { path: "c" }, "     1|xxx ...[line truncated: 3000000 bytes]"),
      ...call("c4", { path: "d" }, "head\n\n[Output truncated: this tool returned 400000 bytes, more than one result can hold. The first 261120 bytes are shown. The full output was saved as a file.]"),
      ...call("c5", { path: "e", offset: 201 }, "   201|x\n\n[Showing lines 201-400 of 900. Use offset=401 to continue.]"),
    ]);
    expect(query(db, "usage-vs").tools.find(row => row.name === "read_file")).toMatchObject({ calls: 5, truncated: 3 });
  });

  it("删除会话后统计归档，重建统计库时读回", () => {
    const root = tempRoot();
    const db = database();
    projectHarnessJournalBatch(db, "s1", journal());
    const before = query(db, "usage-vs");
    archiveHarnessSession(db, root, "s1");
    expect(query(db, "usage-vs")).toEqual(before);
    expect(db.prepare("SELECT deleted FROM harness_session_meta WHERE session_id='s1'").get()).toEqual({ deleted: 1 });

    const rebuilt = database();
    expect(ingestHarnessArchive(rebuilt, root)).toBe(1);
    expect(query(rebuilt, "usage-vs")).toEqual(before);
    expect(query(rebuilt, "disclosure").compaction.count).toBe(1);
  });
});

/** 分叉 / 侧边对话复制父会话 [0..boundary] 之后再自己执行一轮：一次请求、一次 read_file。 */
function ev(seq: number, type: string, data: Record<string, unknown>): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: new Date(BASE + 3_600_000 + seq * 1000).toISOString(), source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [] } } as unknown as SessionEventEnvelopeV1;
}
function ownTurn(from: number, id: string): SessionEventEnvelopeV1[] {
  let seq = from;
  return [
    ev(seq++, "turn/start", { turnId: `t-${id}`, agentRunId: `run-${id}`, mode: "agent" }),
    ev(seq++, "step/start", { stepId: `st-${id}`, turnId: `t-${id}` }),
    ev(seq++, "request/header", { requestId: `q-${id}`, turnId: `t-${id}`, stepId: `st-${id}`, model: "m1" }),
    ev(seq++, "assistant/message", { requestId: `q-${id}`, usage: { inputTokens: 10, outputTokens: 5 } }),
    ev(seq++, "tool/call", { callId: `c-${id}`, name: "read_file", requestId: `q-${id}`, turnId: `t-${id}`, stepId: `st-${id}`, args: { path: `/w/${id}.ts` } }),
    ev(seq++, "tool/result", { callId: `c-${id}`, status: "completed", modelOutput: [{ type: "text", text: "ok" }] }),
    ev(seq++, "step/end", { stepId: `st-${id}`, turnId: `t-${id}`, usage: { inputTokens: 10, outputTokens: 5 } }),
    ev(seq++, "turn/end", { turnId: `t-${id}`, reason: "completed" }),
  ];
}

describe("分叉 / 侧边对话继承的历史只在父会话记账", () => {
  const parent = journal();
  const boundary = parent.length - 1;
  const fork = [...parent, ...ownTurn(parent.length, "fork")];
  const grandBoundary = fork.length - 1;
  const grandchild = [...fork, ...ownTurn(fork.length, "grand")];

  it("Harness：继承的前缀不产生统计行，但版本、模式、模型等状态照常恢复", () => {
    const db = database();
    projectHarnessJournalBatch(db, "parent", parent);
    const parentOnly = query(db, "usage-vs");
    projectHarnessJournalBatch(db, "fork", fork, boundary);
    projectHarnessJournalBatch(db, "grand", grandchild, grandBoundary);

    // 父会话 2 次 read_file + 两个分支各自 1 次。
    expect(query(db, "usage-vs").tools.find(row => row.name === "read_file")!.calls).toBe(4);
    const perSession = (table: string) => db.prepare(`SELECT session_id,COUNT(*) AS n FROM ${table} GROUP BY session_id ORDER BY session_id`).all();
    expect(perSession("harness_request")).toEqual([{ session_id: "fork", n: 1 }, { session_id: "grand", n: 1 }, { session_id: "parent", n: 1 }]);
    // 分支自己的请求沿用继承来的 Harness 版本和模式，不是 unknown。
    expect(db.prepare("SELECT revision,mode,model FROM harness_request WHERE session_id='fork'").get()).toEqual({ revision: "main@3", mode: "agent", model: "m1" });
    // 继承前缀里的压缩、子 Agent 不会在分支里重复出现。
    for (const table of ["harness_compaction", "harness_delegation"]) expect(perSession(table)).toEqual([{ session_id: "parent", n: 1 }]);

    // 只有父会话时的结果不变；分批跨过边界与一次写入一致。
    const alone = database();
    projectHarnessJournalBatch(alone, "parent", parent);
    expect(query(alone, "usage-vs")).toEqual(parentOnly);
    const split = database();
    projectHarnessJournalBatch(split, "parent", parent);
    for (let index = 0; index < fork.length; index += 4) projectHarnessJournalBatch(split, "fork", fork.slice(index, index + 4), boundary);
    const forkOnly = database();
    projectHarnessJournalBatch(forkOnly, "parent", parent);
    projectHarnessJournalBatch(forkOnly, "fork", fork, boundary);
    expect(query(split, "usage-vs")).toEqual(query(forkOnly, "usage-vs"));
  });

  it("使用统计：索引与回退查询都只算分支自己的请求", async () => {
    const usage = async (sessionId: string, events: readonly SessionEventEnvelopeV1[], inheritedThroughSeq?: number) => {
      const db = database();
      db.prepare("INSERT INTO session_catalog(session_id,title,revision) VALUES(?,?,?)").run(sessionId, null, events.at(-1)!.seq);
      const rows: UsageActivityRow[] = [];
      await projectUsageJournalBatch(db, { sessionId, title: null, throughJournalSeq: events.at(-1)!.seq, workspaceRoot: null, ...(inheritedThroughSeq === undefined ? {} : { inheritedThroughSeq }) }, events, async batch => { rows.push(...batch); });
      return rows;
    };
    const kinds = (rows: readonly UsageActivityRow[]) => rows.map(row => `${row.kind}:${row.requestId ?? ""}`).sort();
    const parentRows = await usage("parent", ownTurn(0, "p"));
    expect(kinds(parentRows)).toEqual(["llm_request:q-p"]);
    const forkEvents = [...ownTurn(0, "p"), ...ownTurn(8, "f")];
    expect(kinds(await usage("fork", forkEvents, 7))).toEqual(["llm_request:q-f"]);
    // 没有边界（旧行为）时会把父请求再算一遍：用来证明上面的断言确实在测边界。
    expect(kinds(await usage("fork", forkEvents))).toHaveLength(2);

    const fallback = new UsageSessionFallback();
    fallback.append({ sessionId: "fork", title: null, throughJournalSeq: 15, workspaceRoot: null, inheritedThroughSeq: 7 }, [ev(0, "session/title-set", { title: "继承的标题" }), ...forkEvents.slice(1)]);
    const materialized = fallback.materialize();
    try {
      const rows = materialized.prepare("SELECT kind,session_title FROM usage_activity ORDER BY kind").all();
      expect(rows).toEqual([{ kind: "llm_request", session_title: "继承的标题" }]);
    } finally { materialized.close(); }
  });
});

describe("运行时统计文件", () => {
  const line = (value: Record<string, unknown>) => `${JSON.stringify({ v: 1, ...value })}\n`;
  const histogram = [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  it("增量读取完整的行，文件变短时整体重读", () => {
    const root = tempRoot(); const dir = join(root, "harness-stats"); mkdirSync(dir);
    const file = join(dir, "2026-10.jsonl");
    writeFileSync(file, [
      line({ t: "inventory", at: "2026-10-30T08:00:00.000Z", revision: "main@3", plugin: "tools-runtime", source: "builtin", provides: ["tools.runtime"], loadMs: 3, ok: true, error: null }),
      line({ t: "inventory", at: "2026-10-30T08:00:00.000Z", revision: "main@3", plugin: "broken", source: "user", provides: [], loadMs: 1, ok: false, error: "boom" }),
      line({ t: "tool-owner", at: "2026-10-30T08:00:00.000Z", revision: "main@3", plugin: "filesystem-read", toolPluginId: "actspace.tools.filesystem-read", tool: "read_file" }),
      line({ t: "runtime", hour: "2026-10-30T08:00:00.000Z", revision: "main@3", kind: "service", plugin: "agent", name: "tools.runtime", method: "executeBatch", provider: "tools-runtime", calls: 2, errors: 1, totalMs: 30, histogram }),
      line({ t: "runtime", hour: "2026-10-30T08:00:00.000Z", revision: "main@3", kind: "listener", plugin: "english", name: "session/created", method: "", provider: null, calls: 4, errors: 2, totalMs: 8, histogram }),
      line({ t: "health", at: "2026-10-30T08:00:00.000Z", writeFailures: 2 }), // 旧文件里的健康行：忽略
      line({ t: "runtime", hour: "2026-10-30T08:00:00.000Z", revision: "main@3", kind: "dependency", plugin: "agent", name: "x", method: "", provider: null, calls: 1, errors: 0, totalMs: 0, histogram }), // 旧依赖行：忽略
    ].join(""));
    appendFileSync(file, '{"v":1,"t":"runtime"'); // 写到一半的行：不能读
    const db = database();
    const first = ingestHarnessRuntimeFiles(db, root);
    expect(first).toMatchObject({ files: 1, lines: 5, reset: false });
    const fingerprint = harnessFingerprint(db);

    const plugins = query(db, "plugins", { filter: { ...filter, revision: "main@3" } });
    expect(plugins.services.find(row => row.service === "tools.runtime")).toMatchObject({ providerPluginId: "tools-runtime", calls: 2, errors: 1 });
    expect(plugins.listeners).toEqual([{ pluginId: "english", event: "session/created", calls: 4, errors: 2 }]);
    expect(plugins.services.find(row => row.service === "tools.runtime")!.p95Ms).toBe(16);
    expect(plugins.rows.find(row => row.pluginId === "broken")).toMatchObject({ source: "user", loadFailures: 1, lastLoadError: "boom" });
    expect(plugins.runtimeEmpty).toBe(false);
    const rules = query(db, "overview", { filter: { ...filter, revision: "main@3" } }).flags.map(flag => flag.rule);
    expect(rules).toEqual(expect.arrayContaining(["plugin-load-failure", "listener-errors"]));

    // 没有新内容：什么都不变。
    expect(ingestHarnessRuntimeFiles(db, root).lines).toBe(0);
    expect(harnessFingerprint(db)).toBe(fingerprint);

    // 补完那半行之后能读到。
    appendFileSync(file, ',"hour":"2026-10-30T09:00:00.000Z","revision":"main@3","kind":"service","plugin":"agent","name":"tools.runtime","method":"executeBatch","provider":"tools-runtime","calls":1,"errors":0,"totalMs":5,"histogram":[]}\n');
    expect(ingestHarnessRuntimeFiles(db, root).lines).toBe(1);
    expect(query(db, "plugins").services.find(row => row.service === "tools.runtime")!.calls).toBe(3);

    // 文件被替换成更短的内容：整体重读，不会叠加旧数据。
    truncateSync(file, 0);
    writeFileSync(file, line({ t: "runtime", hour: "2026-10-30T10:00:00.000Z", revision: "main@3", kind: "service", plugin: "agent", name: "tools.runtime", method: "executeBatch", provider: "tools-runtime", calls: 7, errors: 0, totalMs: 7, histogram }));
    expect(ingestHarnessRuntimeFiles(db, root).reset).toBe(true);
    expect(query(db, "plugins").services.find(row => row.service === "tools.runtime")!.calls).toBe(7);
  });

  it("插件归属统一用加载器 ID：工具自报的 toolPluginId 不同也能对上插件行和规则", () => {
    const root = tempRoot(); const dir = join(root, "harness-stats"); mkdirSync(dir);
    writeFileSync(join(dir, "2026-10.jsonl"), [
      line({ t: "inventory", at: "2026-10-30T08:00:00.000Z", revision: "main@3", plugin: "filesystem-read", source: "builtin", provides: [], loadMs: 1, ok: true, error: null }),
      line({ t: "tool-owner", at: "2026-10-30T08:00:00.000Z", revision: "main@3", plugin: "filesystem-read", toolPluginId: "actspace.filesystem-read", tool: "read_file" }),
    ].join(""));
    const db = database();
    ingestHarnessRuntimeFiles(db, root);
    const rollup = (session: string, tool: string, pluginId: string, exposures: number, calls: number, schemaTokens: number) => db.prepare(
      "INSERT INTO harness_tool_rollup(session_id,hour,revision,mode,model,tool,plugin_id,exposures,calls,schema_tokens,schema_samples) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ).run(session, "2026-10-30T08", "main@3", "agent", "m1", tool, pluginId, exposures, calls, schemaTokens * exposures, exposures);
    const pluginRules = () => query(db, "overview").flags.filter(flag => flag.rule === "plugin-costly-unused");

    // 样本不足（199 次请求）：不报。
    rollup("s1", "read_file", "actspace.filesystem-read", 199, 1, 600);
    expect(pluginRules()).toEqual([]);

    // 够 200 次、调用率 0.5%：工具和插件两条都报，插件规则跳到加载器 ID 的插件行。
    rollup("s2", "read_file", "actspace.filesystem-read", 1, 0, 600);
    const usageVs = query(db, "usage-vs");
    expect(usageVs.tools.find(row => row.name === "read_file")).toMatchObject({ pluginId: "filesystem-read", exposures: 200, calls: 1 });
    const plugins = query(db, "plugins");
    expect(plugins.rows.find(row => row.pluginId === "filesystem-read")).toMatchObject({ tools: 1, toolCalls: 1, contextTokens: 600 });
    expect(plugins.rows.some(row => row.pluginId === "actspace.filesystem-read")).toBe(false);
    expect(usageVs.plugins.find(row => row.pluginId === "filesystem-read")).toMatchObject({ tools: ["read_file"], exposures: 200, calls: 1 });
    expect(pluginRules()).toEqual([expect.objectContaining({ target: { card: "usage-vs", tab: "plugins", key: "filesystem-read" } })]);
    expect(query(db, "overview").flags.map(flag => flag.rule)).toContain("tool-costly-unused");

    // 调用率够高：不报。
    rollup("s3", "read_file", "actspace.filesystem-read", 0, 10, 600);
    expect(pluginRules()).toEqual([]);

    // 归属表里没有这个工具名，但 toolPluginId 能反查到加载器 ID。
    rollup("s4", "read_many", "actspace.filesystem-read", 5, 1, 100);
    expect(query(db, "usage-vs").tools.find(row => row.name === "read_many")!.pluginId).toBe("filesystem-read");
  });

  it("读取 Harness 版本记录", () => {
    const root = tempRoot(); mkdirSync(join(root, "harness-state"));
    writeFileSync(join(root, "harness-state", "selections.jsonl"), [
      JSON.stringify({ seq: 1, record: { harnessId: "main", revision: 1, requestDigest: "bootstrap", timestamp: "2026-10-01T00:00:00.000Z" } }),
      JSON.stringify({ seq: 2, record: { harnessId: "main", revision: 2, requestDigest: "abc", timestamp: "2026-10-20T00:00:00.000Z" } }),
    ].join("\n") + "\n");
    const db = database();
    ingestHarnessRuntimeFiles(db, root);
    const options = query(db, "options");
    expect(options.currentRevision).toBe("main@2");
    expect(options.revisions.map(info => [info.key, info.description])).toEqual([["main@2", "自进化 / 插件变更"], ["main@1", "初始版本"]]);
  });
});
