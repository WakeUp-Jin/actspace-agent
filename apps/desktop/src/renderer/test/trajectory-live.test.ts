import { describe, expect, it } from "vitest";
import type { RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import {
  buildTrajectorySnapshot, createLiveAccumulator, deriveLayout, splitLiveChunks, streamingCells,
  type LiveAccumulator, type TrajectoryLayout,
} from "../trajectory";
import { STREAMING_FRAMES, streamingFixture, streamingLongFixture } from "../trajectory/fixtures";

const node = (eventSeq: number, eventType: string, data: Record<string, string>, callId: string | null = null): RuntimeV2TrajectoryNode => ({
  key: `s:${eventSeq}`, sessionId: "s", eventSeq, eventType, time: new Date(1_700_000_000_000 + eventSeq * 100).toISOString(),
  kind: "other", state: "observed", callId, data: { turnId: "t1", stepId: "st1", ...data },
});
const chunk = (seq: number, data: Record<string, string>) => node(seq, "assistant/chunk", { requestId: "r1", messageId: "m1", ...data });
const snap = (nodes: RuntimeV2TrajectoryNode[], fromSeq = 0): RuntimeV2TrajectorySnapshot => ({
  kind: "trajectory", schemaVersion: 1, sessionId: "s", throughJournalSeq: nodes.at(-1)?.eventSeq ?? -1, nodes,
  history: { fromSeq, previousFromSeq: null, turnOffset: 0, requestOffset: 0 },
});
const head = [node(0, "turn/start", {}), node(1, "user/message", { content: "hi" }), node(2, "step/start", {}), node(3, "request/header", { requestId: "r1" })];
const liveKeys = (nodes: RuntimeV2TrajectoryNode[]) => [...splitLiveChunks(snap(nodes)).live.keys()];

/** The view's path: settled layout cached by settledKey, live content accumulated on the side. */
function splitView() {
  let cache: { key: string; layout: TrajectoryLayout } | null = null;
  let builds = 0;
  const accumulator: LiveAccumulator = createLiveAccumulator();
  return {
    accumulator,
    get builds() { return builds; },
    frame(snapshot: RuntimeV2TrajectorySnapshot) {
      const split = splitLiveChunks(snapshot);
      if (cache?.key !== split.settledKey) {
        builds += 1;
        cache = { key: split.settledKey, layout: deriveLayout(buildTrajectorySnapshot(split.settled(), { placeholders: new Set(split.live.keys()) })) };
      }
      const layout = cache.layout;
      const live = streamingCells(new Map(layout.cells.map(cell => [cell.recordId, cell])), accumulator.update(split.live));
      return { layout, live, cells: layout.cells.map(cell => live.get(cell.recordId) ?? cell) };
    },
  };
}

describe("live chunk split", () => {
  it("keeps closed replies, ended turns and linked tool calls settled", () => {
    const streaming = [...head, chunk(4, { delta: "a" }), chunk(5, { delta: "b" })];
    expect(liveKeys(streaming)).toEqual(["m1"]);
    expect(liveKeys([...streaming, node(6, "assistant/message", { requestId: "r1", messageId: "m1", content: "ab" })])).toEqual([]);
    // A failed stream can finalize under a fresh messageId; the request still ties it to the chunks.
    expect(liveKeys([...streaming, node(6, "assistant/message", { requestId: "r1", messageId: "m9", finishReason: "failed" })])).toEqual([]);
    expect(liveKeys([...streaming, node(6, "turn/end", {})])).toEqual([]);
    const delta = chunk(6, { kind: "tool-call-delta", callId: "c1", name: "bash", content: "{}" });
    expect(liveKeys([...streaming, delta])).toEqual(["m1"]);
    expect(liveKeys([...streaming, delta, node(7, "tool/call", { callId: "c1", name: "bash" }, "c1")])).toEqual([]);
  });

  it("groups chunks without a messageId by request, then by session", () => {
    const byRequest = node(4, "assistant/chunk", { requestId: "r1", delta: "a" });
    const bare = { ...node(5, "assistant/chunk", { delta: "b" }), data: { delta: "b" } };
    expect(liveKeys([...head, byRequest, bare])).toEqual(["request:r1", "s:partial"]);
  });

  it("keeps the settled key while chunks grow and changes it for new facts", () => {
    const key = (nodes: RuntimeV2TrajectoryNode[], fromSeq = 0) => splitLiveChunks(snap(nodes, fromSeq)).settledKey;
    const empty = [...head, chunk(4, { delta: "" })];
    const first = [...empty, chunk(5, { delta: "a" })];
    const more = [...first, chunk(6, { delta: "b" }), chunk(7, { kind: "reasoning-delta", content: "c" })];
    expect(key(more)).toBe(key(first));
    expect(key(first)).not.toBe(key(empty));
    expect(key([...more, node(8, "llm/retry", { requestId: "r1" })])).not.toBe(key(more));
    expect(key(more, 0)).not.toBe(key([node(-1, "system/prompt", {}), ...more], -1));
  });

  it("hands the builder only the first and first non-empty chunk of a live group", () => {
    const nodes = [...head, chunk(4, { delta: "" }), chunk(5, { delta: "a" }), chunk(6, { delta: "b" })];
    expect(splitLiveChunks(snap(nodes)).settled().nodes.map(item => item.eventSeq)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("folds each chunk once across frames", () => {
    const view = splitView();
    const chunks = Array.from({ length: 25 }, (_, index) => chunk(4 + index, { delta: `${index} ` }));
    for (const count of [1, 5, 12, 20, 25]) view.frame(snap([...head, ...chunks.slice(0, count)]));
    expect(view.accumulator.processed).toBe(25);
    expect(view.builds).toBe(1);
  });

  it("matches the unsplit builder on every streaming frame", () => {
    const view = splitView();
    for (let frame = 0; frame <= STREAMING_FRAMES; frame += 1) {
      const snapshot = streamingFixture(frame);
      const unsplit = deriveLayout(buildTrajectorySnapshot(snapshot));
      const split = view.frame(snapshot);
      expect(split.cells).toEqual(unsplit.cells);
      expect(split.layout.requests).toEqual(unsplit.requests);
    }
    // Frame 0 has no chunk, frame 1 opens the group with its first token; later frames reuse the layout.
    expect(view.builds).toBe(2);
  });

  it("matches the unsplit builder on a long session", () => {
    const view = splitView();
    for (const chunks of [1, 40, 800, 2000]) {
      const snapshot = streamingLongFixture(chunks);
      expect(view.frame(snapshot).cells).toEqual(deriveLayout(buildTrajectorySnapshot(snapshot)).cells);
    }
    expect(view.builds).toBe(1);
  });

  it("drops a group's content once its reply is final", () => {
    const view = splitView();
    const streaming = [...head, chunk(4, { delta: "a" }), chunk(5, { delta: "b" })];
    expect(view.frame(snap(streaming)).live.size).toBe(1);
    const final = view.frame(snap([...streaming, node(6, "assistant/message", { requestId: "r1", messageId: "m1", content: "ab" })]));
    expect(final.live.size).toBe(0);
    expect(final.cells.find(cell => cell.kind === "message")?.record).toMatchObject({ summary: "ab", partial: false, sourceSequences: [4, 5, 6] });
  });
});
