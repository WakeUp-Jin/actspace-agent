import { describe, expect, it } from "vitest";
import { findRevealRecord, type TrajectoryRecord } from "../trajectory";

function record(id: string, patch: Partial<TrajectoryRecord>): TrajectoryRecord {
  return {
    id, kind: "assistant", state: "completed", eventType: "test", turnId: "t1", turnNumber: 1, stepId: null, stepNumber: null,
    callId: null, requestId: null, messageId: null, summary: id, preview: "", raw: null, sourceSequences: [1], startedAt: null,
    completedAt: null, durationMs: null, usage: null, result: null, isError: false, partial: false, visible: true, ...patch,
  };
}

const records = [
  record("u1", { kind: "user", messageId: "m1" }),
  record("req", { kind: "request", callId: "c1", requestOnly: true }),
  record("tool1", { kind: "tool", callId: "c1" }),
  record("a1", { kind: "assistant", messageId: "m2" }),
  record("compact", { kind: "compaction", compaction: { compactionId: "k1", trigger: "auto", messageCount: 4, beforeTokens: null, afterTokens: null } }),
  record("u2", { kind: "user", messageId: "m3" }),
  record("tool2", { kind: "tool", callId: "c2" }),
  record("hidden", { kind: "assistant", messageId: "m4", visible: false }),
];

describe("findRevealRecord", () => {
  it("matches a call id only on tool records", () => {
    expect(findRevealRecord(records, { callId: "c1" })?.id).toBe("tool1");
  });

  it("matches a message id", () => {
    expect(findRevealRecord(records, { messageId: "m2" })?.id).toBe("a1");
  });

  it("matches a compaction id only on compaction records", () => {
    expect(findRevealRecord(records, { compactionId: "k1" })?.id).toBe("compact");
    expect(findRevealRecord(records, { compactionId: "missing" })).toBeNull();
  });

  it("finds the latest record of a kind; tool call and result both map to tool", () => {
    expect(findRevealRecord(records, { latest: "user" })?.id).toBe("u2");
    expect(findRevealRecord(records, { latest: "assistant" })?.id).toBe("a1");
    expect(findRevealRecord(records, { latest: "tool-call" })?.id).toBe("tool2");
    expect(findRevealRecord(records, { latest: "tool-result" })?.id).toBe("tool2");
  });

  it("falls back to the latest visible record", () => {
    expect(findRevealRecord(records, { latest: null })?.id).toBe("tool2");
  });

  it("returns null when nothing matches or the record is hidden", () => {
    expect(findRevealRecord(records, { callId: "missing" })).toBeNull();
    expect(findRevealRecord(records, { messageId: "m4" })).toBeNull();
  });
});
