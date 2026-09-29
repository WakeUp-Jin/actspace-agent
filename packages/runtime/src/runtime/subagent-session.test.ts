import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { apply as checkpointPolicy } from "@actspace/session-checkpoint-policy/plugin";
import { RuntimeSessionController } from "./session-controller.js";

it("checkpoints a provider-owned child session until its scope releases it", async () => {
  const root = await mkdtemp(join(tmpdir(), "child-checkpoint-"));
  const registry = createCoreCodecRegistry();
  const sessions = new RuntimeSessionController({ dataRoot: root, runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] });
  await sessions.browseSessions(); // An existing index must discover children created outside the controller.
  const child = await sessions.store.create({ sessionId: "child", createdAt: new Date().toISOString(),
    lineage: { origin: "delegation", parentSessionId: "parent", parentCallId: "delegate", parentBoundarySeq: 0, seedDigest: "test", delegationDepth: 1 },
    createdWith: { profileId: "base", presetId: "actspace.explore", runtimeContractVersion: "2", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
  let checkpoint!: (payload: unknown) => Promise<void>;
  checkpointPolicy({ get: () => sessions, on: (_type, listener) => { checkpoint = listener as typeof checkpoint; } });
  try {
    await expect(checkpoint({ sessionId: "child", throughSeq: child.lastSeq })).rejects.toThrow("not live");
    const release = sessions.registerExternal(child);
    await child.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: "child" }, surface: null });
    await checkpoint({ sessionId: "child", throughSeq: child.lastSeq });
    expect((await sessions.store.inspect("child")).events.at(-1)?.type).toBe("session/title-set");
    expect(sessions.getOpen("child")).toBe(child);
    release();
    expect(sessions.getOpen("child")).toBeUndefined();
    await expect(checkpoint({ sessionId: "child", throughSeq: child.lastSeq })).rejects.toThrow("not live");
    await child.close();
    expect(await sessions.browseSessions()).toMatchObject({ failed: 0, items: [{ sessionId: "child", lineage: { origin: "delegation" } }] });
    expect(await sessions.inspect("child")).toMatchObject({ lineage: { origin: "delegation" } });
  } finally { await child.close(); await sessions.closeAll(); await rm(root, { recursive: true, force: true }); }
});
