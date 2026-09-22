import { afterEach, describe, expect, it } from "vitest";
import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import { SessionProjectionRegistry } from "@actspace/session-projection";
import { SessionProjectionCache } from "../index.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
describe("durable checkpoint and Journal byte index", () => {
  it("does no reducer replay on an unchanged cold read, replays only the suffix, and invalidates versions", async () => {
    const root = await mkdtemp(join(tmpdir(), "projection-cache-")); roots.push(root);
    const codecs = createCoreCodecRegistry();
    const header = createSessionHeader({ sessionId: "s", createdAt: "2026-09-21T00:00:00Z", lineage: null, createdWith: { profileId: "p", runtimeContractVersion: "1", manifestDigest: "x", plugins: [], codecSetDigest: codecs.digest } });
    const journal = new SessionJournal({ registry: codecs });
    const add = (title: string) => journal.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title }, surface: null });
    add("first");
    const path = join(root, "sessions-v2", "s", "journal.jsonl");
    await mkdir(join(root, "sessions-v2", "s"), { recursive: true });
    await writeFile(path, [header, ...journal.events].map(x => JSON.stringify(x)).join("\n") + "\n");
    let applies = 0; let version = 1;
    const cache = () => new SessionProjectionCache({ root, codecs, createRegistry: () => {
      const registry = new SessionProjectionRegistry();
      registry.register({ key: "count", stateVersion: version, init: () => 0, apply: state => { applies++; return state + 1; }, view: state => state });
      return registry;
    } });
    const initial = await cache().read("s"); expect(applies).toBe(1);
    await cache().read("s"); expect(applies).toBe(1);
    const event = add("second"); await appendFile(path, JSON.stringify(event) + "\n");
    const updated = await cache().read("s"); expect(applies).toBe(2);
    expect(updated.checkpoint.rows.count?.state).toBe(2);
    expect(await cache().events(updated, 1, 2)).toEqual([event]);
    expect(initial.checkpoint.throughJournalSeq).toBe(0);
    version++; await cache().read("s"); expect(applies).toBe(4);
  });
});
