import { describe, expect, it } from "vitest";
import type { RuntimeV2EventWindow, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectTrajectoryWindow } from "../sessions/trajectory.js";

function envelope(seq: number, type: string, data: SessionEventEnvelopeV1["data"]): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: "2026-10-14T00:00:00.000Z", source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}
const window = (events: SessionEventEnvelopeV1[]): RuntimeV2EventWindow => ({ events, fromSeq: 0, throughJournalSeq: events.at(-1)!.seq, beforeSeq: null, turnOffset: 0, requestOffset: 0 });

describe("trajectory projection", () => {
  it("converts each event object once across windows", () => {
    const start = envelope(0, "turn/start", { turnId: "t" });
    const chunk = envelope(1, "assistant/chunk", { messageId: "m", delta: "a" });
    const first = projectTrajectoryWindow("s", window([start]));
    const second = projectTrajectoryWindow("s", window([start, chunk]));
    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.nodes[1]).toMatchObject({ eventSeq: 1, eventType: "assistant/chunk", state: "updated", data: { messageId: "m", delta: "a" } });
    // The node keeps its own copy of the event data.
    expect(second.nodes[1]!.data).not.toBe(chunk.data);
    expect(projectTrajectoryWindow("other", window([start])).nodes[0]).toMatchObject({ sessionId: "other", key: "other:0" });
  });
});
