import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import { SessionProjectionRegistry } from "../registry.js";
import { registerSessionFacts } from "../facts.js";

const source = { ownerPluginId: "@actspace/core" } as const;

function fixture() {
  const codecs = createCoreCodecRegistry();
  const header = createSessionHeader({ sessionId: "todos", createdAt: "2026-09-22T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: codecs.digest } });
  const journal = new SessionJournal({ registry: codecs, now: (() => { let i = 0; return () => `2026-09-22T00:00:0${i++}.000Z`; })() });
  const append = (items: readonly Record<string, unknown>[]) => journal.append({ type: "todo/write", eventVersion: 1, source, data: { items, revision: Math.max(...items.map(item => Number(item.revision) || 0)) }, surface: null });
  append([{ todoId: "a", revision: 1, text: "A", state: "pending", createdAt: "a", updatedAt: "a" }]);
  append([{ todoId: "b", revision: 1, text: "B", state: "pending", createdAt: "b", updatedAt: "b" }]);
  append([{ todoId: "a", revision: 2, text: "A2", state: "completed", updatedAt: "a2" }]);
  return { header, journal };
}

describe("Session facts canonical todo fold", () => {
  it("merges item deltas and keeps omitted items", () => {
    const { header, journal } = fixture();
    const registry = new SessionProjectionRegistry(); registerSessionFacts(registry, value => value);
    registry.sync(header.sessionId, journal.events);
    expect(registry.snapshot(header.sessionId).values.todos).toEqual([
      { todoId: "a", revision: 2, text: "A2", state: "completed", createdAt: "a", updatedAt: "a2" },
      { todoId: "b", revision: 1, text: "B", state: "pending", createdAt: "b", updatedAt: "b" },
    ]);
  });

  it("produces the same result for full replay and incremental apply and ignores stale revisions", () => {
    const { header, journal } = fixture();
    const full = new SessionProjectionRegistry(); registerSessionFacts(full, value => value); full.sync(header.sessionId, journal.events);
    const incremental = new SessionProjectionRegistry(); registerSessionFacts(incremental, value => value); incremental.sync(header.sessionId, []);
    for (const event of journal.events) incremental.apply(header.sessionId, event);
    expect(incremental.snapshot(header.sessionId)).toEqual(full.snapshot(header.sessionId));
    const stale = { ...journal.events.at(-1)!, seq: journal.events.length };
    stale.data = { items: [{ todoId: "a", revision: 1, text: "old", state: "pending" }] };
    incremental.apply(header.sessionId, stale);
    expect(incremental.snapshot(header.sessionId).values.todos).toEqual(full.snapshot(header.sessionId).values.todos);
  });
});
