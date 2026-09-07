import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, SessionJournal, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { coldRestore, MemoryProjectionCheckpointStore, writeCheckpoint } from "../index.js";

const source = { ownerPluginId: "@actspace/core" } as const;

function events(): SessionEventEnvelopeV1[] {
  const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-30T00:00:00.000Z" });
  journal.append({ type: "turn/start", eventVersion: 1, source, data: { turnId: "turn-1" }, surface: null });
  journal.append({ type: "turn/end", eventVersion: 1, source, data: { turnId: "turn-1" }, surface: null });
  return [...journal.events];
}

describe("projection checkpoint cache", () => {
  it("restores a valid checkpoint with only the Journal tail", async () => {
    const store = new MemoryProjectionCheckpointStore();
    await writeCheckpoint({ store, sessionId: "s", projectionKey: "count", stateVersion: 1, throughJournalSeq: 0, value: 1 });
    const result = await coldRestore({ sessionId: "s", projectionKey: "count", stateVersion: 1, events: events(), store, replay: (seed, tail) => (seed ?? 0) + tail.length });
    expect(result.value).toBe(2);
    expect(result.cache.kind).toBe("hit");
  });

  it("replays from zero after version mismatch or Journal shrink", async () => {
    const store = new MemoryProjectionCheckpointStore();
    await writeCheckpoint({ store, sessionId: "s", projectionKey: "count", stateVersion: 1, throughJournalSeq: 3, value: 99 });
    const result = await coldRestore({ sessionId: "s", projectionKey: "count", stateVersion: 2, events: events(), store, replay: (seed, tail) => (seed ?? 0) + tail.length });
    expect(result.value).toBe(2);
    expect(result.cache).toMatchObject({ kind: "miss", reason: "state-version" });
  });

  it("can delete all rows without affecting Journal replay", async () => {
    const store = new MemoryProjectionCheckpointStore();
    await writeCheckpoint({ store, sessionId: "s", projectionKey: "count", stateVersion: 1, throughJournalSeq: 0, value: 1 });
    await store.delete("s");
    const row = await store.read("s", "count");
    expect(row).toBeNull();
  });
});
