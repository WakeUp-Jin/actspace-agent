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
  it("checkpoints internal state and rejects asynchronous views", () => {
    const registry = new SessionProjectionRegistry();
    registry.register({ key: "count", stateVersion: 1, init: () => ({ count: 0, secretState: 4 }), apply: state => ({ ...state, count: state.count + 1 }), view: state => state.count });
    registry.sync("s", eventJournal());
    const checkpoint = registry.checkpoint("s");
    (checkpoint.rows.count!.state as { count: number }).count = 99;
    expect(registry.snapshot("s").values.count).toBe(3);
    const restored = new SessionProjectionRegistry();
    restored.register({ key: "count", stateVersion: 1, init: () => ({ count: 0, secretState: 4 }), apply: state => state, view: state => state.count });
    restored.restore("s", registry.checkpoint("s"));
    expect(restored.snapshot("s")).toEqual(registry.snapshot("s"));
    const invalid = new SessionProjectionRegistry();
    invalid.register({ key: "bad", stateVersion: 1, init: () => 0, apply: state => state, view: (() => Promise.resolve(1)) as never });
    expect(() => invalid.snapshot("s")).toThrow("plain JSON");
  });

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

  it("rejects mutating reducers without advancing or contaminating committed state", () => {
    const registry = new SessionProjectionRegistry();
    registry.register({ key: "count", stateVersion: 1, init: () => ({ count: 0 }), apply: state => { state.count++; throw new Error("broken reducer"); }, view: state => state });
    registry.ensureSession("s");
    expect(() => registry.apply("s", eventJournal()[0]!)).toThrow();
    expect(registry.snapshot("s")).toMatchObject({ throughJournalSeq: -1, values: { count: { count: 0 } } });
  });

  it("fails duplicate keys and event gaps without mutating the cell", () => {
    const registry = new SessionProjectionRegistry();
    registry.register({ key: "count", stateVersion: 1, init: () => 0, apply: (state) => state + 1, view: (state) => state });
    expect(() => registry.register({ key: "count", stateVersion: 1, init: () => 0, apply: (state) => state, view: (state) => state })).toThrow("Duplicate projection key");
    const events = eventJournal();
    registry.sync("session-1", [events[0]!]);
    expect(registry.apply("session-1", events[0]!)).toBeNull();
    expect(() => registry.apply("session-1", { ...events[0]!, time: "2026-08-30T00:00:01.000Z" })).toThrow("resync");
    expect(registry.snapshot("session-1").throughJournalSeq).toBe(0);
  });
});
