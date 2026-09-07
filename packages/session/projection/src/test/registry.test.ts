import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, SessionJournal, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { SessionProjectionRegistry } from "../registry.js";

const source = { ownerPluginId: "@actspace/core" } as const;

function eventJournal(): SessionEventEnvelopeV1[] {
  const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-30T00:00:00.000Z" });
  journal.append({ type: "turn/start", eventVersion: 1, source, data: { turnId: "turn-1" }, surface: null });
  journal.append({ type: "user/message", eventVersion: 1, source, data: { messageId: "user-1", content: "hello" }, surface: { kind: "append", node: { kind: "user", messageId: "user-1", content: "hello" } } });
  journal.append({ type: "turn/end", eventVersion: 1, source, data: { turnId: "turn-1" }, surface: null });
  return [...journal.events];
}

describe("SessionProjectionRegistry", () => {
  it("replays per-session cells, ignores unrelated events by reference, and publishes one change", () => {
    const registry = new SessionProjectionRegistry();
    registry.register({
      key: "count",
      stateVersion: 1,
      init: () => 0,
      apply: (state, event) => event.type === "user/message" ? state + 1 : state,
      view: (state) => state,
    });
    const changes: unknown[] = [];
    registry.onChanged("session-1", (change) => changes.push(change));
    const events = eventJournal();
    registry.sync("session-1", [events[0]!]);
    expect(registry.apply("session-1", events[1]!)).not.toBeNull();
    expect(registry.apply("session-1", events[2]!)).toBeNull();
    expect(registry.snapshot("session-1")).toMatchObject({ sessionId: "session-1", throughJournalSeq: 2, values: { count: 1 } });
    expect(changes).toHaveLength(1);
  });

  it("supports late registration and rejects non-contiguous event input", () => {
    const registry = new SessionProjectionRegistry();
    const events = eventJournal();
    registry.sync("session-1", events);
    registry.register({
      key: "messages",
      stateVersion: 1,
      init: () => [] as string[],
      apply: (state, event) => event.type === "user/message" ? [...state, "user-1"] : state,
      view: (state) => state,
    });
    expect(registry.snapshot("session-1").values.messages).toEqual(["user-1"]);
    expect(() => registry.sync("session-1", [events[1]!])).toThrow("contiguous");
  });

  it("fails duplicate keys and event gaps without mutating the cell", () => {
    const registry = new SessionProjectionRegistry();
    registry.register({ key: "count", stateVersion: 1, init: () => 0, apply: (state) => state + 1, view: (state) => state });
    expect(() => registry.register({ key: "count", stateVersion: 1, init: () => 0, apply: (state) => state, view: (state) => state })).toThrow("Duplicate projection key");
    const events = eventJournal();
    registry.sync("session-1", [events[0]!]);
    expect(() => registry.apply("session-1", events[0]!)).toThrow("event gap");
    expect(registry.snapshot("session-1").throughJournalSeq).toBe(0);
  });
});
