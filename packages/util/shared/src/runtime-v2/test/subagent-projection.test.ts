import { describe, expect, it } from "vitest";
import { foldSubagentTree, lastActivationModel, listedSubagents, runningSubagentCount } from "../subagent-projection";

const spawned = (agentId: string, kind = "local", extra: Record<string, unknown> = {}) => ({
  type: "subagent/spawned",
  data: {
    agentId,
    callId: `call-${agentId}`,
    kind,
    ...(kind === "local" ? { preset: "general" } : {}),
    description: `task ${agentId}`,
    transcriptPath: `/data/sessions-v2/${agentId}/transcript.md`,
    createdAt: "2026-11-03T10:00:00.000Z",
    ...extra,
  },
});
const start = (agentId: string, activationId: string, extra: Record<string, unknown> = {}) => ({
  type: "subagent/activation",
  data: {
    op: "start",
    agentId,
    activationId,
    trigger: "spawn",
    callId: `call-${agentId}`,
    background: true,
    startedAt: "2026-11-03T10:00:01.000Z",
    ...extra,
  },
});
const settle = (agentId: string, activationId: string, status = "completed") => ({
  type: "subagent/activation",
  data: {
    op: "settle",
    agentId,
    activationId,
    status,
    summary: "done",
    delivery: "notified",
    endedAt: "2026-11-03T10:05:00.000Z",
  },
});

describe("subagent tree projection", () => {
  it("folds spawn, activations and settles into running and closed; an old continuation reads as running again", () => {
    const tree = foldSubagentTree([
      spawned("a", "local", { toolNames: ["read_file", "send_message"] }),
      start("a", "a1", { model: "m1" }),
      settle("a", "a1"),
      start("a", "a2", { trigger: "message", senderId: "main" }),
      spawned("b"),
      start("b", "b1"),
      spawned("c", "codex"),
      start("c", "c1"),
      settle("c", "c1"),
      spawned("d"),
      start("d", "d1"),
      settle("d", "d1", "interrupted"),
    ]);
    expect(tree.order).toEqual(["a", "b", "c", "d"]);
    expect(tree.agents.a).toMatchObject({
      status: "running",
      toolNames: ["read_file", "send_message"],
      activations: [
        { activationId: "a1", model: "m1", settle: { status: "completed" } },
        { activationId: "a2", trigger: "message", senderId: "main" },
      ],
    });
    expect(tree.agents.c.status).toBe("closed");
    expect(tree.agents.d.status).toBe("closed");
    expect(runningSubagentCount(tree)).toBe(2);
    expect(lastActivationModel(tree.agents.a)).toBe("m1");
  });

  it("ignores duplicate and orphan events", () => {
    const tree = foldSubagentTree([
      start("x", "x1"),
      spawned("a"),
      spawned("a", "local", { description: "again" }),
      start("a", "a1"),
      start("a", "a1"),
      settle("a", "a1"),
      settle("a", "a1", "failed"),
    ]);
    expect(tree.order).toEqual(["a"]);
    expect(tree.agents.a).toMatchObject({
      description: "task a",
      status: "closed",
      activations: [{ settle: { status: "completed" } }],
    });
  });

  it("keeps old delegation records readable but out of the model's list", () => {
    const tree = foldSubagentTree([
      {
        type: "delegation/requested",
        time: "2026-10-01T00:00:00.000Z",
        data: { invocationId: "i1", presetId: "actspace.explore", parentCallId: "call-1", childSessionId: "old" },
      },
      {
        type: "delegation/completed",
        time: "2026-10-01T00:01:00.000Z",
        data: {
          invocationId: "i1",
          childSessionId: "old",
          presetId: "actspace.explore",
          status: "completed",
          model: "m",
        },
      },
      spawned("new"),
    ]);
    expect(tree.agents.old).toMatchObject({
      legacy: true,
      preset: "explore",
      status: "closed",
      activations: [{ model: "m", settle: { status: "completed", delivery: "returned" } }],
    });
    expect(listedSubagents(tree).map((agent) => agent.agentId)).toEqual(["new"]);
  });
});
