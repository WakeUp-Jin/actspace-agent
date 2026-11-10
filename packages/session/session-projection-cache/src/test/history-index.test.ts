import { expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { createHistoryIndex, forkHistoryIndex, indexHistoryEvent, indexHistoryEvents } from "../index.js";

const event = (seq: number, type: string, data: Record<string, unknown> | null = null) => ({ recordKind: "event", seq, type, eventVersion: 1, data, surface: null }) as unknown as SessionEventEnvelopeV1;

it("records where turns, requests, prompt / tool records and tool calls sit", () => {
  const index = createHistoryIndex();
  indexHistoryEvents([
    event(0, "session/title-set", { title: "before any turn" }),
    event(1, "turn/start"), event(2, "request/header"), event(3, "request/system-prompt"), event(4, "request/tools"),
    event(5, "tool/call", { callId: "a" }), event(6, "tool/result", { callId: "a" }), event(7, "turn/end"),
    // Input claimed before `turn/start` belongs to the turn it starts.
    event(8, "user/message", { messageId: "queued" }), event(9, "turn/start"),
    event(10, "llm/auxiliary-start", { callId: "b" }), event(11, "tool/call", { callId: "b" }),
    event(12, "x/list", ["callId"] as never), event(13, "x/number", { callId: 7 }),
  ], index);
  expect(index).toEqual({ floor: 8, starts: [0, 8], requests: [2, 10], prompts: [3], toolSets: [4], calls: { a: [5, 6], b: [10, 11] } });
});

it("folding events one at a time gives the same index as folding them together", () => {
  const events = [event(0, "turn/start"), event(1, "tool/call", { callId: "a" }), event(2, "turn/end"), event(3, "turn/start"), event(4, "tool/result", { callId: "a" })];
  const together = createHistoryIndex();
  indexHistoryEvents(events, together);
  const single = createHistoryIndex();
  for (const item of events) indexHistoryEvent(single, item);
  expect(single).toEqual(together);
});

it("keeps call ids that are also Object.prototype members", () => {
  const index = createHistoryIndex();
  const ids = ["constructor", "__proto__", "toString", "hasOwnProperty"];
  indexHistoryEvents(ids.flatMap((callId, at) => [event(at * 2, "tool/call", { callId }), event(at * 2 + 1, "tool/result", { callId })]), index);
  expect(Object.keys(index.calls)).toEqual(ids);
  for (const [at, callId] of ids.entries()) expect(index.calls[callId]).toEqual([at * 2, at * 2 + 1]);
  expect(index.calls.valueOf).toBeUndefined();

  const { index: fork, touched } = forkHistoryIndex(index, index.floor);
  indexHistoryEvents([event(8, "tool/result", { callId: ids[1] })], fork, touched);
  expect(fork.calls[ids[1]]).toEqual([2, 3, 8]);
  expect(Object.keys(fork.calls)).toEqual(ids);
  expect(index.calls[ids[1]]).toEqual([2, 3]);
});

it("a fork continues the base without changing it", () => {
  const base = createHistoryIndex();
  indexHistoryEvents([event(0, "turn/start"), event(1, "request/header"), event(2, "tool/call", { callId: "a" }), event(3, "tool/call", { callId: "b" }), event(4, "turn/end")], base);
  const before = JSON.stringify(base);
  const { index: fork, touched } = forkHistoryIndex(base, base.floor);
  indexHistoryEvents([event(5, "turn/start"), event(6, "request/header"), event(7, "tool/result", { callId: "a" }), event(8, "tool/result", { callId: "a" }), event(9, "tool/call", { callId: "c" })], fork, touched);
  expect(fork).toEqual({ floor: 5, starts: [0, 5], requests: [1, 6], prompts: [], toolSets: [], calls: { a: [2, 7, 8], b: [3], c: [9] } });
  expect(JSON.stringify(base)).toBe(before);
  // A call the fork never wrote to is shared with the base, not copied.
  expect(fork.calls.b).toBe(base.calls.b);
  expect([...touched].sort()).toEqual(["a", "c"]);
});
