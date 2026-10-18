import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { JsonlSessionStorage } from "@actspace/session-jsonl";
import { SessionStore } from "../session-store.js";

describe("file-backed live history", () => {
  it("bounds resident bodies while retaining all facts across close/reopen without SQLite", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-bounded-"));
    const registry = createCoreCodecRegistry();
    const storage = new JsonlSessionStorage({ dataRoot: root, runtimeId: "bounded", registry });
    const store = new SessionStore({ registry }, storage);
    try {
      const session = await store.create({ sessionId: "long", createdAt: "2026-10-18T00:00:00.000Z", lineage: null, createdWith: { profileId: "base", runtimeContractVersion: "1", manifestDigest: "m", plugins: [], codecSetDigest: registry.digest } });
      const count = Number(process.env.ACTSPACE_STORAGE_SCALE ?? 2_000);
      for (let i = 0; i < count; i++) await session.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: `标题-${i}` }, surface: null });
      await session.flush();
      expect(session.journal.retainedEventCount).toBeLessThanOrEqual(512);
      expect(session.journal.retainedEventBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
      expect(session.journal.readEvents(0, 1)[0]?.data).toEqual({ title: "标题-0" });
      expect(session.journal.readEvents(count - 1, count)[0]?.data).toEqual({ title: `标题-${count - 1}` });
      const facts = session.journal.readEvents();
      await session.close();
      const reopened = await store.open("long");
      expect(reopened.journal.retainedEventCount).toBeLessThanOrEqual(512);
      expect(reopened.journal.readEvents()).toEqual(facts);
      expect(reopened.durableSeq).toBe(count - 1);
      const next = await reopened.append({ type: "session/pinned-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { pinned: true }, surface: null });
      expect(next.seq).toBe(count);
      await reopened.flush();
      expect((await store.inspect("long")).events).toHaveLength(count + 1);
      expect((await readdir(root)).some(name => name.endsWith(".sqlite"))).toBe(false);
      await reopened.close();
    } finally { await storage.close(); await rm(root, { recursive: true, force: true }); }
  }, 120_000);
});
