import { expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { SessionProjectionRegistry } from "@actspace/session-projection";
import type { SessionStorage, SessionStorageRefresh, SessionStorageSnapshot } from "@actspace/session-storage";
import { SessionProjectionCache } from "../index.js";

const codecs = createCoreCodecRegistry();
const MB = 1024 * 1024;
const header = (sessionId: string) => createSessionHeader({ sessionId, createdAt: "2026-11-04T00:00:00Z", lineage: null, createdWith: { profileId: "p", runtimeContractVersion: "1", manifestDigest: "x", plugins: [], codecSetDigest: codecs.digest } });
const event = (seq: number, type: string, data: Record<string, unknown> | null = null): SessionEventEnvelopeV1 => ({ recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: "2026-11-04T00:00:00Z", source: { ownerPluginId: "t" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as unknown as SessionEventEnvelopeV1);

/** A backend whose refresh() classifies against what it currently holds; counts what the cache asks of it. */
class FakeStorage implements SessionStorage {
  readonly identity = Symbol("fake");
  readonly sessions = new Map<string, { events: SessionEventEnvelopeV1[]; revision: number; bytes: number; integrity: "complete" | "repair-required"; validatedDigest: string | undefined }>();
  inspects = 0; refreshes = 0; failRefresh = false;
  put(id: string, events: SessionEventEnvelopeV1[], bytes = 100) { this.sessions.set(id, { events, revision: (this.sessions.get(id)?.revision ?? -1) + 1, bytes, integrity: "complete", validatedDigest: codecs.digest }); }
  append(id: string, ...events: SessionEventEnvelopeV1[]) { const s = this.sessions.get(id)!; s.events = [...s.events, ...events]; s.revision++; s.bytes += 100 * events.length; }
  #snapshot(id: string): SessionStorageSnapshot {
    const s = this.sessions.get(id)!;
    return Object.freeze({ header: header(id), events: Object.freeze([...s.events]), revision: String(s.revision), integrity: s.integrity, ...(s.integrity === "complete" ? {} : { problem: "torn" }), bytes: s.bytes, ...(s.validatedDigest ? { validated: { codecDigest: s.validatedDigest, accessState: "read-write" as const, result: { accessState: "read-write" as const, diagnostics: [], relations: { openTurnId: null, openStepId: null, openRequestIds: [], openToolCallIds: [], pendingInboxMessageIds: [], committedRepairIds: [] } } } } : {}) });
  }
  async inspect(id: string) { this.inspects++; return this.#snapshot(id); }
  async refresh(id: string, base: SessionStorageSnapshot): Promise<SessionStorageRefresh> {
    this.refreshes++;
    if (this.failRefresh) throw new Error("backend unavailable");
    const s = this.sessions.get(id)!;
    if (String(s.revision) === base.revision && s.integrity === "complete") return { kind: "unchanged", snapshot: base };
    const snapshot = this.#snapshot(id);
    const prefix = base.events.length <= snapshot.events.length && base.events.every((e, i) => e === s.events[i]);
    return prefix && s.integrity === "complete" ? { kind: "appended", snapshot, fromEvent: base.events.length } : { kind: "replaced", snapshot };
  }
  async listSessionIds() { return [...this.sessions.keys()]; }
  create(): never { throw new Error("unused"); }
  open(): never { throw new Error("unused"); }
  discard(): never { throw new Error("unused"); }
  async close() {}
}

function setup(options: { reducerVersion?: () => number } = {}) {
  const storage = new FakeStorage();
  let applies = 0;
  const cache = new SessionProjectionCache({ storage, codecs, createRegistry: () => {
    const registry = new SessionProjectionRegistry();
    registry.register({ key: "count", stateVersion: options.reducerVersion?.() ?? 1, init: () => 0, apply: state => { applies++; return state + 1; }, view: state => state });
    return registry;
  } });
  return { storage, cache, applies: () => applies };
}
const title = (seq: number) => ({ ...event(seq, "session/title-set", { title: `t${seq}` }), source: { ownerPluginId: "@actspace/core" } }) as SessionEventEnvelopeV1;
const turn = (from: number) => [event(from, "turn/start", { callId: "a" }), event(from + 1, "request/header", { callId: "b" }), event(from + 2, "turn/end"), event(from + 3, "llm/auxiliary-start"), event(from + 4, "x/y", { callId: "a" })];
/** What an index/checkpoint should be: the answer of a cache that never saw the session before. */
async function cold(storage: FakeStorage, id: string) {
  const fresh = setup(); fresh.storage.sessions = storage.sessions;
  return fresh.cache.read(id);
}

it("cache hit asks the backend only for a cheap refresh and returns the same read without inspecting or folding", async () => {
  const { storage, cache, applies } = setup();
  storage.put("s", turn(0));
  const first = await cache.read("s");
  expect(storage.inspects).toBe(1);
  const folded = applies();
  for (let i = 0; i < 5; i++) expect(await cache.read("s")).toBe(first);
  expect(storage.inspects).toBe(1);
  expect(storage.refreshes).toBe(5);
  expect(applies()).toBe(folded);
});

it("append-only growth folds and indexes only the new events, and equals a cold rebuild", async () => {
  const { storage, cache, applies } = setup();
  storage.put("s", turn(0));
  const before = await cache.read("s");
  const beforeIndexes = JSON.stringify([before.starts, before.requests, before.calls]);
  const folded = applies();
  storage.append("s", ...turn(5), event(10, "x/y", { callId: "c" }));
  const after = await cache.read("s");
  expect(storage.inspects).toBe(1);
  expect(applies() - folded).toBe(6); // only the 6 new events
  const expected = await cold(storage, "s");
  expect(after.events).toEqual(expected.events);
  expect(after.starts).toEqual(expected.starts);
  expect(after.requests).toEqual(expected.requests);
  expect(after.calls).toEqual(expected.calls);
  expect(after.checkpoint).toEqual(expected.checkpoint);
  expect(after.accessState).toBe(expected.accessState);
  expect(after.revision).toBe("1");
  // A read already handed out never changes underneath its holder.
  expect(JSON.stringify([before.starts, before.requests, before.calls])).toBe(beforeIndexes);
  expect(before.events).toHaveLength(5);
  expect(await cache.events(before)).toHaveLength(5);
  expect(before.checkpoint.rows.count?.state).toBe(5);
  // Chained appends keep working from the extended entry.
  storage.append("s", event(11, "x/y", { callId: "a" }));
  const chained = await cache.read("s");
  expect(chained.calls.a).toEqual([0, 4, 5, 9, 11]);
  expect(chained.checkpoint).toEqual((await cold(storage, "s")).checkpoint);
});

it("a backend 'replaced' answer (rewrite, truncation, repair) rebuilds everything from the new snapshot", async () => {
  const { storage, cache, applies } = setup();
  storage.put("s", turn(0));
  await cache.read("s");
  const folded = applies();
  storage.put("s", turn(0).slice(0, 3)); // fewer events: not a prefix extension
  const rebuilt = await cache.read("s");
  expect(rebuilt.events).toHaveLength(3);
  expect(applies() - folded).toBe(3);
  expect(storage.inspects).toBe(1); // refresh answered 'replaced' with the full snapshot itself
  expect(rebuilt.checkpoint).toEqual((await cold(storage, "s")).checkpoint);
});

it("a torn tail reported by refresh rejects like a fresh read and leaves no stale entry", async () => {
  const { storage, cache } = setup();
  storage.put("s", turn(0));
  await cache.read("s");
  storage.sessions.get("s")!.integrity = "repair-required"; storage.sessions.get("s")!.revision++;
  await expect(cache.read("s")).rejects.toThrow("torn");
  storage.sessions.get("s")!.integrity = "complete"; storage.sessions.get("s")!.revision++;
  expect((await cache.read("s")).events).toHaveLength(5);
});

it("backend failure during refresh rejects and drops the entry", async () => {
  const { storage, cache } = setup();
  storage.put("s", turn(0));
  await cache.read("s");
  storage.failRefresh = true;
  await expect(cache.read("s")).rejects.toThrow("backend unavailable");
  storage.failRefresh = false;
  const inspects = storage.inspects;
  await cache.read("s");
  expect(storage.inspects).toBe(inspects + 1); // rebuilt from a fresh inspect, never from the stale entry
});

it("without backend validation for this codec set, growth is still correct (full validation + rebuild)", async () => {
  const { storage, cache, applies } = setup();
  storage.put("s", [title(0), title(1)]);
  await cache.read("s");
  storage.sessions.get("s")!.validatedDigest = "some-other-codec-set";
  const folded = applies();
  storage.append("s", title(2));
  const read = await cache.read("s");
  expect(read.events).toHaveLength(3);
  expect(applies() - folded).toBe(3);
  expect(read.accessState).toBe("read-write");
});

it("reducer version change invalidates the entry even when the Journal is unchanged", async () => {
  let version = 1;
  const { storage, cache, applies } = setup({ reducerVersion: () => version });
  storage.put("s", turn(0));
  const first = await cache.read("s");
  version = 2;
  const second = await cache.read("s");
  expect(second).not.toBe(first);
  expect(applies()).toBe(10);
  expect(second.checkpoint.rows.count?.stateVersion).toBe(2);
});

it("a backend without refresh keeps the revision-keyed behavior", async () => {
  const { storage, cache, applies } = setup();
  (storage as { refresh?: unknown }).refresh = undefined;
  storage.put("s", turn(0));
  const first = await cache.read("s");
  expect(await cache.read("s")).toBe(first);
  expect(storage.inspects).toBe(2);
  expect(applies()).toBe(5);
  storage.append("s", event(5, "x/y"));
  expect((await cache.read("s")).events).toHaveLength(6);
  expect(applies()).toBe(11);
});

it("large Sessions are cacheable: size does not decide whether a read is retained", async () => {
  const { storage, cache, applies } = setup();
  storage.put("big", turn(0), 37 * MB);
  const first = await cache.read("big");
  const folded = applies();
  expect(await cache.read("big")).toBe(first);
  expect(applies()).toBe(folded);
  // Even a Journal over the byte guard is kept when it is the only one.
  storage.put("huge", turn(0), 400 * MB);
  const huge = await cache.read("huge");
  expect(await cache.read("huge")).toBe(huge);
});

it("keeps the 3 most recently used Sessions and evicts the oldest", async () => {
  const { storage, cache } = setup();
  for (const id of ["a", "b", "c", "d"]) storage.put(id, turn(0));
  const a = await cache.read("a"); const b = await cache.read("b"); const c = await cache.read("c");
  expect(await cache.read("a")).toBe(a); // touch: b is now least recently used
  await cache.read("d");
  expect(await cache.read("a")).toBe(a);
  expect(await cache.read("c")).toBe(c);
  expect(await cache.read("b")).not.toBe(b); // evicted, rebuilt
});

it("evicts older Sessions when the byte guard is exceeded but always keeps the newest", async () => {
  const { storage, cache } = setup();
  for (const id of ["a", "b", "c"]) storage.put(id, turn(0), 60 * MB);
  const a = await cache.read("a");
  const b = await cache.read("b"); // 120MB > 96MB: a is evicted
  expect(await cache.read("b")).toBe(b);
  expect(await cache.read("a")).not.toBe(a);
  expect(await cache.read("a")).toBeDefined();
});

it("concurrent reads of one Session share a single backend request", async () => {
  const { storage, cache } = setup();
  storage.put("s", turn(0));
  const [x, y] = await Promise.all([cache.read("s"), cache.read("s")]);
  expect(x).toBe(y);
  expect(storage.inspects).toBe(1);
});
