// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { UsageActivityRow, UsageAuxiliaryPurpose } from "@actspace/shared";
import { createReadModelSchema } from "../runtime-v2/usage-read-model-schema";
import { insertUsageActivities } from "../runtime-v2/usage-activity-write";
import { queryUsageActivity } from "../runtime-v2/usage-activity-query";
import { refreshHarnessSessionMeta } from "../runtime-v2/harness-stats-archive";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

type RowInput = { id: string; at: string; model?: string; provider?: string; status?: UsageActivityRow["status"]; tokens?: number; cost?: number; ttftMs?: number; decodeMs?: number; output?: number; purpose?: UsageAuxiliaryPurpose; retryOf?: string; durationMs?: number };
function row(sessionId: string, input: RowInput): UsageActivityRow {
  const total = input.tokens ?? 100;
  return {
    activityId: `${sessionId}:${input.id}`, kind: "llm_request", sessionId, agentRunId: "run", requestId: input.id, startedAt: input.at, endedAt: input.at,
    model: input.model ?? "m1", providerId: input.provider ?? "p1", status: input.status ?? "success", durationMs: input.durationMs ?? 1000,
    ...(input.ttftMs === undefined ? {} : { ttftMs: input.ttftMs }), ...(input.decodeMs === undefined ? {} : { decodeMs: input.decodeMs }),
    ...(input.purpose ? { purpose: input.purpose } : {}), ...(input.retryOf ? { retryOfRequestId: input.retryOf } : {}),
    tokens: { inputTokens: total - (input.output ?? 10), outputTokens: input.output ?? 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: total },
    costUsd: input.cost ?? null, costBasis: input.cost === undefined ? "unavailable" : "priced", costAmount: input.cost ?? null, costCurrency: input.cost === undefined ? null : "USD",
    sourceEventSeq: 0, relatedEventSeqs: [],
  };
}

function seed(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  createReadModelSchema(db);
  const session = (id: string, workspace: string | null, worktree?: string) => db.prepare("INSERT INTO session_catalog(session_id,title,revision,workspace_root,worktree_json) VALUES(?,?,?,?,?)").run(id, `会话 ${id}`, 1, workspace, worktree ? JSON.stringify({ sourceWorkspaceRoot: worktree }) : null);
  session("a", "/w/one"); session("b", "/w/two"); session("c", "/tmp/wt", "/w/one"); session("child", null);
  db.prepare("UPDATE session_catalog SET is_child_session=1 WHERE session_id='child'").run();
  insertUsageActivities(db, { sessionId: "a", title: "会话 a", throughJournalSeq: 1, rows: [
    row("a", { id: "q1", at: hoursAgo(2), tokens: 1000, cost: 0.5, ttftMs: 400, decodeMs: 2000, output: 100 }),
    row("a", { id: "q2", at: hoursAgo(2), status: "error", tokens: 0 }),
    row("a", { id: "q3", at: hoursAgo(2), retryOf: "q2", tokens: 200, model: "m2" }),
    row("a", { id: "x1", at: hoursAgo(2), purpose: "compaction", tokens: 50, durationMs: 3000 }),
    row("a", { id: "old", at: hoursAgo(24 * 40), tokens: 7 }),
  ] });
  insertUsageActivities(db, { sessionId: "b", title: "会话 b", throughJournalSeq: 1, rows: [row("b", { id: "q1", at: hoursAgo(30), tokens: 300, provider: "p2" })] });
  insertUsageActivities(db, { sessionId: "c", title: "会话 c", throughJournalSeq: 1, rows: [row("c", { id: "q1", at: hoursAgo(3), tokens: 40 })] });
  insertUsageActivities(db, { sessionId: "child", title: "子会话", throughJournalSeq: 1, rows: [row("child", { id: "q1", at: hoursAgo(1), tokens: 500, cost: 0.25 })] });

  // Harness 表：工具、命令、Skill、子 Agent。
  const hour = hoursAgo(2).slice(0, 13);
  db.prepare("INSERT INTO harness_tool_rollup(session_id,hour,revision,mode,model,tool,plugin_id,calls,failed,failure_codes,duration_ms,duration_samples,duration_hist,approval_wait_ms,approval_wait_samples,output_tokens,output_samples) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("a", hour, "main@1", "agent", "m1", "bash", "x", 4, 1, JSON.stringify({ timeout: 1 }), 800, 4, JSON.stringify([0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0]), 1500, 1, 120, 4);
  db.prepare("INSERT INTO harness_tool_rollup(session_id,hour,revision,mode,model,tool,plugin_id,calls) VALUES(?,?,?,?,?,?,?,?)").run("b", hour, "main@1", "agent", "m1", "read_file", "x", 2);
  const bash = db.prepare("INSERT INTO harness_bash_rollup(session_id,hour,revision,mode,model,program,subcommand,calls,failed,duration_ms,duration_samples) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  bash.run("a", hour, "main@1", "agent", "m1", "git", "status", 2, 0, 100, 2); bash.run("a", hour, "main@1", "agent", "m1", "git", "diff", 1, 1, 50, 1); bash.run("a", hour, "main@1", "agent", "m1", "ls", "", 1, 0, 5, 1);
  db.prepare("INSERT INTO harness_skill_rollup(session_id,hour,revision,mode,model,skill_id,listed,skill_reads,asset_reads,last_read_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run("a", hour, "main@1", "agent", "m1", "writer", 5, 1, 2, hoursAgo(2));
  db.prepare("INSERT INTO harness_skill_rollup(session_id,hour,revision,mode,model,skill_id,listed) VALUES(?,?,?,?,?,?,?)").run("a", hour, "main@1", "agent", "m1", "unused", 5);
  const file = db.prepare("INSERT INTO harness_skill_file(session_id,hour,revision,mode,model,skill_id,file,reads,last_read_at) VALUES(?,?,?,?,?,?,?,?,?)");
  file.run("a", hour, "main@1", "agent", "m1", "writer", "SKILL.md", 1, hoursAgo(2)); file.run("a", hour, "main@1", "agent", "m1", "writer", "refs/style.md", 2, hoursAgo(2));
  db.prepare("INSERT INTO harness_delegation(session_id,invocation_id,hour,revision,mode,model,time,preset_id,status,child_session_id) VALUES(?,?,?,?,?,?,?,?,?,?)").run("a", "i1", hour, "main@1", "agent", "m1", hoursAgo(2), "explore", "running", "child");
  // 终止状态与耗时来自子会话那一侧的事件。
  db.prepare("INSERT INTO harness_delegation(session_id,invocation_id,status,duration_ms,child_session_id) VALUES(?,?,?,?,?)").run("child", "i1", "completed", 5000, "child");
  refreshHarnessSessionMeta(db);
  return db;
}

describe("使用统计查询", () => {
  it("汇总、耗时分段、辅助模型与 Harness 各组", () => {
    const db = seed();
    const result = queryUsageActivity(db, { scope: "global", range: "month" }, false, NOW)!;
    // 40 天前的请求不在 30 天范围内。
    expect(result.summary).toMatchObject({ requestCount: 7, failedRequestCount: 1, retryCount: 1, totalTokens: 2090 });
    expect(result.timing).toMatchObject({ ttftMs: 400, ttftSamples: 1, decodeMs: 2000, decodeTokens: 100, untimedRequests: 5, toolMs: 800, toolSamples: 4, approvalWaitMs: 1500, approvalSamples: 1, auxiliaryMs: 3000, auxiliaryCount: 1 });
    expect(result.auxiliary).toEqual([{ purpose: "compaction", calls: 1, durationMs: 3000, totalTokens: 50, costUsd: 0 }]);
    // 同一模型在不同提供商下分开算。
    expect(result.aggregates!.models.map(model => model.key).sort()).toEqual(["p1//m1", "p1//m2", "p2//m1"]);
    expect(result.filterOptions).toEqual({ models: ["m1", "m2"], providers: ["p1", "p2"], workspaces: ["/w/one", "/w/two"] });

    expect(result.tools).toEqual([
      expect.objectContaining({ name: "bash", calls: 4, failed: 1, failureCodes: { timeout: 1 }, durationMs: 800, p95Ms: 128, outputTokens: 120 }),
      expect.objectContaining({ name: "read_file", calls: 2, p95Ms: null }),
    ]);
    expect(result.commands).toEqual([
      { program: "git", calls: 3, failed: 1, durationMs: 150, durationSamples: 3, subcommands: [{ name: "status", calls: 2 }, { name: "diff", calls: 1 }] },
      { program: "ls", calls: 1, failed: 0, durationMs: 5, durationSamples: 1, subcommands: [] },
    ]);
    // 只列读过的 Skill；文件按次数倒序。
    expect(result.skills).toEqual([{ skillId: "writer", skillReads: 1, assetReads: 2, lastReadAt: hoursAgo(2), files: ["refs/style.md", "SKILL.md"] }]);
    // 父子两侧的行按 invocation 合并；Token / 费用来自子会话。
    expect(result.subagents).toEqual([{ preset: "explore", calls: 1, failed: 0, durationMs: 5000, durationSamples: 1, totalTokens: 500, costUsd: 0.25 }]);
    expect(result.harnessUnavailable).toBeUndefined();
  });

  it("工作区筛选把 worktree 会话归到来源工作区，Harness 各组同样筛选", () => {
    const db = seed();
    const one = queryUsageActivity(db, { scope: "global", range: "month", workspaceRoot: "/w/one" }, false, NOW)!;
    expect(one.summary.requestCount).toBe(5); // a 的 4 条（30 天内）+ worktree 会话 c
    expect(one.summary.totalTokens).toBe(1290);
    expect(one.tools!.map(tool => tool.name)).toEqual(["bash"]);
    const two = queryUsageActivity(db, { scope: "global", range: "month", workspaceRoot: "/w/two" }, false, NOW)!;
    expect(two.summary.requestCount).toBe(1);
    expect(two.tools!.map(tool => tool.name)).toEqual(["read_file"]);
    expect(two.commands).toEqual([]);
  });

  it("用量趋势按本机时区分桶并补齐空桶，活跃度不受筛选影响", () => {
    const db = seed();
    const day = queryUsageActivity(db, { scope: "global", range: "day", utcOffsetMinutes: 480 }, false, NOW)!;
    expect(day.series!.unit).toBe("hour");
    expect(day.series!.buckets).toHaveLength(24);
    // 12:00Z = 东八区 20:00；两小时前 = 18:00。
    expect(day.series!.buckets.at(-1)!.start).toBe("2026-11-07 20:00");
    expect(day.series!.buckets.find(bucket => bucket.start === "2026-11-07 18:00")).toMatchObject({ requests: 4, tokens: 1250, costUsd: 0.5 });

    const week = queryUsageActivity(db, { scope: "global", range: "week", model: "m2", utcOffsetMinutes: 330 }, false, NOW)!;
    expect(week.series!.unit).toBe("day");
    expect(week.series!.buckets).toHaveLength(7);
    expect(week.series!.buckets.reduce((sum, bucket) => sum + bucket.requests, 0)).toBe(1);
    // 活跃度：98 天内，不受模型筛选；会话 = 当天有请求的会话数。
    const days = new Map(week.heatmap!.days.map(item => [item.date, item]));
    expect(days.get("2026-11-07")).toMatchObject({ sessions: 3, tokens: 1790 });
    expect(days.get("2026-11-06")).toMatchObject({ sessions: 1, tokens: 300 });
    expect(days.has("2026-09-28")).toBe(true); // 40 天前那条

    const total = queryUsageActivity(db, { scope: "global", range: "total" }, false, NOW)!;
    expect(total.series!.unit).toBe("week");
    expect(total.series!.buckets.every(bucket => new Date(`${bucket.start}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect(total.summary.requestCount).toBe(8);
    expect(total.series!.firstAt!.slice(0, 13)).toBe(hoursAgo(24 * 40).slice(0, 13));
    expect(day.series!.firstAt!.slice(0, 13)).toBe(hoursAgo(3).slice(0, 13));
  });

  it("回退查询没有 Harness 表时标记不可用", () => {
    const db = seed();
    const result = queryUsageActivity(db, { scope: "global", range: "month" }, true, NOW)!;
    expect(result.harnessUnavailable).toBe(true);
    expect(result.tools).toBeUndefined();
    expect(result.subagents).toBeUndefined();
    expect(result.summary.requestCount).toBe(7);
  });
});
