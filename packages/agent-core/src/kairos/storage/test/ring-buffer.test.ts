import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@actspace/shared";
import { SessionEventRingBuffer } from "../ring-buffer";

const evt = (id: string): SessionEvent => ({
  id,
  sessionId: "s",
  turnId: "t",
  type: "user_message",
  timestamp: new Date().toISOString(),
  payload: {},
});

describe("SessionEventRingBuffer", () => {
  it("rejects non-positive capacity", () => {
    expect(() => new SessionEventRingBuffer(0)).toThrow();
    expect(() => new SessionEventRingBuffer(-1)).toThrow();
    expect(() => new SessionEventRingBuffer(NaN)).toThrow();
  });

  it("keeps insertion order while under capacity", () => {
    const rb = new SessionEventRingBuffer(3);
    rb.push(evt("a"));
    rb.push(evt("b"));
    expect(rb.tail(10).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("evicts oldest after capacity exceeded", () => {
    const rb = new SessionEventRingBuffer(3);
    ["a", "b", "c", "d", "e"].forEach((id) => rb.push(evt(id)));
    expect(rb.size()).toBe(3);
    expect(rb.tail(3).map((e) => e.id)).toEqual(["c", "d", "e"]);
  });

  it("tail returns at most N items in ascending order even after wrap", () => {
    const rb = new SessionEventRingBuffer(4);
    ["1", "2", "3", "4", "5", "6"].forEach((id) => rb.push(evt(id)));
    expect(rb.tail(2).map((e) => e.id)).toEqual(["5", "6"]);
    expect(rb.tail(4).map((e) => e.id)).toEqual(["3", "4", "5", "6"]);
  });

  it("returned arrays are independent of internal state", () => {
    const rb = new SessionEventRingBuffer(3);
    rb.push(evt("a"));
    const view = rb.tail(1);
    view.push(evt("hacker"));
    expect(rb.tail(1).map((e) => e.id)).toEqual(["a"]);
  });

  it("clear resets size and tail", () => {
    const rb = new SessionEventRingBuffer(2);
    rb.push(evt("a"));
    rb.clear();
    expect(rb.size()).toBe(0);
    expect(rb.tail(5)).toEqual([]);
  });
});
