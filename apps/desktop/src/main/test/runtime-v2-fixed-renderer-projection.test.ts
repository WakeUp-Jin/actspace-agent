import { describe, expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { RuntimeV2JsonValue, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import { projectSubagentList, projectSubagentTranscript, projectContextSnapshot, projectContextState, projectFixedRendererEvents, projectFixedRendererSession, projectUsageActivity } from "../runtime-v2/fixed-renderer-projection";

it("restores a durable failed turn as an error block, including old failures without details", () => {
  for (const failure of [undefined, { kind: "invalid-request", message: "Cannot send tool image", retryable: false }]) {
    const journal = [event(0, "turn/start", { turnId: "turn", agentRunId: "run" }), event(1, "turn/end", { turnId: "turn", reason: "failed", ...(failure ? { failure } : {}) })];
    const restored = projectFixedRendererSession(baseSnapshot(), journal, "/fixture");
    expect(restored.events.filter((e) => e.type === "error")).toHaveLength(1);
    expect(restored.messageBlocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "error", content: failure?.message ?? "LLM request failed." })]));
  }
});

describe("fixed renderer v2 projection", () => {
  it("binds an Inbox claim to the following next-turn run for stable renderer handoff keys", () => {
    const agentRunId = "agent-run-inbox-claim";
    const journal = [
      event(0, "agent/inbox/spliced", { operation: "enqueue", messageId: "user-inbox-claim", target: "next-turn", content: "hello" }),
      event(1, "agent/inbox/spliced", { operation: "claim", messageId: "user-inbox-claim", target: "next-turn" }, append("user", "user-inbox-claim", "hello")),
      event(2, "turn/start", { turnId: "turn-inbox-claim", agentRunId, mode: "agent" }),
    ];
    const snapshot = baseSnapshot({
      throughJournalSeq: 2,
      messages: [{ kind: "user", messageId: "user-inbox-claim", content: "hello" }],
    });

    const projected = projectFixedRendererSession(snapshot, journal, "/tmp/workspace");

    expect(projected.messageBlocks).toEqual([
      expect.objectContaining({
        kind: "user",
        content: "hello",
        renderKey: `turn:${agentRunId}:user:0`,
      }),
    ]);
  });

  it("binds a next-step Inbox claim to the active turn instead of the following turn", () => {
    const activeAgentRunId = "agent-run-active";
    const journal = [
      event(0, "turn/start", { turnId: "turn-active", agentRunId: activeAgentRunId, mode: "agent" }),
      event(1, "agent/inbox/spliced", { operation: "claim", messageId: "user-next-step", target: "next-step" }, append("user", "user-next-step", "continue")),
      event(2, "turn/start", { turnId: "turn-later", agentRunId: "agent-run-later", mode: "agent" }),
    ];
    const snapshot = baseSnapshot({
      throughJournalSeq: 2,
      messages: [{ kind: "user", messageId: "user-next-step", content: "continue" }],
    });

    const projected = projectFixedRendererSession(snapshot, journal, "/tmp/workspace");

    expect(projected.messageBlocks).toEqual([
      expect.objectContaining({
        kind: "user",
        content: "continue",
        renderKey: `turn:${activeAgentRunId}:user:0`,
      }),
    ]);
  });

  it("projects a claimed Inbox follow-up as a user message after the stream completes", () => {
    const journal = [
      event(0, "agent/inbox/spliced", { operation: "enqueue", messageId: "user-1", target: "next-turn", content: "张飞是谁" }),
      event(1, "agent/inbox/spliced", { operation: "claim", messageId: "user-1", target: "next-turn" }, append("user", "user-1", "张飞是谁")),
      event(2, "assistant/message", { messageId: "assistant-1", requestId: "request-1", content: "张飞是三国人物" }, append("assistant", "assistant-1", "张飞是三国人物")),
    ];
    const snapshot = baseSnapshot({
      throughJournalSeq: 2,
      messages: [
        { kind: "user", messageId: "user-1", content: "张飞是谁" },
        { kind: "assistant", messageId: "assistant-1", content: "张飞是三国人物" },
      ],
    });

    const messages = projectFixedRendererEvents(snapshot, journal)
      .filter((item) => item.type === "user_message" || item.type === "assistant_message");

    expect(messages).toEqual([
      expect.objectContaining({ type: "user_message", payload: expect.objectContaining({ content: "张飞是谁" }) }),
      expect.objectContaining({ type: "assistant_message", payload: expect.objectContaining({ content: "张飞是三国人物" }) }),
    ]);
  });

  it("preserves task notification provenance so the user projection can hide it", () => {
    const notification = [
      event(0, "agent/inbox/spliced", { operation: "enqueue", messageId: "notify-1", target: "next-step", content: "<task_notification>done</task_notification>", source: "task_notification" }),
      event(1, "agent/inbox/spliced", { operation: "claim", messageId: "notify-1", target: "next-step", source: "task_notification" }, append("user", "notify-1", "<task_notification>done</task_notification>")),
    ];
    const snapshot = baseSnapshot({
      throughJournalSeq: 1,
      messages: [{ kind: "user", messageId: "notify-1", content: "<task_notification>done</task_notification>" }],
    });

    const projected = projectFixedRendererSession(snapshot, notification, "/tmp/workspace");
    const userEvent = projectFixedRendererEvents(snapshot, notification).find((item) => item.type === "user_message");

    expect(userEvent?.payload).toMatchObject({ source: "task_notification" });
    expect(projected.messageBlocks).toEqual([]);
  });

  it("projects only the effective Surface and places a compaction summary at the shadowed range", () => {
    const journal = [
      event(0, "user/message", { messageId: "user-1", agentRunId: "run-1", turnId: "turn-1" }, append("user", "user-1", "old question")),
      event(1, "assistant/message", { messageId: "assistant-1", requestId: "request-1" }, append("assistant", "assistant-1", "old answer")),
      event(2, "compaction/start", { compactionId: "compact-1", start: 0, end: 2 }),
      event(3, "compaction/summary", { compactionId: "compact-1", summaryDigest: "digest" }),
      event(4, "surface/replaced", { compactionId: "compact-1", sourceEventSeqs: [0, 1] }, {
        kind: "replace",
        start: 0,
        end: 2,
        node: { kind: "user", messageId: "summary-1", content: "summary" },
        sourceEventSeqs: [0, 1],
      }),
      event(5, "compaction/end", { compactionId: "compact-1", summaryDigest: "digest" }),
    ];
    const snapshot = baseSnapshot({ messages: [{ kind: "user", messageId: "summary-1", content: "summary" }], throughJournalSeq: 5, activity: { ...baseSnapshot().activity, compactionCount: 1, lastCompactionSummary: "summary" } });

    const projected = projectFixedRendererEvents(snapshot, journal);

    expect(projected.filter((item) => item.type === "user_message" || item.type === "assistant_message")).toEqual([
      expect.objectContaining({ id: "v2-4", type: "user_message", payload: expect.objectContaining({ content: "summary" }) }),
    ]);
    expect(projected.some((item) => item.type === "context_compaction")).toBe(true);
  });

  it("maps core file writes to the existing write diff preview", () => {
    const journal = [
      event(0, "tool/call", { callId: "call-1", name: "write_file", pluginId: "actspace.core-tools", agentRunId: "run-1", turnId: "turn-1", stepId: "step-1", args: { path: "src/a.ts", content: "next" } }),
      event(1, "tool/result", { callId: "call-1", pluginId: "actspace.core-tools", name: "write_file", status: "completed", summary: "Updated src/a.ts", modelOutput: [{ type: "text", text: "--- a/src/a.ts\n+++ b/src/a.ts\n-old\n+next\n\nFile updated: src/a.ts" }], detail: [{ label: "result", value: { type: "update", path: "src/a.ts", additions: 1, deletions: 1 } }], artifacts: [], failure: null }, appendTool("tool-call-1", "call-1")),
    ];
    const snapshot = baseSnapshot({
      messages: [{ kind: "tool-result", messageId: "tool-call-1", callId: "call-1", content: [{ type: "text", text: "done" }] }],
      throughJournalSeq: 1,
      tools: [{ kind: "tool", schemaVersion: 1, sessionId: "session-1", agentRunId: "run-1", turnId: "turn-1", stepId: "step-1", pluginId: "actspace.core-tools", name: "write_file", callId: "call-1", state: "completed", phase: null, startedAt: TIME, finishedAt: TIME, durationMs: 0, argsSummary: { text: "{}", fields: [] }, modelOutput: [{ type: "text", text: "done" }], summary: "Updated src/a.ts", detail: [], artifacts: [], failure: null, renderer: null }],
    });

    const result = projectFixedRendererEvents(snapshot, journal).find((item) => item.type === "tool_result");

    expect(result?.payload).toMatchObject({
      uiPreview: {
        kind: "write",
        filePath: "src/a.ts",
        additions: 1,
        deletions: 1,
        status: "completed",
      },
    });
  });

  it("rebuilds the fixed Context panel from the latest durable request snapshot", () => {
    const journal = [event(0, "request/context", {
      requestId: "request-1",
      turnId: "turn-1",
      stepId: "step-1",
      snapshot: {
        systemSections: ["core prompt", { title: "Workspace instructions", content: "Follow AGENTS.md" }, [{ id: "llm-agent-dev", content: "Skill body" }]],
        tools: [{ name: "read_file", inputSchema: { type: "object" } }],
        facts: [{ host: { agentMode: "plan" } }],
        messages: [{ role: "user", content: "Inspect the repository" }],
      },
    })];

    const state = projectContextState(baseSnapshot({}), journal);

    expect(state.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "systemPrompt", title: "Core identity", preview: "core prompt" }),
      expect.objectContaining({ kind: "rules", title: "Workspace instructions", preview: "Follow AGENTS.md" }),
      expect.objectContaining({ kind: "skills", title: "llm-agent-dev", preview: "Skill body" }),
      expect.objectContaining({ kind: "toolDefinitions", title: "read_file" }),
      expect.objectContaining({ kind: "conversation", title: "user 1", preview: "Inspect the repository" }),
    ]));
    expect(state.entries.every((entry) => entry.estimatedTokens > 0)).toBe(true);
    expect(state.buckets.find((bucket) => bucket.name === "tools")?.tokens).toBeGreaterThan(0);
  });

  it("uses latest request context for occupancy independently of cumulative usage", () => {
    const journal = [event(0, "request/context", {
      requestId: "latest", snapshot: {
        prepared: { contextWindow: 1_000_000 },
        messages: [{ role: "user", content: "x".repeat(196_000) }],
      },
    })];
    const snapshot = baseSnapshot({ usage: { ...baseSnapshot().usage, totalTokens: 549_000 } });
    const state = projectContextState(snapshot, journal);
    const context = projectContextSnapshot(snapshot, journal);
    expect(state.totalEstimatedTokens).toBeGreaterThan(0);
    expect(context).toMatchObject({
      totalTokens: state.totalEstimatedTokens, percentUsed: state.percentUsed,
      maxTokens: state.maxTokens, buckets: state.buckets, estimator: state.estimator,
      cumulativeTokens: 549_000,
    });
    expect(projectContextSnapshot({ ...snapshot, usage: { ...snapshot.usage, totalTokens: 999_000 } }, journal).totalTokens).toBe(context.totalTokens);
    expect(projectContextSnapshot(snapshot).totalTokens).toBe(0);
  });

  it("keeps full counters when browse previews are truncated", () => {
    const snapshot = baseSnapshot();
    const full = projectContextState(snapshot, [event(0, "request/context", { snapshot: {
      prepared: { contextWindow: 1_000_000 }, systemSections: ["s".repeat(8000)],
      messages: Array.from({ length: 52 }, () => ({ role: "user", content: "中".repeat(2000) })),
    } })]);
    const bounded = event(0, "request/context", { snapshot: {
      prepared: { contextWindow: 1_000_000 }, systemSections: ["s".repeat(1000)],
      messages: Array.from({ length: 20 }, () => ({ role: "user", content: "中".repeat(1000) })),
    }, browseContextState: JSON.parse(JSON.stringify({ ...full, entries: full.entries.map(e => ({ ...e, preview: e.preview?.slice(0, 1000) })) })) });
    expect(projectContextSnapshot(snapshot, [bounded]).totalTokens).toBe(full.totalEstimatedTokens);
    expect(projectContextState(snapshot, [bounded]).buckets).toEqual(full.buckets);
  });

  it("estimates the compacted surface until the next request without duplicating summaries", () => {
    const request = event(0, "request/context", { requestId: "old", snapshot: {
      prepared: { contextWindow: 1000000 }, systemSections: ["system"],
      messages: [{ role: "user", content: "中".repeat(12000) }],
    } });
    const journal = [request,
      event(1, "surface/replaced", { compactionId: "compact" }, { kind: "replace", start: 0, end: 1, sourceEventSeqs: [0], node: { kind: "user", messageId: "summary", content: "精简摘要" } }),
      event(2, "compaction/end", { compactionId: "compact" }),
    ];
    const before = baseSnapshot({ usage: { ...baseSnapshot().usage, totalTokens: 500000 } });
    const after = baseSnapshot({ ...before, throughJournalSeq: 2,
      messages: [{ kind: "user", messageId: "summary", content: "精简摘要" }],
      activity: { ...before.activity, compactionCount: 1, lastCompactionSummary: "精简摘要" },
    });
    const estimated = projectContextState(after, journal);
    expect(estimated.basis).toBe("next-request");
    expect(estimated.requestId).toBeUndefined();
    expect(estimated.totalEstimatedTokens).toBeLessThan(projectContextState(before, [request]).totalEstimatedTokens);
    expect(estimated.entries.filter(e => e.kind === "summarizedConversation")).toHaveLength(1);
    expect(estimated.buckets.find(b => b.key === "conversation")?.tokens).toBe(0);
    expect(projectContextSnapshot(after, journal).cumulativeTokens).toBe(500000);
    const next = event(3, "request/context", { requestId: "new", snapshot: { prepared: { contextWindow: 1000000 }, systemSections: ["system"], messages: [{ role: "user", content: "精简摘要" }] } });
    const actual = projectContextState(after, [...journal, next]);
    expect(actual.basis).toBe("last-request");
    expect(actual.requestId).toBe("new");
    expect(actual.totalEstimatedTokens).toBe(estimated.totalEstimatedTokens);
    expect(actual.entries.filter(e => e.kind === "summarizedConversation")).toHaveLength(1);
    expect(projectContextState({ ...after, activity: { ...after.activity, activeTurnId: "running" } }, [...journal, next]).basis).toBe("current-request");
  });

  it("projects the model context window from request facts and maps legacy sessions to zero", () => {
    const snapshot = baseSnapshot({ throughJournalSeq: 1, usage: { ...baseSnapshot().usage, totalTokens: 250_000 } });
    const journal = [
      event(0, "request/header", { requestId: "request-1", turnId: "turn-1", stepId: "step-1", contextWindow: 1_000_000 }),
      event(1, "request/context", { requestId: "request-1", turnId: "turn-1", stepId: "step-1", snapshot: { prepared: { contextWindow: 1_000_000 }, messages: [] } }),
    ];
    expect(projectContextSnapshot(snapshot, journal).maxTokens).toBe(1_000_000);
    expect(projectContextSnapshot(snapshot).maxTokens).toBe(0);
  });

  it("projects one activity per real request, keeping retry attempts independent", () => {
    const journal = [
      eventAt(0, "turn/start", { turnId: "turn-1", agentRunId: "run-1" }, "2026-08-23T00:00:00.000Z"),
      eventAt(1, "step/start", { turnId: "turn-1", stepId: "step-1", agentRunId: "run-1" }, "2026-08-23T00:00:00.100Z"),
      eventAt(2, "request/header", { requestId: "request-1", turnId: "turn-1", stepId: "step-1", routeId: "deepseek", model: "deepseek-chat", attempt: 1 }, "2026-08-23T00:00:00.200Z"),
      eventAt(3, "request/context", { requestId: "request-1", turnId: "turn-1", stepId: "step-1", snapshot: { prepared: { route: "deepseek", model: "deepseek-chat" } } }, "2026-08-23T00:00:00.300Z"),
      eventAt(4, "llm/retry", { requestId: "request-1", retryId: "retry-1", attempt: 1, nextAttempt: 2 }, "2026-08-23T00:00:00.400Z"),
      eventAt(5, "llm/retry-started", { requestId: "request-1", retryId: "retry-1", attempt: 2 }, "2026-08-23T00:00:00.500Z"),
      eventAt(6, "request/header", { requestId: "request-2", turnId: "turn-1", stepId: "step-1", routeId: "deepseek", model: "deepseek-chat", attempt: 2 }, "2026-08-23T00:00:00.600Z"),
      eventAt(7, "request/context", { requestId: "request-2", turnId: "turn-1", stepId: "step-1", snapshot: { prepared: { route: "deepseek", model: "deepseek-chat" } } }, "2026-08-23T00:00:00.700Z"),
      eventAt(8, "assistant/message", { messageId: "assistant-1", requestId: "request-2", finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10, reasoningTokens: 3, cost: 0.2, costCurrency: "USD", source: "provider-reported" } }, "2026-08-23T00:00:01.000Z"),
      eventAt(9, "step/end", { turnId: "turn-1", stepId: "step-1", reason: "completed", usage: { inputTokens: 20, outputTokens: 10, reasoningTokens: 3, cost: 0.2, costCurrency: "USD", source: "provider-reported" } }, "2026-08-23T00:00:01.100Z"),
      eventAt(10, "tool/call", { callId: "call-1", name: "read_file", agentRunId: "run-1", turnId: "turn-1", stepId: "step-1" }, "2026-08-23T00:00:01.200Z"),
      eventAt(11, "tool/result", { callId: "call-1", name: "read_file", status: "completed" }, "2026-08-23T00:00:01.500Z"),
    ];
    const snapshot = baseSnapshot({ throughJournalSeq: 11 });

    const result = projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", page: 1 });
    const requests = result.rows.filter((row) => row.kind === "llm_request");
    const tool = result.rows.find((row) => row.kind === "tool_invocation");

    expect(requests).toHaveLength(2);
    expect(requests.find((row) => row.requestId === "request-1")).toMatchObject({ status: "error", retryId: "retry-1", costUsd: null, costBasis: "unavailable" });
    expect(requests.find((row) => row.requestId === "request-2")).toMatchObject({ status: "success", attempt: 2, retryOfRequestId: "request-1", modelKey: "deepseek:deepseek-chat", tokens: { reasoningTokens: 3, totalTokens: 30 }, costUsd: 0.2, costBasis: "estimated", historicalUnverified: true });
    expect(tool).toMatchObject({ status: "success", callId: "call-1", durationMs: 300, costUsd: null, costBasis: "unavailable" });
    expect(result.summary).toMatchObject({ activityCount: 3, requestCount: 2, toolCount: 1, successCount: 2, errorCount: 1 });
    expect(projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", page: 1 }).rows).toEqual(result.rows);
    expect(projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", status: "success", page: 1 }).rows.every((row) => row.status === "success")).toBe(true);
  });
});

const TIME = "2026-08-23T00:00:00.000Z";

function baseSnapshot(patch: Partial<RuntimeV2SessionSnapshot> = {}): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot",
    schemaVersion: 1,
    sessionId: "session-1",
    createdAt: TIME,
    updatedAt: TIME,
    workspaceRoot: "/workspace",
    throughJournalSeq: -1,
    accessState: "read-write",
    metadata: { title: "Session", pinned: false, archived: false },
    messages: [],
    tools: [],
    pendingInbox: [],
    todos: [],
    delegations: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null },
    lineage: null,
    ...patch,
  };
}

function event(seq: number, type: string, data: RuntimeV2JsonValue, surface: SessionEventEnvelopeV1["surface"] = null): SessionEventEnvelopeV1 {
  return eventAt(seq, type, data, TIME, surface);
}

function eventAt(seq: number, type: string, data: RuntimeV2JsonValue, time: string, surface: SessionEventEnvelopeV1["surface"] = null): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time, source: { ownerPluginId: "@actspace/core" }, data, surface, provenance: { sourceEventSeqs: surface?.kind === "replace" ? surface.sourceEventSeqs : [], contributorIds: [], runtimeSelectionSeq: null } };
}

function append(kind: "user" | "assistant", messageId: string, content: RuntimeV2JsonValue): SessionEventEnvelopeV1["surface"] {
  return { kind: "append", node: { kind, messageId, content } };
}

function appendTool(messageId: string, callId: string): SessionEventEnvelopeV1["surface"] {
  return { kind: "append", node: { kind: "tool-result", messageId, callId, content: [{ type: "text", text: "done" }], isError: false } };
}


describe("live subagent projection", () => {
  it("exposes child identity before the parent tool finishes", () => {
    const journal = [event(1, "tool/call", { callId: "call", name: "explore", args: { task: "Inspect UI" } }), event(2, "delegation/requested", { invocationId: "inv", parentCallId: "call", childSessionId: "child", presetId: "actspace.explore" })];
    expect(projectSubagentList(baseSnapshot({}), journal)).toEqual([expect.objectContaining({ kind: "agent", status: "running", description: "Inspect UI", transcriptRef: expect.objectContaining({ runId: "child" }) })]);
  });
  it("projects live text and thinking separately and removes chunks once the message is committed", () => {
    const journal = [event(1, "assistant/chunk", { messageId: "m", kind: "assistant-delta", content: "Hello" }), event(2, "assistant/chunk", { messageId: "m", kind: "reasoning-delta", content: "Thinking" }), event(3, "assistant/chunk", { messageId: "m", kind: "tool-call-delta", content: '{"path":', callId: "c" })];
    const live = projectSubagentTranscript(baseSnapshot({}), journal);
    expect(live).toEqual(expect.arrayContaining([expect.objectContaining({ type: "assistant_message", payload: { content: "Hello" } }), expect.objectContaining({ type: "thinking", payload: { content: "Thinking" } })]));
    expect(JSON.stringify(live)).not.toContain('path');
    const done = projectSubagentTranscript(baseSnapshot({}), [...journal, event(4, "assistant/message", { messageId: "m" })]);
    expect(done.some((item) => item.type === "thinking" || item.type === "assistant_message")).toBe(false);
  });
});

it("keeps unknown, free and original currencies separate across full-query pagination", () => {
  const costs = [
    { cost: 0, costCurrency: "USD", source: "provider-reported" },
    { cost: 0, costCurrency: "USD", costProvenance: { version: 1, basis: "estimated", reason: null, pricingSnapshot: null } },
    { cost: 2, costCurrency: "CNY", costProvenance: { version: 1, basis: "estimated", reason: null, pricingSnapshot: null } },
  ];
  const journal = costs.flatMap((usage, index) => [event(index * 2, "request/header", { requestId: `r${index}`, turnId: "t", stepId: `s${index}`, model: `m${index}`, routeId: "deepseek" }), event(index * 2 + 1, "assistant/message", { requestId: `r${index}`, finishReason: "stop", usage: { ...usage, inputTokens: 10, outputTokens: 5 } } as unknown as RuntimeV2JsonValue)]);
  const snapshot = baseSnapshot({ throughJournalSeq: 6 });
  const result = projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", page: 1 });
  expect(result.costSummary).toEqual({ amountsByCurrency: { USD: 0, CNY: 2 }, knownCostRequestCount: 2, unknownCostRequestCount: 1, unverifiedHistoricalRequestCount: 0 });
  expect(result.summary.costUsd).toBe(0);
  expect(result.aggregates?.models).toHaveLength(3);
  const filtered = projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", page: 1, search: "m2", status: "success" });
  expect(filtered.rowsPage.totalRows).toBe(1);
  expect(filtered.costSummary?.amountsByCurrency).toEqual({ CNY: 2 });
});

it("reuses immutable journal projections for 10,000 requests and invalidates on revision", () => {
  const journal = Array.from({ length: 10_000 }, (_, i) => [event(i * 2, "request/header", { requestId: `perf-r${i}`, turnId: "t", stepId: `perf-s${i}`, model: i % 2 ? "m-a" : "m-b", routeId: "deepseek" }), event(i * 2 + 1, "assistant/message", { requestId: `perf-r${i}`, finishReason: "stop", usage: { inputTokens: 10, outputTokens: 5 } })]).flat();
  const snapshot = baseSnapshot({ throughJournalSeq: 20_000 });
  const start = performance.now();
  const first = projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", page: 1 });
  const coldMs = performance.now() - start;
  const warmStart = performance.now();
  const second = projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", page: 2 });
  const warmMs = performance.now() - warmStart;
  expect(first.rowsPage.totalRows).toBe(10_000);
  expect(second.summary).toEqual(first.summary);
  expect(second.rows).toHaveLength(10);
  const filtered = projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", page: 2, search: "m-a" });
  expect(filtered.rowsPage.totalRows).toBe(5_000);
  expect(filtered.summary.totalTokens).toBe(75_000);
  const changed = [...journal, event(20_000, "request/header", { requestId: "new", turnId: "t", stepId: "new", model: "m-a" }), event(20_001, "assistant/message", { requestId: "new", finishReason: "stop", usage: { inputTokens: 2, outputTokens: 1 } })];
  const updated = projectUsageActivity([{ snapshot: baseSnapshot({ throughJournalSeq: 20_001 }), journal: changed }], { scope: "global", range: "total", page: 1 });
  expect(updated.rowsPage.totalRows).toBe(10_001);
  expect(updated.summary.totalTokens).toBe(150_003);
  console.info(JSON.stringify({ usageBenchmark: { requests: 10_000, coldMs, warmMs, heapMiB: process.memoryUsage().heapUsed / 1024 / 1024 } }));
});

it("labels tool-call requests as successful and keeps tab counts independent of log filters", () => {
  const journal = [
    event(0, "request/header", { requestId: "r", turnId: "t", stepId: "s", model: "deepseek-v4-flash", routeId: "deepseek" }),
    event(1, "assistant/message", { requestId: "r", finishReason: "tool-calls", usage: { inputTokens: 10, outputTokens: 2 } }),
    event(2, "tool/call", { callId: "c", name: "Bash", turnId: "t", stepId: "s" }),
    event(3, "tool/result", { callId: "c", name: "Bash", status: "completed" }),
  ];
  const snapshot = baseSnapshot({ throughJournalSeq: 3, metadata: { title: "会话标题", pinned: false, archived: false } });
  const result = projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", page: 1 });
  expect(result.rows.find((row) => row.kind === "llm_request")?.status).toBe("success");
  expect(result.rows.every((row) => row.sessionTitle === "会话标题")).toBe(true);
  expect(result.tabCounts).toEqual({ requests: 2, providers: 1, models: 1, tools: 1 });
  const filtered = projectUsageActivity([{ snapshot, journal }], { scope: "global", range: "total", page: 1, search: "Bash", status: "success" });
  expect(filtered.rows).toHaveLength(1);
  expect(filtered.rows[0].kind).toBe("tool_invocation");
  expect(filtered.tabCounts).toEqual(result.tabCounts);
});

it("uses step usage when the assistant message has none without counting the request twice", () => {
  const journal = [
    event(0, "request/header", { requestId: "r", turnId: "t", stepId: "s", model: "m" }),
    event(1, "assistant/message", { requestId: "r", finishReason: "tool-calls" }),
    event(2, "step/end", { stepId: "s", finishReason: "tool-calls", usage: { inputTokens: 10, outputTokens: 2, cost: 0.001, costCurrency: "USD", costProvenance: { version: 1, basis: "estimated", reason: null, pricingSnapshot: null } } }),
  ];
  const result = projectUsageActivity([{ snapshot: baseSnapshot({ throughJournalSeq: 2 }), journal }], { scope: "global", range: "total", page: 1 });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({ status: "success", costAmount: 0.001, tokens: { totalTokens: 12 } });
  expect(result.costSummary?.knownCostRequestCount).toBe(1);
});
