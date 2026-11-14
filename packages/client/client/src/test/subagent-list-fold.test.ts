import { describe, expect, it } from "vitest";
import { foldSubagentTree, type SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { subagentChildrenWithoutModel } from "../sessions/chat.js";
import {
  createSubagentListState,
  projectSubagentItems,
  reduceSubagentList,
  subagentListChildrenWithoutModel,
  subagentListItems,
} from "../sessions/subagent-list.js";

// 子 Agent 面板改成按会话常驻的增量折叠后，任意事件前缀上「逐条折叠」和「整份重算」的结果必须一致。
// 用固定种子的伪随机序列覆盖新旧两种记录方式、消息、续派和乱序的 legacy 调用。

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomSession(seed: number, length: number): SessionEventEnvelopeV1[] {
  const next = rng(seed);
  const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)]!;
  const events: SessionEventEnvelopeV1[] = [];
  const agents = ["sa-1", "sa-2", "sa-3", "child-a", "child-b"];
  const kinds = ["local", "fork", "codex", "claude-code"] as const;
  for (let seq = 0; seq < length; seq++) {
    const agentId = pick(agents),
      time = `2026-11-07T00:00:${String(seq % 60).padStart(2, "0")}.000Z`;
    const activationId = `act-${agentId}-${Math.floor(next() * 3)}`;
    const roll = next();
    let type: string, data: Record<string, unknown>;
    if (roll < 0.12) {
      type = "tool/call";
      data = {
        callId: `call-${agentId}`,
        name: pick(["agent", "explore", "read_file"]),
        args: next() < 0.5 ? { description: `desc ${seq}` } : { task: `task ${seq}\nmore` },
      };
    } else if (roll < 0.24) {
      type = "subagent/spawned";
      data = {
        agentId,
        kind: pick(kinds),
        preset: pick(["general", "explore"]),
        description: next() < 0.8 ? `Agent ${agentId}` : "",
        transcriptPath: `/t/${agentId}.md`,
        callId: `call-${agentId}`,
        createdAt: time,
        ...(next() < 0.3 ? { inheritedThroughSeq: seq } : {}),
      };
    } else if (roll < 0.4) {
      type = "subagent/activation";
      data = {
        op: "start",
        agentId,
        activationId,
        trigger: pick(["spawn", "message"]),
        callId: `call-${agentId}`,
        background: next() < 0.5,
        startedAt: time,
        ...(next() < 0.5 ? { model: `model-${seq % 3}` } : {}),
      };
    } else if (roll < 0.56) {
      type = "subagent/activation";
      data = {
        op: "settle",
        agentId,
        activationId,
        status: pick(["completed", "interrupted", "failed", "max_steps", "lost"]),
        summary: `s${seq}`,
        result: `r${seq}`,
        delivery: pick(["returned", "notified"]),
        endedAt: time,
      };
    } else if (roll < 0.66) {
      type = "agent/inbox/spliced";
      data = {
        source: pick(["agent_message", "subagent_notification"]),
        operation: pick(["enqueue", "claim", "dequeue"]),
        senderId: agentId,
        messageId: `m-${Math.floor(next() * 4)}`,
        content: `<agent_message from="${agentId}" relation="child">\nnote ${seq}\n</agent_message>`,
      };
    } else if (roll < 0.76) {
      type = "delegation/requested";
      data = {
        invocationId: `inv-${agentId}`,
        parentCallId: `call-${agentId}`,
        childSessionId: agentId,
        presetId: pick(["actspace.explore", "actspace.agent"]),
      };
    } else if (roll < 0.86) {
      type = "delegation/completed";
      data = {
        invocationId: `inv-${agentId}`,
        childSessionId: agentId,
        presetId: "actspace.agent",
        status: pick(["completed", "aborted", "failed"]),
        ...(next() < 0.5 ? { model: `model-${seq % 2}` } : {}),
      };
    } else {
      type = pick(["user/message", "tool/result", "turn/end"]);
      data = { messageId: `u${seq}`, callId: `call-${agentId}`, status: "completed" };
    }
    events.push({
      seq,
      type,
      time,
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data,
      surface: null,
      criticality: "optional",
    } as unknown as SessionEventEnvelopeV1);
  }
  return events;
}

/** 改成增量折叠前的两遍实现，作为语义参照：先折叠树，再整份扫 legacy 调用参数和最新消息。 */
function referenceLegacyArgsAndMessages(journal: readonly SessionEventEnvelopeV1[]) {
  const tree = foldSubagentTree(journal);
  const legacyCalls = new Set(
    Object.values(tree.agents)
      .filter((view) => view.legacy)
      .map((view) => view.callId),
  );
  const callArgs = new Map<string, unknown>();
  const lastMessages = new Map<string, { messageId: string; at: string }>();
  for (const event of journal) {
    const data = event.data as Record<string, unknown>;
    if (event.type === "tool/call" && legacyCalls.size) {
      if (legacyCalls.has(String(data.callId))) callArgs.set(String(data.callId), data.args);
    } else if (
      event.type === "agent/inbox/spliced" &&
      data.source === "agent_message" &&
      (data.operation === "enqueue" || data.operation === "claim")
    ) {
      const senderId = String(data.senderId),
        messageId = String(data.messageId);
      if (lastMessages.get(senderId)?.messageId !== messageId)
        lastMessages.set(senderId, { messageId, at: event.time });
    }
  }
  return { tree, callArgs, lastMessages };
}

describe("incremental subagent list fold", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "matches the whole-journal fold and the two-pass reference on every prefix (seed %d)",
    (seed) => {
      const events = randomSession(seed, 160);
      let state = createSubagentListState();
      for (let index = 0; index < events.length; index++) {
        state = reduceSubagentList(state, events[index]!);
        const prefix = events.slice(0, index + 1);
        expect(subagentListItems(state, new Map([["sa-1", "req-model"]]))).toEqual(
          projectSubagentItems(prefix, new Map([["sa-1", "req-model"]])),
        );
        expect(subagentListChildrenWithoutModel(state)).toEqual(subagentChildrenWithoutModel(prefix));
        const reference = referenceLegacyArgsAndMessages(prefix);
        expect(state.tree).toEqual(reference.tree);
        expect(new Map(state.legacyCallArgs)).toEqual(reference.callArgs);
        expect(
          new Map(
            [...state.lastMessages].map(([id, message]) => [id, { messageId: message.messageId, at: message.at }]),
          ),
        ).toEqual(reference.lastMessages);
      }
    },
  );

  it("returns the same state object for unrelated events", () => {
    const state = createSubagentListState();
    expect(reduceSubagentList(state, { type: "user/message", time: "t", data: { messageId: "u" } })).toBe(state);
    expect(
      reduceSubagentList(state, { type: "tool/result", time: "t", data: { callId: "c", status: "completed" } }),
    ).toBe(state);
  });

  it("keeps the legacy description whether the call precedes or follows the delegation record", () => {
    const call = {
      type: "tool/call",
      time: "t",
      data: { callId: "call", name: "explore", args: { task: "Inspect UI" } },
    };
    const requested = {
      type: "delegation/requested",
      time: "t",
      data: { invocationId: "inv", parentCallId: "call", childSessionId: "child", presetId: "actspace.explore" },
    };
    for (const order of [
      [call, requested],
      [requested, call],
    ]) {
      let state = createSubagentListState();
      for (const event of order) state = reduceSubagentList(state, event);
      expect(subagentListItems(state)).toEqual([
        expect.objectContaining({ agentId: "child", legacy: true, description: "Inspect UI" }),
      ]);
    }
  });

  it("does not grow with ordinary tool calls", () => {
    let state = createSubagentListState();
    for (let index = 0; index < 1_000; index++)
      state = reduceSubagentList(state, {
        type: "tool/call",
        time: "t",
        data: { callId: `c${index}`, name: "read_file", args: { path: "a" } },
      });
    expect(state.recentCallArgs.size).toBeLessThanOrEqual(64);
    expect(state.legacyCallArgs.size).toBe(0);
  });
});
