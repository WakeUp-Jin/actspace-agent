// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionQuerySource } from "@actspace/session-storage";
import { describeSupplementEntry } from "@actspace/shared";
import { createReadModelSchema } from "../runtime-v2/usage-read-model-schema";
import { commitContextBatch } from "../runtime-v2/context-history-projection";
import { queryContextHistory } from "../runtime-v2/context-history-query";
import { describeSupplementEvent, describeToolChange } from "../runtime-v2/context-history-events";

const SESSION = "s";
const DISCLOSURE = "actspace.context-disclosure";
const RUNTIME = "actspace.context-runtime";
const files = (...paths: string[]) => ["Current active context files (this list supersedes earlier navigation lists):", ...paths.map(path => `- ${JSON.stringify(path)} — about ${path}`)].join("\n");
const runtime = (mode: string) => `Current runtime state: mode=${mode}; date=2026-11-08; timezone=Asia/Shanghai. A later runtime state supersedes this state.`;
const tokens = (owner: string, id: string, text: string) => describeSupplementEntry({ owner, id, text })!.entry.estimatedTokens;

describe("describeSupplementEvent", () => {
  it("lists added and removed files against the previous list", () => {
    const first = describeSupplementEvent(DISCLOSURE, "navigation", files("src/a.ts", "src/b.ts"), undefined);
    expect(first).toMatchObject({ kind: "files", label: "活跃文件清单更新", detail: "新增 a.ts 等 2 个，共 2 个" });
    const next = describeSupplementEvent(DISCLOSURE, "navigation", files("src/b.ts", "docs/c.md"), first.memory);
    expect(next.detail).toBe("新增 c.md，移除 a.ts，共 2 个");
    expect(describeSupplementEvent(DISCLOSURE, "navigation", files("src/b.ts", "docs/c.md"), next.memory).detail).toBe("文件不变，共 2 个");
  });

  it("writes the mode change of the runtime state", () => {
    const first = describeSupplementEvent(RUNTIME, "runtime-state", runtime("agent"), undefined);
    expect(first).toMatchObject({ kind: "runtime", detail: "模式 agent · 日期 2026-11-08" });
    expect(describeSupplementEvent(RUNTIME, "runtime-state", runtime("plan"), first.memory).detail).toBe("模式 agent → plan");
  });

  it("counts running background tasks, and running subagents of old Sessions", () => {
    const agents = "Running subagents (this list supersedes earlier ones):\n- a1 · review-ui · general · started 10:02 · transcript: /t/a1\n- a2 · test-runner · general · started 10:03 · transcript: /t/a2";
    expect(describeSupplementEvent("actspace.context-subagents", "subagents", agents, undefined)).toMatchObject({ kind: "subagents", detail: "2 个运行中：review-ui、test-runner" });
    const tasks = "Background tasks still running (this list supersedes earlier lists; completion notifications supersede it):\n- b1 · bash · pnpm dev · started 2026-11-08T10:00:00+08:00\n- a3 · agent · review auth · explore · started 2026-11-08T10:01:00+08:00 · transcript: /t/a3\nDo not start duplicates. You are notified when each one finishes; task_stop stops one.";
    expect(describeSupplementEvent("actspace.context-background-tasks", "background-tasks", tasks, undefined)).toMatchObject({ kind: "background", detail: "2 个运行中：pnpm dev、review auth" });
    expect(describeSupplementEvent("actspace.context-background-tasks", "background-tasks", "No background tasks are running.", undefined).detail).toBe("全部结束");
  });

  it("falls back to the supplement id and owner for unknown or unparsable text", () => {
    expect(describeSupplementEvent("some.plugin", "notes", "anything", undefined)).toMatchObject({ kind: "inject", label: "上下文补充 · notes", detail: "some.plugin" });
    expect(describeSupplementEvent(RUNTIME, "runtime-state", "garbled", undefined)).toMatchObject({ kind: "inject", label: "上下文补充 · runtime-state" });
  });

  it("describes tool list changes", () => {
    expect(describeToolChange(["read", "bash"], ["read", "write", "grep"])).toBe("新增 2 个：write、grep；移除 1 个：bash");
  });
});

/** 第 1 轮：运行状态 + 文件清单（步 1）、文件清单再更新两次（步 2、步 3）；轮后切模式；第 2 轮：模式随轮开始，压缩一次。 */
function journal() {
  const events: SessionEventEnvelopeV1[] = [];
  const e = (type: string, data: Record<string, unknown>, surface: unknown = null) => { const seq = events.length; events.push({ recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: new Date(Date.parse("2026-11-08T00:00:00.000Z") + seq * 1000).toISOString(), source: { ownerPluginId: "@actspace/core" }, data, surface, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as unknown as SessionEventEnvelopeV1); return seq; };
  const supplement = (owner: string, id: string, text: string) => e("plugin/actspace.context/supplement", { op: "add", owner, id, text, afterEventSeq: -1, lifetime: "persistent" });
  e("turn/start", { turnId: "t1", mode: "agent" });
  const u1 = e("user/message", { messageId: "u1", content: "a".repeat(4000) }, { kind: "append" });
  e("step/start", { turnId: "t1", stepId: "s1", stepIndex: 1 });
  supplement(RUNTIME, "runtime-state", runtime("agent"));
  supplement(DISCLOSURE, "navigation", files("src/a.ts"));
  e("step/start", { turnId: "t1", stepId: "s2", stepIndex: 2 });
  supplement(DISCLOSURE, "navigation", files("src/a.ts", "src/b.ts"));
  e("step/start", { turnId: "t1", stepId: "s3", stepIndex: 3 });
  supplement(DISCLOSURE, "navigation", files("src/a.ts", "src/b.ts", "src/c.ts"));
  e("turn/end", { turnId: "t1" });
  e("agent/mode-set", { mode: "plan", revision: 1, changedAt: "2026-11-08T00:00:20.000Z", source: "user" });
  e("turn/start", { turnId: "t2", mode: "plan" });
  e("step/start", { turnId: "t2", stepId: "s4", stepIndex: 1 });
  e("compaction/start", { compactionId: "k1" });
  e("surface/replaced", { compactionId: "k1", sourceEventSeqs: [u1], replacedTokens: { conversation: 1000, summarizedConversation: 0 }, node: { kind: "user", messageId: "summary-k1", content: "short" } }, { kind: "replace", start: 0, end: 1, sourceEventSeqs: [u1] });
  e("compaction/end", { compactionId: "k1" });
  return events;
}

async function indexed(batch = Infinity) {
  const db = new DatabaseSync(":memory:"); createReadModelSchema(db);
  const events = journal();
  const source = { header: { sessionId: SESSION, createdAt: "2026-11-08T00:00:00.000Z" }, throughSeq: events.length - 1, stamp: "stamp", codecSetDigest: "codec" } as unknown as SessionQuerySource;
  for (let index = 0; index < events.length; index += batch === Infinity ? events.length : batch) {
    const slice = events.slice(index, index + (batch === Infinity ? events.length : batch));
    await commitContextBatch(db, source, slice, `c${index}`, index === 0, index + slice.length >= events.length, index === 0, async () => undefined);
  }
  return queryContextHistory(db, SESSION)!.events;
}

describe("context events projection", () => {
  it("gives each event a title, detail, position and token delta, merging same-turn runs", async () => {
    const events = await indexed();
    const nav = (...paths: string[]) => tokens(DISCLOSURE, "navigation", files(...paths));
    expect(events.map(({ kind, label, detail, count, tokenDelta, turnIndex, stepIndex }) => ({ kind, label, detail, count, tokenDelta, turnIndex, stepIndex }))).toEqual([
      { kind: "compact", label: "上下文已压缩", detail: "旧对话换成摘要", count: undefined, tokenDelta: expect.any(Number), turnIndex: 2, stepIndex: 1 },
      { kind: "mode-switch", label: "模式切换", detail: "agent → plan", count: undefined, tokenDelta: null, turnIndex: null, stepIndex: null },
      { kind: "files", label: "活跃文件清单更新", detail: "本轮连续 3 次，合并显示；共 3 个", count: 3, tokenDelta: nav("src/a.ts", "src/b.ts", "src/c.ts"), turnIndex: 1, stepIndex: null },
      { kind: "runtime", label: "运行状态更新", detail: "模式 agent · 日期 2026-11-08", count: undefined, tokenDelta: tokens(RUNTIME, "runtime-state", runtime("agent")), turnIndex: 1, stepIndex: 1 },
    ]);
    expect(events[0].tokenDelta).toBeLessThan(0);
  });

  it("gives the same events when the journal is indexed in small batches", async () => {
    expect(await indexed(2)).toEqual(await indexed());
  });
});
