import { describe, expect, it } from "vitest";
import { createMessageBlocks } from "../session-selectors";
import type { SessionEvent } from "../session";

function event(payload: Record<string, unknown>): SessionEvent {
  return {
    id: `evt-${String(payload.status ?? "legacy")}`,
    sessionId: "session-1",
    turnId: "turn-1",
    type: "context_compaction",
    timestamp: "2026-06-02T00:00:00.000Z",
    schemaVersion: 1,
    payload,
  };
}

describe("createMessageBlocks context compaction", () => {
  it("maps legacy context_compaction payloads as auto completed blocks", () => {
    const blocks = createMessageBlocks([
      event({
        triggerTokens: 1200,
        thresholdTokens: 1000,
        beforeCount: 10,
        afterCount: 4,
        summaryChars: 240,
        historyRefPath: "/sessions/s1/session.jsonl",
      }),
    ]);

    expect(blocks).toEqual([
      expect.objectContaining({
        kind: "context_compaction",
        status: "completed",
        trigger: "auto",
        summaryText: "Context compacted",
        reductionLabel: "6 messages removed",
      }),
    ]);
  });

  it("maps manual skipped payloads as Nothing to compact", () => {
    const blocks = createMessageBlocks([
      event({
        triggerTokens: 120,
        thresholdTokens: 1000,
        beforeCount: 1,
        afterCount: 1,
        summaryChars: 0,
        historyRefPath: "/sessions/s1/session.jsonl",
        trigger: "manual",
        status: "skipped",
        removedCount: 0,
      }),
    ]);

    expect(blocks[0]).toEqual(expect.objectContaining({
      kind: "context_compaction",
      status: "skipped",
      trigger: "manual",
      summaryText: "Nothing to compact",
    }));
  });
});
