import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import { apply, inject, JsonlSessionStorageService } from "../plugin.js";
import { JsonlSessionStorage } from "../storage.js";
import { storageContract } from "../../../session-storage/src/test/contract.js";

/** 走一遍插件，拿到消费方真正拿到的那个对象：注册在 `session.storage` 下的包装服务。 */
async function published() {
  const dataRoot = await mkdtemp(join(tmpdir(), "jsonl-published-"));
  const ctx = new CordisContextClass();
  ctx.provide("actspace.host.session", { dataRoot, runtimeId: "test" });
  ctx.provide("session.journal", { registry: createCoreCodecRegistry() });
  await ctx.plugin({ inject, apply: (inner) => apply(inner as never) });
  const storage = ctx.get("session.storage") as JsonlSessionStorageService;
  return {
    ctx,
    dataRoot,
    storage,
    cleanup: async () => {
      await ctx.fiber.dispose();
      await rm(dataRoot, { recursive: true, force: true });
    },
  };
}

describe("JSONL storage plugin", () => {
  it("publishes a real Host-owned provider and closes it on unload", async () => {
    const { ctx, storage, cleanup } = await published();
    try {
      expect(storage).toBeInstanceOf(JsonlSessionStorageService);
      await ctx.fiber.dispose();
      expect(ctx.get("session.storage")).toBeUndefined();
      await expect(storage.listSessionIds()).rejects.toThrow("closed");
    } finally {
      await cleanup();
    }
  });

  // 契约里的可选能力在后端没有时会直接跳过，所以先单独确认发布出来的对象一个方法都没少。
  it("publishes every capability of the storage, including the optional ones", async () => {
    const { storage, cleanup } = await published();
    try {
      const methods = Object.getOwnPropertyNames(JsonlSessionStorage.prototype).filter(
        (name) => name !== "constructor",
      );
      expect(methods).toEqual(
        expect.arrayContaining(["refresh", "rewritePrefix", "retireInto", "querySource", "readEventBatch"]),
      );
      expect(
        methods.filter((name) => typeof (storage as unknown as Record<string, unknown>)[name] !== "function"),
      ).toEqual([]);
      expect(typeof storage.identity).toBe("symbol");
    } finally {
      await cleanup();
    }
  });

  it("refreshes a snapshot through the published service: unchanged, then only the appended events", async () => {
    const { storage, cleanup } = await published();
    try {
      const registry = createCoreCodecRegistry();
      const journal = new SessionJournal({ registry });
      const title = (value: string) =>
        journal.append({
          type: "session/title-set",
          eventVersion: 1,
          source: { ownerPluginId: "@actspace/core" },
          data: { title: value },
          surface: null,
        });
      const writer = await storage.create(
        createSessionHeader({
          sessionId: "grow",
          createdAt: "2026-11-14T00:00:00.000Z",
          lineage: null,
          createdWith: {
            profileId: "test",
            runtimeContractVersion: "1",
            manifestDigest: "test",
            plugins: [],
            codecSetDigest: registry.digest,
          },
        }),
      );
      await writer.append([title("one")]);
      await writer.flush();
      const base = await storage.inspect("grow");
      const same = await storage.refresh("grow", base);
      expect(same.kind).toBe("unchanged");
      expect(same.snapshot).toBe(base);
      await writer.append([title("two")]);
      await writer.flush();
      await writer.close();
      const grown = await storage.refresh("grow", base);
      expect(grown).toMatchObject({ kind: "appended", fromEvent: 1 });
      expect(grown.snapshot.events.map((event) => (event.data as { title: string }).title)).toEqual(["one", "two"]);
    } finally {
      await cleanup();
    }
  });
});

storageContract("JSONL as published by the plugin", published);
