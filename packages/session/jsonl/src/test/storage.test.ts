import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { JsonlSessionStorage } from "../storage.js";
import { storageContract } from "../../../storage/src/test/contract.js";
storageContract("JSONL", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "storage-contract-"));
  return { storage: new JsonlSessionStorage({ dataRoot, runtimeId: "test", registry: createCoreCodecRegistry() }), cleanup: () => rm(dataRoot, { recursive: true, force: true }) };
});

import { expect, it } from "vitest";
import { access } from "node:fs/promises";
import { createSessionHeader, SessionJournal } from "@actspace/session-journal";
it("joins provisional writer acquisition before provider close returns", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "storage-close-"));
  const registry = createCoreCodecRegistry();
  let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const storage = new JsonlSessionStorage({ dataRoot, runtimeId: "test", registry, writerHooks: { before: async operation => { if (operation === "header-write") { entered(); await blocked; } } } });
  try {
    const creating = storage.create(createSessionHeader({ sessionId: "closing", createdAt: new Date().toISOString(), lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }));
    const rejected = expect(creating).rejects.toThrow("Storage is closed");
    await started;
    let closed = false;
    const closing = storage.close().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false);
    release(); await rejected; await closing;
    await expect(access(join(dataRoot, "sessions-v2", "closing", ".writer-lock", "owner.json"))).rejects.toThrow();
  } finally { release?.(); await storage.close(); await rm(dataRoot, { recursive: true, force: true }); }
});

it("writer proof is removed after an unknown same-size overwrite", async () => {
  const { readFile, writeFile } = await import("node:fs/promises");
  const dataRoot = await mkdtemp(join(tmpdir(), "storage-query-proof-"));
  const registry = createCoreCodecRegistry();
  const { JsonlSessionStorage: BuiltStorage } = await import(new URL("../../dist/storage.js", import.meta.url).href);
  const storage = new BuiltStorage({ dataRoot, runtimeId: "test", registry });
  try {
    await storage.create(createSessionHeader({ sessionId: "proof", createdAt: "2026-10-11T00:00:00.000Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }));
    const first = await storage.querySource("proof");
    expect(first.appendOnlyToken).toBeTruthy();
    const path = storage.journalPath("proof");
    await writeFile(path, (await readFile(path, "utf8")).replace('"profileId":"test"', '"profileId":"rest"'));
    const changed = await storage.querySource("proof");
    expect(changed.appendOnlyToken).toBeUndefined();
    expect(changed.stamp).not.toBe(first.stamp);
  } finally { await storage.close(); await rm(dataRoot, { recursive: true, force: true }); }
});

it("query descriptors wait for the real writer fsync while old durable cursors remain bounded", async () => {
  const { readFile } = await import("node:fs/promises");
  const dataRoot = await mkdtemp(join(tmpdir(), "storage-durable-query-"));
  const registry = createCoreCodecRegistry();
  const { JsonlSessionStorage: BuiltStorage } = await import(new URL("../../dist/storage.js", import.meta.url).href);
  let armed = false;
  let entered!: () => void;
  let release!: () => void;
  const atSync = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const storage = new BuiltStorage({ dataRoot, runtimeId: "test", registry, writerHooks: {
    before: async (operation: string) => { if (armed && operation === "file-fsync") { entered(); await gate; } },
  } });
  try {
    const writer = await storage.create(createSessionHeader({ sessionId: "durable", createdAt: "2026-10-12T00:00:00.000Z", lineage: null,
      createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }));
    const before = await storage.querySource("durable");
    const cursor = (await storage.readEventBatch("durable", { throughSeq: before.throughSeq })).cursor;
    const event = new SessionJournal({ registry }).append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" },
      data: { messageId: "pending", content: "pending durability" }, surface: { kind: "append", node: { kind: "user", messageId: "pending", content: "pending durability" } } });
    armed = true;
    const append = writer.append([event]);
    await atSync;
    // Bytes really reached the file, but the writer has not acknowledged fsync.
    expect(await readFile(storage.journalPath("durable"), "utf8")).toContain("pending durability");
    let singleResolved = false, batchResolved = false;
    const single = storage.querySource("durable").then(value => { singleResolved = true; return value; });
    const batch = storage.querySources(["durable"]).then(value => { batchResolved = true; return value; });
    const old = await storage.readEventBatch("durable", { throughSeq: before.throughSeq, cursor });
    expect(old.events).toEqual([]);
    expect(singleResolved).toBe(false);
    expect(batchResolved).toBe(false);
    release(); await append;
    const after = await single;
    expect((await batch)[0]).toEqual(after);
    expect(after.throughSeq).toBe(event.seq);
    expect(after.appendOnlyToken).toBe(before.appendOnlyToken);
    expect((await storage.readEventBatch("durable", { throughSeq: after.throughSeq, cursor })).events).toEqual([event]);
  } finally { release(); await storage.close(); await rm(dataRoot, { recursive: true, force: true }); }
});
