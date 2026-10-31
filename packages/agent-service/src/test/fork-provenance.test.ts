import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCoreCodecRegistry, type EventCodec } from "@actspace/session-journal";
import { JsonlSessionStorage, sessionFileLayout } from "@actspace/session-jsonl";
import { SessionStore, type SessionHandle } from "@actspace/session-persistence";
import { AgentApplication } from "../application.js";
import { taskCodecs } from "../task-events.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const codec = (criticality: "required" | "ignorable"): EventCodec => ({
  type: "plugin/fork-test/fact", ownerPluginId: "fork-test", currentVersion: 1, criticality,
  validate: () => {},
});

const core = (type: string, data: Record<string, unknown>) => ({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null }) as never;
const taskFact = (data: Record<string, unknown>) => ({ type: "plugin/actspace.agent-service/task", eventVersion: 1, source: { ownerPluginId: "actspace.agent-service" }, data: { sessionId: "parent", ...data }, surface: null }) as never;
const runFact = (data: Record<string, unknown>) => ({ type: "plugin/actspace.agent-service/run", eventVersion: 1, source: { ownerPluginId: "actspace.agent-service" }, data: { sessionId: "parent", ...data }, surface: null }) as never;

async function fixture(options: { changedCodec?: boolean; missingRequired?: boolean; openTurn?: boolean; mode?: "chat" | "plan" | "agent"; title?: string; runs?: number } = {}) {
  const dataRoot = await mkdtemp(join(tmpdir(), "fork-provenance-")); roots.push(dataRoot);
  const oldRegistry = createCoreCodecRegistry([...(options.missingRequired ? [codec("required")] : []), ...(options.runs ? taskCodecs : [])]);
  const registry = createCoreCodecRegistry([...(options.changedCodec ? [codec("ignorable")] : []), ...(options.runs ? taskCodecs : [])]);
  const oldStore = new SessionStore({ registry: oldRegistry }, new JsonlSessionStorage({ dataRoot, runtimeId: "old", registry: oldRegistry }));
  const oldProvenance = { profileId: "old-profile", manifestDigest: "old-manifest", runtimeContractVersion: "old-runtime", plugins: [{ id: "old-plugin", version: "1" }], codecSetDigest: oldRegistry.digest, initialAgentMode: options.mode ?? "agent" };
  const parent = await oldStore.create({ sessionId: "parent", cwd: "/workspace", createdAt: "2026-10-22T00:00:00Z", lineage: null, createdWith: oldProvenance });
  for (let index = 1; index <= (options.runs ?? 0); index++) {
    const run = { taskId: `task${index}`, runId: `run${index}` };
    await parent.append(taskFact({ op: "accept", taskId: run.taskId, submissionId: `s${index}`, content: `q${index}`, continuationOf: null }));
    await parent.append(runFact({ op: "start", ...run, harness: { harnessId: "main", generationId: "g", revision: 1 }, configuration: {} }));
    await parent.append(taskFact({ op: "claim", taskId: run.taskId, runId: run.runId }));
    await parent.append(core("turn/start", { turnId: `turn${index}`, agentRunId: run.runId }));
    if (index === 1 && options.title) await parent.append(core("session/title-set", { title: options.title }));
    await parent.append(core("turn/end", { turnId: `turn${index}`, reason: "completed" }));
    await parent.append(runFact({ op: "finish", runId: run.runId, outcome: "completed", result: null }));
  }
  if (options.runs && options.openTurn) await parent.append(core("turn/start", { turnId: "running" }));
  if (!options.runs) await parent.append({ type: "turn/start", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: "t1" }, surface: null });
  if (options.missingRequired) await parent.append({ type: "plugin/fork-test/fact", eventVersion: 1, source: { ownerPluginId: "fork-test" }, data: { value: 1 }, surface: null });
  if (!options.openTurn && !options.runs) await parent.append({ type: "turn/end", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: "t1", reason: "completed" }, surface: null });
  if (options.title && !options.runs) await parent.append(core("session/title-set", { title: options.title }));
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
    resume: async (id: string) => open?.header.sessionId === id ? open : (open = await store.open(id)),
    getOpen: () => undefined,
    snapshot: (session: SessionHandle) => ({ sessionId: session.header.sessionId, metadata: { title: session.journal.events.filter(event => event.type === "session/title-set").map(event => (event.data as { title: string | null }).title).at(-1) ?? null } }),
  };
  const services: Record<string, unknown> = { "session.runtime": sessions, "agent.runtime": { runs: { initialize } }, "actspace.host.session": { manifestDigest: provenance.manifestDigest }, "session.journal": { registry } };
  const app = new AgentApplication({ get: (key: string) => services[key] } as never);
  return { app, store, boundarySeq, provenance, initialize, parentPath, parentBytes, close: async () => { await open?.close(); } };
}

it.each(["chat", "plan", "agent"] as const)("forks compatible older codec history with current provenance and preserves %s mode", async mode => {
  const f = await fixture({ changedCodec: true, mode });
  try {
    expect(await f.app.forkMainSession("parent", f.boundarySeq, "child")).toMatchObject({ sessionId: "child" });
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

it("forks from one finished reply: keeps that Turn and its run-finish fact, drops later Turns, and titles the copy", async () => {
  const f = await fixture({ runs: 2, title: "排查构建失败" });
  try {
    await f.app.forkMainSession("parent", { turnId: "turn1" }, "child");
    const child = await f.store.inspect("child");
    const types = child.events.map(event => `${event.type}:${(event.data as { op?: string }).op ?? ""}`);
    // Only the first run (accept, start, claim, turn, finish) travels; the second never appears.
    expect(types.filter(type => type.startsWith("turn/"))).toEqual(["turn/start:", "turn/end:"]);
    expect(types.slice(-2)).toEqual(["plugin/actspace.agent-service/run:finish", "session/title-set:"]);
    expect(child.events.filter(event => event.type === "plugin/actspace.agent-service/run")).toHaveLength(2);
    expect(child.header?.lineage).toMatchObject({ parentSessionId: "parent", origin: "fork", parentBoundarySeq: 6 });
    expect((await f.store.inspect("parent")).events.filter(event => event.type === "turn/end")).toHaveLength(2);
  } finally { await f.close(); }
});

it("appends （分叉） to an inherited title once and leaves untitled sessions alone", async () => {
  const titled = await fixture({ runs: 2, title: "排查构建失败" });
  try {
    await titled.app.forkMainSession("parent", { turnId: "turn2" }, "child");
    const child = await titled.store.inspect("child");
    expect(child.events.filter(event => event.type === "session/title-set").map(event => (event.data as { title: string }).title)).toEqual(["排查构建失败", "排查构建失败（分叉）"]);
  } finally { await titled.close(); }
  const untitled = await fixture({ runs: 1 });
  try {
    await untitled.app.forkMainSession("parent", { turnId: "turn1" }, "child");
    expect((await untitled.store.inspect("child")).events.some(event => event.type === "session/title-set")).toBe(false);
  } finally { await untitled.close(); }
});

it("rejects an unknown or unfinished Turn without creating a session", async () => {
  const f = await fixture({ runs: 1, openTurn: true });
  try {
    await expect(f.app.forkMainSession("parent", { turnId: "missing" }, "child")).rejects.toThrow(/找不到这一轮/);
    await expect(f.app.forkMainSession("parent", { turnId: "running" }, "child")).rejects.toThrow(/请等待当前轮次结束后再分叉/);
    expect(await f.store.listSessionIds()).toEqual(["parent"]);
  } finally { await f.close(); }
});
