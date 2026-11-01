import { expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import { MemorySessionStorage } from "@actspace/session-storage/testing";
import { SessionProjectionRegistry } from "@actspace/session-projection";
import { SessionProjectionCache } from "../index.js";

it("uses backend revision and reducer versions, retains immutable reads, and bounds replay cache", async () => {
  const codecs = createCoreCodecRegistry();
  const storage = new MemorySessionStorage(codecs);
  const header = (sessionId: string) => createSessionHeader({ sessionId, createdAt: "2026-09-21T00:00:00Z", lineage: null, createdWith: { profileId: "p", runtimeContractVersion: "1", manifestDigest: "x", plugins: [], codecSetDigest: codecs.digest } });
  const journal = new SessionJournal({ registry: codecs });
  const add = (title: string) => journal.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title }, surface: null });
  const writer = await storage.create(header("s")); await writer.append([add("first")]); await writer.flush();
  let applies = 0; let version = 1;
  const cache = new SessionProjectionCache({ storage, codecs, createRegistry: () => {
    const registry = new SessionProjectionRegistry();
    registry.register({ key: "count", stateVersion: version, init: () => 0, apply: state => { applies++; return state + 1; }, view: state => state });
    return registry;
  } });
  const initial = await cache.read("s"); expect(applies).toBe(1);
  expect(await cache.read("s")).toBe(initial); expect(applies).toBe(1);
  const event = add("second"); await writer.append([event]); await writer.flush();
  const updated = await cache.read("s"); expect(applies).toBe(3);
  expect(updated.checkpoint.rows.count?.state).toBe(2);
  expect(await cache.events(updated, 1, 2)).toEqual([event]);
  expect(await cache.events(initial)).toHaveLength(1);
  version++; await cache.read("s"); expect(applies).toBe(5);
  for (const id of ["a", "b", "c"]) { const handle = await storage.create(header(id)); await handle.append(journal.events); await handle.flush(); await handle.close(); await cache.read(id); }
  const before = applies; await cache.read("s"); expect(applies).toBe(before + 2);
  const other = new SessionProjectionCache({ storage: new MemorySessionStorage(codecs), codecs, createRegistry: () => new SessionProjectionRegistry() });
  await expect(other.events(initial)).rejects.toThrow("another storage provider");
  await storage.close();
});
