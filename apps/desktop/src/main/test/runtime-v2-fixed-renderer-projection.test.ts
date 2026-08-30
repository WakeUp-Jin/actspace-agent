import { describe, expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { RuntimeV2JsonValue, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import { projectContextState, projectFixedRendererEvents } from "../runtime-v2/fixed-renderer-projection";

describe("fixed renderer v2 projection", () => {
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

    const state = projectContextState(baseSnapshot(), journal);

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
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: TIME, source: { ownerPluginId: "@actspace/core" }, data, surface, provenance: { sourceEventSeqs: surface?.kind === "replace" ? surface.sourceEventSeqs : [], contributorIds: [], runtimeSelectionSeq: null } };
}

function append(kind: "user" | "assistant", messageId: string, content: RuntimeV2JsonValue): SessionEventEnvelopeV1["surface"] {
  return { kind: "append", node: { kind, messageId, content } };
}

function appendTool(messageId: string, callId: string): SessionEventEnvelopeV1["surface"] {
  return { kind: "append", node: { kind: "tool-result", messageId, callId, content: [{ type: "text", text: "done" }], isError: false } };
}
