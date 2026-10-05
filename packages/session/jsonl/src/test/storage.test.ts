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
import { createSessionHeader } from "@actspace/session-journal";
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
