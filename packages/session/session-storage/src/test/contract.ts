import { describe, it, expect } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import type { SessionStorage } from "../index.js";

export function storageContract(
  name: string,
  fixture: () => Promise<{ storage: SessionStorage; cleanup(): Promise<void> }>,
) {
  const registry = createCoreCodecRegistry();
  const header = () =>
    createSessionHeader({
      sessionId: "contract",
      createdAt: "2026-10-04T00:00:00.000Z",
      lineage: null,
      createdWith: {
        profileId: "test",
        runtimeContractVersion: "1",
        manifestDigest: "test",
        plugins: [],
        codecSetDigest: registry.digest,
      },
    });
  const event = () =>
    new SessionJournal({ registry }).append({
      type: "user/message",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { messageId: "m", content: "hello" },
      surface: { kind: "append" },
    });
  describe(`${name} storage contract`, () => {
    it("creates once, rejects another writer, allows immutable read snapshots and persists a flush", async () => {
      const f = await fixture();
      try {
        const writer = await f.storage.create(header());
        await expect(f.storage.create(header())).rejects.toThrow();
        await expect(f.storage.open("contract", "write")).rejects.toThrow();
        const reader = await f.storage.open("contract", "read");
        const before = await reader.read();
        await expect(reader.append([event()])).rejects.toThrow();
        await writer.append([event()]);
        await writer.flush();
        expect((await reader.read()).events).toEqual([]);
        const after = await f.storage.inspect("contract");
        expect(after.events).toHaveLength(1);
        expect(after.revision).not.toBe(before.revision);
        expect(await f.storage.listSessionIds()).toContain("contract");
        await reader.close();
        await writer.close();
        await writer.close();
        const next = await f.storage.open("contract", "write");
        expect((await next.read()).events).toHaveLength(1);
        await next.close();
      } finally {
        await f.storage.close();
        await f.cleanup();
      }
    });
    it("rejects noncontiguous writes without changing the accepted prefix and releases on provider close", async () => {
      const f = await fixture();
      try {
        const writer = await f.storage.create(header());
        await expect(writer.append([{ ...event(), seq: 5 }])).rejects.toThrow();
        expect((await writer.read()).events).toHaveLength(0);
        await writer.append([event()]);
        await writer.flush();
        await f.storage.close();
        await expect(writer.append([event()])).rejects.toThrow();
      } finally {
        await f.storage.close();
        await f.cleanup();
      }
    });
    it("discards only a currently owned writer", async () => {
      const f = await fixture();
      try {
        const writer = await f.storage.create(header());
        const reader = await f.storage.open("contract", "read");
        await expect(f.storage.discard(reader)).rejects.toThrow();
        await reader.close();
        await f.storage.discard(writer);
        await expect(f.storage.inspect("contract")).rejects.toThrow();
        const next = await f.storage.create(header());
        await next.close();
      } finally {
        await f.storage.close();
        await f.cleanup();
      }
    });
    it("rewrites a closed Session to a prefix plus closing events and refuses a stale cut or an open writer", async () => {
      const f = await fixture();
      try {
        if (!f.storage.rewritePrefix) return;
        const journal = new SessionJournal({ registry });
        const message = (id: string) =>
          journal.append({
            type: "user/message",
            eventVersion: 1,
            source: { ownerPluginId: "@actspace/core" },
            data: { messageId: id, content: id },
            surface: { kind: "append" },
          });
        const writer = await f.storage.create(header());
        const kept = message("one");
        await writer.append([kept, message("two"), message("three")]);
        await writer.flush();
        const closing = [
          {
            type: "session/title-set",
            eventVersion: 1,
            source: { ownerPluginId: "@actspace/core" },
            data: { title: "kept" },
            surface: null,
          },
        ] as const;
        await expect(
          f.storage.rewritePrefix("contract", { expectedLastSeq: 2, cutSeq: 1, closing, label: "rewind-a" }),
        ).rejects.toThrow();
        await writer.close();
        await expect(
          f.storage.rewritePrefix("contract", { expectedLastSeq: 1, cutSeq: 1, closing, label: "rewind-a" }),
        ).rejects.toThrow();
        const result = await f.storage.rewritePrefix("contract", {
          expectedLastSeq: 2,
          cutSeq: 1,
          closing,
          label: "rewind-a",
        });
        expect(result.archive).toBe("recovery/rewind-a.journal.jsonl");
        const after = await f.storage.inspect("contract");
        expect(after.events.map((event) => [event.seq, event.type])).toEqual([
          [0, "user/message"],
          [1, "session/title-set"],
        ]);
        expect(after.events[0]).toEqual(kept);
        const reopened = await f.storage.open("contract", "write");
        await reopened.append([
          new SessionJournal({ registry, seed: after.events }).append({
            type: "user/message",
            eventVersion: 1,
            source: { ownerPluginId: "@actspace/core" },
            data: { messageId: "four", content: "four" },
            surface: { kind: "append" },
          }),
        ]);
        await reopened.flush();
        await reopened.close();
        expect((await f.storage.inspect("contract")).events).toHaveLength(3);
      } finally {
        await f.storage.close();
        await f.cleanup();
      }
    });
    it("retires a closed child Session out of the catalog", async () => {
      const f = await fixture();
      try {
        if (!f.storage.retireInto) return;
        const childHeader = () =>
          createSessionHeader({
            sessionId: "child",
            createdAt: "2026-10-04T00:00:00.000Z",
            lineage: null,
            createdWith: {
              profileId: "test",
              runtimeContractVersion: "1",
              manifestDigest: "test",
              plugins: [],
              codecSetDigest: registry.digest,
            },
          });
        const parent = await f.storage.create(header());
        await parent.close();
        const child = await f.storage.create(childHeader());
        await expect(f.storage.retireInto("child", "contract", "rewind-a")).rejects.toThrow();
        await child.close();
        await f.storage.retireInto("child", "contract", "rewind-a");
        expect(await f.storage.listSessionIds()).toEqual(["contract"]);
        await expect(f.storage.inspect("child")).rejects.toThrow();
        await expect(f.storage.retireInto("child", "contract", "rewind-a")).rejects.toThrow();
        const recreated = await f.storage.create(childHeader());
        await recreated.close();
      } finally {
        await f.storage.close();
        await f.cleanup();
      }
    });
  });
}
