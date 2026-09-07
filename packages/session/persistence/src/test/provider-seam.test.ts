import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import type { SessionPersistence } from "../session-persistence.js";
import { SessionStore } from "../session-store.js";

describe("SessionStore persistence seam", () => {
  it("accepts a provider without importing or constructing the JSONL backend", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-session-provider-seam-"));
    try {
      const registry = createCoreCodecRegistry();
      let created = 0;
      const appended: number[] = [];
      const provider: SessionPersistence = {
        async create(header, options = {}) {
          created += 1;
          return {
            header,
            layout: {
              root: "memory://sessions-v2",
              sessionDir: `memory://sessions-v2/${header.sessionId}`,
              journalPath: `memory://sessions-v2/${header.sessionId}/journal.jsonl`,
              artifactsDir: `memory://sessions-v2/${header.sessionId}/artifacts`,
              recoveryDir: `memory://sessions-v2/${header.sessionId}/recovery`,
            },
            events: Object.freeze([]),
            driver: Object.freeze({
              append: async (events) => { appended.push(...events.map((event) => event.seq)); },
              assertOwned: async () => undefined,
              close: async () => undefined,
            }),
          };
        },
        async inspect() { throw new Error("fake provider inspect should not be called"); },
        async listSessionIds() { return []; },
        async fork() { throw new Error("fake provider fork should not be called"); },
        async open() { throw new Error("fake provider open should not be called"); },
      };
      const store = new SessionStore({ dataRoot: root, runtimeId: "fake", registry }, provider);
      const session = await store.create({
        sessionId: "fake-provider",
        createdAt: "2026-08-29T12:00:00.000Z",
        lineage: null,
        createdWith: { profileId: "test", runtimeContractVersion: "actspace.runtime.v2", manifestDigest: "digest", plugins: [], codecSetDigest: registry.digest },
      });
      expect(created).toBe(1);
      await session.append({ type: "turn/start", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: "turn-1" }, surface: null });
      await session.flush();
      expect(appended).toEqual([0]);
      await session.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
