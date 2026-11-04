import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { ForkBoundaryError, resolveForkBoundary } from "../fork-boundary.js";

// S4 第 1 步：fork 的边界是「包含这次调用的那一步」之前最后一个 step/end；是本轮第一步时取它的 step/start 前一个事件。
const registry = createCoreCodecRegistry();

class Journal {
  readonly events: SessionEventEnvelopeV1[] = [];
  add(type: string, data: Record<string, unknown>): number {
    const seq = this.events.length;
    this.events.push({ recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: "2026-11-04T00:00:00.000Z", source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as SessionEventEnvelopeV1);
    return seq;
  }
  turn(turnId: string, mode = "agent"): number { return this.add("turn/start", { turnId, agentRunId: "run", mode }); }
  stepStart(turnId: string, stepId: string): number { return this.add("step/start", { turnId, stepId, agentRunId: "run" }); }
  stepEnd(turnId: string, stepId: string): number { return this.add("step/end", { turnId, stepId, agentRunId: "run", status: "completed" }); }
  call(turnId: string, stepId: string, callId: string, name = "read_file"): number { return this.add("tool/call", { turnId, stepId, agentRunId: "run", callId, name, args: {} }); }
  result(callId: string, name = "read_file"): number { return this.add("tool/result", { callId, name, status: "completed", agentRunId: "run" }); }
  /** A whole step that calls one tool and gets its result. */
  step(turnId: string, stepId: string, callId: string): number {
    this.stepStart(turnId, stepId); this.call(turnId, stepId, callId); this.result(callId); return this.stepEnd(turnId, stepId);
  }
}

describe("resolveForkBoundary", () => {
  it("cuts before the first step at the event right before its step/start", () => {
    const j = new Journal();
    j.turn("t1"); j.step("t1", "s1", "c1"); j.add("turn/end", { turnId: "t1", reason: "completed" });
    j.turn("t2", "plan");
    const beforeStep = j.add("user/message", { messageId: "u2", agentRunId: "run" });
    j.stepStart("t2", "s1"); j.call("t2", "s1", "fork");
    expect(resolveForkBoundary(j.events, registry, "fork")).toEqual({ boundarySeq: beforeStep, turnId: "t2", mode: "plan" });
  });

  it("cuts at the step/end of the last completed step when the call is in the third step", () => {
    const j = new Journal();
    j.turn("t1"); j.add("user/message", { messageId: "u1", agentRunId: "run" });
    j.step("t1", "s1", "c1");
    const second = j.step("t1", "s2", "c2");
    // Inbox claims and compaction land between steps; they belong to the next step.
    j.add("assistant/message", { messageId: "a-between", agentRunId: "run" });
    j.stepStart("t1", "s3"); j.call("t1", "s3", "fork");
    expect(resolveForkBoundary(j.events, registry, "fork")).toEqual({ boundarySeq: second, turnId: "t1", mode: "agent" });
  });

  it("ignores the other calls of the same step: they come after the boundary", () => {
    const j = new Journal();
    j.turn("t1");
    const first = j.step("t1", "s1", "c1");
    j.stepStart("t1", "s2"); j.call("t1", "s2", "parallel-read"); j.call("t1", "s2", "fork", "agent_fork"); j.call("t1", "s2", "parallel-bash", "bash");
    j.result("parallel-read");
    expect(resolveForkBoundary(j.events, registry, "fork").boundarySeq).toBe(first);
  });

  it("forks from the start of the turn when no step has completed yet", () => {
    const j = new Journal();
    const turn = j.turn("t1");
    j.stepStart("t1", "s1"); j.call("t1", "s1", "fork", "agent_fork");
    expect(resolveForkBoundary(j.events, registry, "fork")).toEqual({ boundarySeq: turn, turnId: "t1", mode: "agent" });
  });

  it("rejects an unknown call and a prefix with a tool call that never got its result", () => {
    const j = new Journal();
    j.turn("t1");
    j.stepStart("t1", "s1"); j.call("t1", "s1", "dangling"); j.stepEnd("t1", "s1");
    j.stepStart("t1", "s2"); j.call("t1", "s2", "fork", "agent_fork");
    expect(() => resolveForkBoundary(j.events, registry, "missing")).toThrow(ForkBoundaryError);
    expect(() => resolveForkBoundary(j.events, registry, "fork")).toThrow(expect.objectContaining({ code: "FORK_BOUNDARY_UNBALANCED" }));
  });
});
