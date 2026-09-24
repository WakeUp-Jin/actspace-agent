import type { RuntimeV2RunTurnResponse } from "@actspace/shared/runtime-v2";
import { describe, expect, it } from "vitest";
import { projectCliArtifactResult } from "../runtime-v2/run";

describe("Runtime v2 Host parity", () => {
  it("preserves the exact Desktop Profile turn and Session DTO in CLI artifacts", () => {
    const desktop = response();
    const cli = projectCliArtifactResult(desktop, {
      workspace: "/workspace",
      startedAt: "2026-08-23T00:00:00.000Z",
      endedAt: "2026-08-23T00:00:01.000Z",
      persistent: true,
      interrupted: false,
    });

    expect({
      sessionId: cli.sessionId,
      agentRunId: cli.agentRunId,
      turnId: cli.turnId,
      reason: cli.reason,
      steps: cli.steps,
      finalText: cli.finalText,
      snapshot: cli.snapshot,
    }).toEqual(desktop);
    expect(cli.totalUsage).toEqual(desktop.snapshot.usage);
    expect(cli.permissionMode).toBe("full-access");
    expect(cli.snapshot?.tools[0]).toMatchObject({ callId: "call-1", state: "completed" });
    expect(cli.snapshot?.todos[0]).toMatchObject({ todoId: "todo-1", state: "pending" });
    expect(cli.snapshot?.delegations[0]).toMatchObject({ invocationId: "child-1", state: "completed" });
  });
});

function response(): RuntimeV2RunTurnResponse {
  return Object.freeze({
    sessionId: "session-1",
    agentRunId: "run-1",
    turnId: "turn-1",
    reason: "completed",
    steps: 1,
    finalText: "done",
    snapshot: Object.freeze({
      kind: "session-snapshot",
      schemaVersion: 1,
      sessionId: "session-1",
      throughJournalSeq: 12,
      permissionMode: "full-access",
      accessState: "read-write",
      metadata: { title: "Parity", pinned: false, archived: false },
      messages: [{ kind: "user", messageId: "message-1", content: "run" }, { kind: "assistant", messageId: "message-2", content: "done" }],
      tools: [{ kind: "tool", schemaVersion: 1, sessionId: "session-1", agentRunId: "run-1", turnId: "turn-1", stepId: "step-1", pluginId: "actspace.core-tools", name: "read_file", callId: "call-1", state: "completed", phase: null, startedAt: null, finishedAt: null, durationMs: null, argsSummary: { text: "{}", fields: [] }, modelOutput: [{ type: "text", text: "ok" }], summary: "Read", detail: [], artifacts: [], failure: null, renderer: null }],
      pendingInbox: [],
      todos: [{ todoId: "todo-1", revision: 1, text: "Verify", state: "pending" }],
      delegations: [{ invocationId: "child-1", childSessionId: "session-child", agentKind: "explore", state: "completed", summary: "Mapped" }],
      usage: { inputTokens: 2, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 3, costUsd: 0.001 },
      activity: { turnCount: 1, completedTurnCount: 1, stepCount: 1, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null },
      lineage: null,
    }),
  });
}
