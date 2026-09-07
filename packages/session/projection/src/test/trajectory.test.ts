import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, SessionJournal, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { applyTrajectory, projectTrajectory } from "../trajectory.js";

const source = { ownerPluginId: "@actspace/core" } as const;

function events(): SessionEventEnvelopeV1[] {
  const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-30T00:00:00.000Z" });
  journal.append({ type: "turn/start", eventVersion: 1, source, data: { turnId: "turn-1" }, surface: null });
  journal.append({ type: "step/start", eventVersion: 1, source, data: { turnId: "turn-1", stepId: "step-1" }, surface: null });
  journal.append({ type: "tool/call", eventVersion: 1, source, data: { callId: "call-1", name: "read_file" }, surface: null });
  journal.append({ type: "tool/result", eventVersion: 1, source, data: { callId: "call-1", name: "read_file", status: "completed" }, surface: null });
  journal.append({ type: "step/end", eventVersion: 1, source, data: { turnId: "turn-1", stepId: "step-1", status: "completed" }, surface: null });
  journal.append({ type: "turn/end", eventVersion: 1, source, data: { turnId: "turn-1", status: "completed" }, surface: null });
  return [...journal.events];
}

describe("Trajectory projection", () => {
  it("has stable event keys and replay/apply parity", () => {
    const journalEvents = events();
    const full = projectTrajectory("session-1", journalEvents);
    let incremental = projectTrajectory("session-1", []);
    for (const event of journalEvents) incremental = applyTrajectory(incremental, event);
    expect(incremental).toEqual(full);
    expect(full.nodes.map((node) => node.key)).toEqual(["session-1:0", "session-1:1", "session-1:2", "session-1:3", "session-1:4", "session-1:5"]);
    expect(full.nodes[2]).toMatchObject({ kind: "tool", callId: "call-1" });
  });
});

describe("Trajectory history windows", () => {
  it("pages complete turns, preserves absolute sequences and retains an expanded window on refresh", async () => {
    const { projectTrajectoryWindow } = await import('../trajectory.js');
    const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
    for (let turn = 0; turn < 45; turn++) {
      const turnId = `turn-${turn}`;
      journal.append({ type: 'turn/start', eventVersion: 1, source, data: { turnId }, surface: null });
      journal.append({ type: 'user/message', eventVersion: 1, source, data: { messageId: `u-${turn}`, turnId }, surface: { kind: 'append', node: { kind: 'user', messageId: `u-${turn}`, content: `Question ${turn}` } } });
      journal.append({ type: 'turn/end', eventVersion: 1, source, data: { turnId, status: 'completed' }, surface: null });
    }
    const first = projectTrajectoryWindow('session-1', journal.events);
    expect(first.history).toEqual({ fromSeq: 75, previousFromSeq: 15, turnOffset: 25, requestOffset: 0 });
    expect(first.nodes[1]!.surface).toMatchObject({ node: { content: 'Question 25' } });
    expect(first.nodes[0]!.eventSeq).toBe(75);
    const earlier = projectTrajectoryWindow('session-1', journal.events, first.history!.previousFromSeq!);
    expect(earlier.history).toEqual({ fromSeq: 15, previousFromSeq: 0, turnOffset: 5, requestOffset: 0 });
    const full = projectTrajectoryWindow('session-1', journal.events, 0);
    expect(full.history?.previousFromSeq).toBeNull();
    expect(full.nodes).toEqual(projectTrajectory('session-1', journal.events).nodes);
    expect(() => projectTrajectoryWindow('session-1', journal.events, -1)).toThrow('cursor');
    expect(() => projectTrajectoryWindow('session-1', journal.events, 1000)).toThrow('cursor');
  });
});
