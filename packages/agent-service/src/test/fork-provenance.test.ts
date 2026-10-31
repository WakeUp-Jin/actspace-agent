import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCoreCodecRegistry, type EventCodec } from "@actspace/session-journal";
import { JsonlSessionStorage, sessionFileLayout } from "@actspace/session-jsonl";
import { SessionStore, type SessionHandle } from "@actspace/session-persistence";
import { AgentApplication } from "../application.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const codec = (criticality: "required" | "ignorable"): EventCodec => ({
  type: "plugin/fork-test/fact", ownerPluginId: "fork-test", currentVersion: 1, criticality,
  validate: () => {},
});

async function fixture(options: { changedCodec?: boolean; missingRequired?: boolean; openTurn?: boolean; mode?: "chat" | "plan" | "agent" } = {}) {
  const dataRoot = await mkdtemp(join(tmpdir(), "fork-provenance-")); roots.push(dataRoot);
  const oldRegistry = createCoreCodecRegistry(options.missingRequired ? [codec("required")] : []);
  const registry = createCoreCodecRegistry(options.changedCodec ? [codec("ignorable")] : []);
  const oldStore = new SessionStore({ registry: oldRegistry }, new JsonlSessionStorage({ dataRoot, runtimeId: "old", registry: oldRegistry }));
  const oldProvenance = { profileId: "old-profile", manifestDigest: "old-manifest", runtimeContractVersion: "old-runtime", plugins: [{ id: "old-plugin", version: "1" }], codecSetDigest: oldRegistry.digest, initialAgentMode: options.mode ?? "agent" };
  const parent = await oldStore.create({ sessionId: "parent", cwd: "/workspace", createdAt: "2026-10-22T00:00:00Z", lineage: null, createdWith: oldProvenance });
  await parent.append({ type: "turn/start", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: "t1" }, surface: null });
  if (options.missingRequired) await parent.append({ type: "plugin/fork-test/fact", eventVersion: 1, source: { ownerPluginId: "fork-test" }, data: { value: 1 }, surface: null });
  if (!options.openTurn) await parent.append({ type: "turn/end", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: "t1", reason: "completed" }, surface: null });
  const boundarySeq = parent.journal.events.length - 1;
  await parent.close();
  const parentPath = sessionFileLayout(dataRoot, "parent").journalPath;
  const parentBytes = await readFile(parentPath);
  const store = new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot, runtimeId: "current", registry }));
  const provenance = { profileId: "current-profile", manifestDigest: "current-manifest", runtimeContractVersion: "actspace.runtime.v2", plugins: [{ id: "current-plugin", version: "2" }], codecSetDigest: registry.digest, agentFormId: "actspace.main" as const, agentFormVersion: 1, agentCompositionDigest: "current-composition", agentMembers: [{ id: "member", version: 2 }] };
  let open: SessionHandle | undefined;
  const initialize = vi.fn(async () => {});
  const sessions = {
    store,
    creationProvenance: (mode: "chat" | "plan" | "agent" = "agent") => ({ ...provenance, initialAgentMode: mode }),
    resume: async (id: string) => { open = await store.open(id); return open; },
    snapshot: (session: SessionHandle) => ({ sessionId: session.header.sessionId }),
  };
  const services: Record<string, unknown> = { "session.runtime": sessions, "agent.runtime": { runs: { initialize } }, "actspace.host.session": { manifestDigest: provenance.manifestDigest } };
  const app = new AgentApplication({ get: (key: string) => services[key] } as never);
  return { app, store, boundarySeq, provenance, initialize, parentPath, parentBytes, close: async () => { await open?.close(); } };
}

it.each(["chat", "plan", "agent"] as const)("forks compatible older codec history with current provenance and preserves %s mode", async mode => {
  const f = await fixture({ changedCodec: true, mode });
  try {
    expect(await f.app.forkMainSession("parent", f.boundarySeq, "child")).toEqual({ sessionId: "child" });
    const child = await f.store.inspect("child");
    expect(child.header?.createdWith).toEqual({ ...f.provenance, initialAgentMode: mode });
    expect(child.header?.lineage).toMatchObject({ parentSessionId: "parent", parentBoundarySeq: f.boundarySeq, origin: "fork" });
    expect(child.header?.cwd).toBe("/workspace");
    expect(child.events).toEqual((await f.store.inspect("parent")).events);
    expect(await readFile(f.parentPath)).toEqual(f.parentBytes);
    expect(f.initialize).toHaveBeenCalledWith("child");
  } finally { await f.close(); }
});

it("refreshes profile and composition provenance even when the codec digest is unchanged", async () => {
  const f = await fixture();
  try {
    await f.app.forkMainSession("parent", f.boundarySeq, "child");
    expect((await f.store.inspect("child")).header?.createdWith).toEqual({ ...f.provenance, initialAgentMode: "agent" });
  } finally { await f.close(); }
});

it.each([{ missingRequired: true }, { openTurn: true }])("still rejects incompatible or unbalanced history: %j", async options => {
  const f = await fixture(options);
  try {
    await expect(f.app.forkMainSession("parent", f.boundarySeq, "child")).rejects.toThrow(/browse-only|balanced/);
    expect(await f.store.listSessionIds()).toEqual(["parent"]);
    expect(f.initialize).not.toHaveBeenCalled();
    expect(await readFile(f.parentPath)).toEqual(f.parentBytes);
  } finally { await f.close(); }
});
