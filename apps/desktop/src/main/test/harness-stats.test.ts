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
import type { UsageActivityRow } from "@actspace/shared";

const BASE = Date.parse("2026-10-30T08:00:00.000Z");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function database(): DatabaseSync { const db = new DatabaseSync(":memory:"); createReadModelSchema(db); return db; }
function tempRoot(): string { const dir = mkdtempSync(join(tmpdir(), "harness-stats-")); dirs.push(dir); return dir; }
const filter: HarnessStatsFilter = { range: "total", sessionKind: "all" };
function query<K extends HarnessStatsQueryInput["kind"]>(db: DatabaseSync, kind: K, extra: Partial<HarnessStatsQueryInput> = {}): Extract<HarnessStatsData, { kind: K }>["value"] {
  return (queryHarnessStats(db, { requestId: "r", kind, filter, ...extra }, new Date(BASE + 86_400_000)) as Extract<HarnessStatsData, { kind: K }>).value;
}

/** 一段覆盖工具、审批、后台任务、压缩折叠、Skills、披露的会话日志。 */
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
  e("request/context", { requestId: "q1", snapshot: {
    tools: [{ name: "read_file" }, { name: "bash" }],
    contextModel: { contextWindow: 1000 },
    contextModelFacts: [{ id: "core/skills-catalog", content: [{ id: "writer", location: "/skills/writer/SKILL.md", source: "user" }] }],
    contextManifest: { comparable: true, totalEstimatedTokens: 500, buckets: { systemPrompt: 100, tools: 200, skills: 30, conversation: 170 }, entries: [
      { key: JSON.stringify(["tool", "x", "read_file"]), estimatedTokens: 120, bucket: "tools" },
      { key: JSON.stringify(["tool", "x", "bash"]), estimatedTokens: 80, bucket: "tools" },
      { key: JSON.stringify(["skill", "core", "catalog", "writer"]), estimatedTokens: 30, bucket: "skills" },
    ] },
  } });
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
  it("把工具、审批、后台任务、压缩和子 Agent 统计进各张表", () => {
    const db = database();
    projectHarnessJournalBatch(db, "s1", journal());
    const tools = query(db, "tools");
    const read = tools.rows.find(row => row.name === "read_file")!;
    expect(read).toMatchObject({ calls: 2, completed: 1, failed: 1, exposures: 1, schemaTokens: 120, repeatedSameArgs: 1, foldedOutputs: 1, foldedTokens: 100 });
    expect(read.failureCodes).toEqual([{ code: "io", count: 1 }]);
    expect(tools.approvals).toMatchObject({ asked: 1, userApproved: 1, avgWaitMs: 2000 });
    expect(tools.bash).toMatchObject({ unsandboxed: 1, escalations: 1, background: 1, foreground: 0 });

    const runtime = query(db, "runtime");
    expect(runtime).toMatchObject({ turns: 1, avgSteps: 2 });
    expect(runtime.endReasons.completed).toBe(1);
    expect(runtime.background).toMatchObject({ completed: 1, unread: 1 });
    expect(runtime.delegations.byPreset).toEqual([{ presetId: "explore", count: 1 }]);
    expect(runtime.delegations.avgDurationMs).toBe(5000);

    const disclosure = query(db, "disclosure");
    expect(disclosure.compaction).toMatchObject({ count: 1, auto: 1, foldedOutputs: 1, foldedTokens: 100, avgBeforeTokens: 900 });
    // 压缩前读过 /w/a.ts，压缩后 5 步内又读：算重读。
    expect(disclosure.compaction.rereadRate).toBe(1);

    const context = query(db, "context");
    expect(context.skills.find(skill => skill.id === "writer")).toMatchObject({ listed: 1, selected: 1, skillReads: 1 });
    expect(context.cache.hitRate).toBeCloseTo(0.75);
    expect(context.window.p50).toBeCloseTo(0.5);

    const options = query(db, "options");
    expect(options.revisions.map(info => info.key)).toContain("main@3");
    expect(options.models).toEqual(["m1"]);

    const flags = query(db, "overview").flags.map(flag => flag.rule);
    expect(flags).toContain("background-unread");
  });

  it("重放同一批事件不会重复计数，分批写入与一次写入结果一致", () => {
    const events = journal();
    const once = database();
    projectHarnessJournalBatch(once, "s1", events);
    projectHarnessJournalBatch(once, "s1", events);
    const split = database();
    for (let index = 0; index < events.length; index += 3) projectHarnessJournalBatch(split, "s1", events.slice(index, index + 3));
    const snapshot = (db: DatabaseSync) => ({ tools: query(db, "tools").rows, runtime: query(db, "runtime"), compaction: query(db, "disclosure").compaction });
    expect(snapshot(split)).toEqual(snapshot(once));
    expect(query(once, "tools").rows.find(row => row.name === "read_file")!.calls).toBe(2);
  });

  it("删除会话后统计归档，重建统计库时读回", () => {
    const root = tempRoot();
    const db = database();
    projectHarnessJournalBatch(db, "s1", journal());
    const before = query(db, "tools").rows;
    archiveHarnessSession(db, root, "s1");
    expect(query(db, "tools").rows).toEqual(before);
    expect(db.prepare("SELECT deleted FROM harness_session_meta WHERE session_id='s1'").get()).toEqual({ deleted: 1 });

    const rebuilt = database();
    expect(ingestHarnessArchive(rebuilt, root)).toBe(1);
    expect(query(rebuilt, "tools").rows).toEqual(before);
    expect(query(rebuilt, "runtime").turns).toBe(1);
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
    const parentOnly = { tools: query(db, "tools").rows, runtime: query(db, "runtime") };
    projectHarnessJournalBatch(db, "fork", fork, boundary);
    projectHarnessJournalBatch(db, "grand", grandchild, grandBoundary);

    // 父会话 2 次 read_file + 两个分支各自 1 次；轮数 1 + 1 + 1。
    expect(query(db, "tools").rows.find(row => row.name === "read_file")!.calls).toBe(4);
    expect(query(db, "runtime").turns).toBe(3);
    const perSession = (table: string) => db.prepare(`SELECT session_id,COUNT(*) AS n FROM ${table} GROUP BY session_id ORDER BY session_id`).all();
    expect(perSession("harness_request")).toEqual([{ session_id: "fork", n: 1 }, { session_id: "grand", n: 1 }, { session_id: "parent", n: 1 }]);
    expect(perSession("harness_turn")).toEqual([{ session_id: "fork", n: 1 }, { session_id: "grand", n: 1 }, { session_id: "parent", n: 1 }]);
    // 分支自己的请求沿用继承来的 Harness 版本和模式，不是 unknown。
    expect(db.prepare("SELECT revision,mode,model FROM harness_request WHERE session_id='fork'").get()).toEqual({ revision: "main@3", mode: "agent", model: "m1" });
    // 继承前缀里的压缩、后台任务、子 Agent 不会在分支里重复出现。
    for (const table of ["harness_compaction", "harness_background_task", "harness_delegation"]) expect(perSession(table)).toEqual([{ session_id: "parent", n: 1 }]);

    // 只有父会话时的结果不变；分批跨过边界与一次写入一致。
    const alone = database();
    projectHarnessJournalBatch(alone, "parent", parent);
    expect({ tools: query(alone, "tools").rows, runtime: query(alone, "runtime") }).toEqual(parentOnly);
    const split = database();
    projectHarnessJournalBatch(split, "parent", parent);
    for (let index = 0; index < fork.length; index += 4) projectHarnessJournalBatch(split, "fork", fork.slice(index, index + 4), boundary);
    const forkOnly = database();
    projectHarnessJournalBatch(forkOnly, "parent", parent);
    projectHarnessJournalBatch(forkOnly, "fork", fork, boundary);
    expect({ tools: query(split, "tools").rows, runtime: query(split, "runtime") }).toEqual({ tools: query(forkOnly, "tools").rows, runtime: query(forkOnly, "runtime") });
  });

  it("使用统计：索引与回退查询都只算分支自己的请求和工具", async () => {
    const usage = async (sessionId: string, events: readonly SessionEventEnvelopeV1[], inheritedThroughSeq?: number) => {
      const db = database();
      db.prepare("INSERT INTO session_catalog(session_id,title,revision) VALUES(?,?,?)").run(sessionId, null, events.at(-1)!.seq);
      const rows: UsageActivityRow[] = [];
      await projectUsageJournalBatch(db, { sessionId, title: null, throughJournalSeq: events.at(-1)!.seq, workspaceRoot: null, ...(inheritedThroughSeq === undefined ? {} : { inheritedThroughSeq }) }, events, async batch => { rows.push(...batch); });
      return rows;
    };
    const kinds = (rows: readonly UsageActivityRow[]) => rows.map(row => `${row.kind}:${row.requestId ?? row.toolName ?? ""}`).sort();
    const parentRows = await usage("parent", ownTurn(0, "p"));
    expect(kinds(parentRows)).toEqual(["llm_request:q-p", "tool_invocation:read_file"]);
    const forkEvents = [...ownTurn(0, "p"), ...ownTurn(8, "f")];
    expect(kinds(await usage("fork", forkEvents, 7))).toEqual(["llm_request:q-f", "tool_invocation:read_file"]);
    // 没有边界（旧行为）时会把父请求再算一遍：用来证明上面的断言确实在测边界。
    expect(kinds(await usage("fork", forkEvents))).toHaveLength(4);

    const fallback = new UsageSessionFallback();
    fallback.append({ sessionId: "fork", title: null, throughJournalSeq: 15, workspaceRoot: null, inheritedThroughSeq: 7 }, [ev(0, "session/title-set", { title: "继承的标题" }), ...forkEvents.slice(1)]);
    const materialized = fallback.materialize();
    try {
      const rows = materialized.prepare("SELECT kind,session_title FROM usage_activity ORDER BY kind").all();
      expect(rows).toEqual([{ kind: "llm_request", session_title: "继承的标题" }, { kind: "tool_invocation", session_title: "继承的标题" }]);
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
      line({ t: "health", at: "2026-10-30T08:00:00.000Z", writeFailures: 2 }),
    ].join(""));
    appendFileSync(file, '{"v":1,"t":"runtime"'); // 写到一半的行：不能读
    const db = database();
    const first = ingestHarnessRuntimeFiles(db, root);
    expect(first).toMatchObject({ files: 1, lines: 6, reset: false });
    const fingerprint = harnessFingerprint(db);

    const plugins = query(db, "plugins", { filter: { ...filter, revision: "main@3" } });
    expect(plugins.services.find(row => row.service === "tools.runtime")).toMatchObject({ providerPluginId: "tools-runtime", calls: 2, errors: 1 });
    expect(plugins.listeners).toEqual([{ pluginId: "english", event: "session/created", calls: 4, errors: 2, avgMs: 2 }]);
    expect(plugins.rows.find(row => row.pluginId === "broken")).toMatchObject({ source: "user", loadFailures: 1, lastLoadError: "boom" });
    expect(plugins.runtimeEmpty).toBe(false);
    const rules = query(db, "overview", { filter: { ...filter, revision: "main@3" } }).flags.map(flag => flag.rule);
    expect(rules).toEqual(expect.arrayContaining(["plugin-load-failure", "listener-errors"]));
    expect(db.prepare("SELECT write_failures FROM harness_stats_health WHERE id=1").get()).toEqual({ write_failures: 2 });

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
    expect(db.prepare("SELECT write_failures FROM harness_stats_health WHERE id=1").get()).toEqual({ write_failures: 0 });
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
      "INSERT INTO harness_tool_rollup(session_id,hour,revision,mode,model,tool,plugin_id,exposures,calls,completed,schema_tokens,schema_samples) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(session, "2026-10-30T08:00:00.000Z", "main@3", "agent", "m1", tool, pluginId, exposures, calls, calls, schemaTokens * exposures, exposures);
    const pluginRules = () => query(db, "overview").flags.filter(flag => flag.rule === "plugin-costly-unused");

    // 样本不足（199 次请求）：不报。
    rollup("s1", "read_file", "actspace.filesystem-read", 199, 1, 600);
    expect(pluginRules()).toEqual([]);

    // 够 200 次、调用率 0.5%：工具和插件两条都报，插件规则跳到加载器 ID 的插件行。
    rollup("s2", "read_file", "actspace.filesystem-read", 1, 0, 600);
    const tools = query(db, "tools");
    expect(tools.rows.find(row => row.name === "read_file")).toMatchObject({ pluginId: "filesystem-read", exposures: 200, calls: 1 });
    const plugins = query(db, "plugins");
    expect(plugins.rows.find(row => row.pluginId === "filesystem-read")).toMatchObject({ tools: 1, toolCalls: 1, contextTokens: 600 });
    expect(plugins.rows.some(row => row.pluginId === "actspace.filesystem-read")).toBe(false);
    expect(pluginRules()).toEqual([expect.objectContaining({ target: { tab: "plugins", key: "filesystem-read" } })]);
    expect(query(db, "overview").flags.map(flag => flag.rule)).toContain("tool-costly-unused");

    // 调用率够高：不报。
    rollup("s3", "read_file", "actspace.filesystem-read", 0, 10, 600);
    expect(pluginRules()).toEqual([]);

    // 归属表里没有这个工具名，但 toolPluginId 能反查到加载器 ID。
    rollup("s4", "read_many", "actspace.filesystem-read", 5, 1, 100);
    expect(query(db, "tools").rows.find(row => row.name === "read_many")!.pluginId).toBe("filesystem-read");
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
