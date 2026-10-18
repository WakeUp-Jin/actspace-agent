import { expect, it, vi } from "vitest";
import type { ManagedContextProjection, ContextPanelView } from "@actspace/shared";
import { ContextPanelService } from "../runtime-v2/context-panel-service";
import type { UsageReadModelService } from "../runtime-v2/usage-read-model";

function fixture() {
  let projection: ManagedContextProjection | null = {
    schemaVersion: 1, identity: { sessionId: "s", logicalAgentScopeId: "main" }, basis: "current-context", contextRevision: 1,
    throughJournalSeq: 10, surfaceGeneration: 0, instanceGeneration: "g1", model: null,
    manifest: { schemaVersion: 1, estimatorVersion: "1", comparable: true, totalEstimatedTokens: 0, buckets: {}, entries: [] },
    content: { system: { sections: [], modelFacts: [] }, conversation: { replaceGeneration: 0, entries: [] }, supplements: [], tools: [] },
    status: { throughJournalSeq: 10, cycle: 2, facts: [], plugins: { "actspace.context.owners": ["actspace.context-disclosure"] },
      paths: Array.from({ length: 205 }, (_, i) => ({ id: String(i), path: `/src/${String(i).padStart(3, "0")}.ts`, owners: ["tool"], visibility: i < 100 ? "active" : "sleeping", readsInCycle: 1, addedCycle: 1, history: { sourceEventSeqs: [i], sessionId: "s" } })) },
  };
  const runtime = { readContextProjection: vi.fn(async () => projection), readContextEntryText: vi.fn(), sessionQuerySource: vi.fn(async () => null) };
  const service = new ContextPanelService(runtime as never, {} as UsageReadModelService);
  return { service, runtime, set: (value: ManagedContextProjection | null) => { projection = value; }, current: () => projection! };
}

it("exposes metadata-only disclosure totals and bounded pages without content reads", async () => {
  const f = fixture(); const view = await f.service.describe({ sessionId: "s" }) as ContextPanelView;
  expect(view.disclosure).toMatchObject({ status: "ready", activeCount: 100, sleepingCount: 105, activeLimit: 100, cycle: 2 });
  const revision = view.currentVersion!;
  const a = await f.service.listPaths({ sessionId: "s", revision, visibility: "sleeping", limit: 1000 });
  const b = await f.service.listPaths({ sessionId: "s", revision, visibility: "sleeping", cursor: a.nextCursor });
  expect(a.paths).toHaveLength(100); expect(b.paths).toHaveLength(5); expect(b.nextCursor).toBeUndefined();
  expect(new Set([...a.paths, ...b.paths].map(path => path.id)).size).toBe(105);
  expect(a.paths[0]).not.toHaveProperty("history");
  expect(f.runtime.readContextEntryText).not.toHaveBeenCalled();
  await expect(f.service.listPaths({ sessionId: "s", revision, visibility: "active", cursor: a.nextCursor })).rejects.toThrow("cursor invalid");
  await expect(f.service.listPaths({ sessionId: "s", revision, visibility: "sleeping", cursor: "bad" })).rejects.toThrow("cursor invalid");
  await expect(f.service.listPaths({ sessionId: "s", revision, visibility: "sleeping", limit: 0 })).rejects.toThrow("limit");
});

it("rejects pages after a revision or instance change, even if the seq goes backwards", async () => {
  const f = fixture(); const view = await f.service.describe({ sessionId: "s" }) as ContextPanelView;
  f.set({ ...f.current(), contextRevision: 2 });
  await expect(f.service.listPaths({ sessionId: "s", revision: view.currentVersion!, visibility: "active" })).rejects.toThrow("stale");
  f.set({ ...f.current(), contextRevision: 1, instanceGeneration: "g2", throughJournalSeq: 1 });
  await expect(f.service.listPaths({ sessionId: "s", revision: view.currentVersion!, visibility: "active" })).rejects.toThrow("stale");
  const fresh = await f.service.describe({ sessionId: "s", versionToken: view.versionToken }) as ContextPanelView;
  expect(fresh.currentVersion).not.toBe(view.currentVersion);
});

it("distinguishes unavailable disclosure from an empty live list and keeps conditional reads", async () => {
  const f = fixture(); f.set({ ...f.current(), status: { ...f.current().status, paths: [] } });
  const empty = await f.service.describe({ sessionId: "s" }) as ContextPanelView;
  expect(empty.disclosure).toMatchObject({ status: "ready", activeCount: 0, sleepingCount: 0 });
  expect(await f.service.describe({ sessionId: "s", versionToken: empty.versionToken })).toMatchObject({ notModified: true });
  f.set(null);
  const absent = await f.service.describe({ sessionId: "s", versionToken: empty.versionToken }) as ContextPanelView;
  expect(absent.disclosure).toEqual({ status: "unavailable" });
  await expect(f.service.listPaths({ sessionId: "s", revision: absent.currentVersion!, visibility: "active" })).rejects.toThrow("unavailable");
});

it("forecasts the next compaction with the same rule the engine applies", async () => {
  const f = fixture();
  const path = (id: string, visibility: "active" | "sleeping", readsInCycle: number, addedCycle: number) => ({ id, path: `/src/${id}.ts`, owners: ["tool"], visibility, readsInCycle, addedCycle });
  f.set({ ...f.current(), status: { ...f.current().status, cycle: 3, paths: [
    path("kept", "active", 2, 1), path("unread", "active", 0, 1), path("fresh", "active", 0, 3),
    path("reread", "sleeping", 1, 0), path("idle", "sleeping", 0, 0),
  ] as never } });
  const view = await f.service.describe({ sessionId: "s" }) as ContextPanelView;
  const revision = view.currentVersion!;
  const active = await f.service.listPaths({ sessionId: "s", revision, visibility: "active" });
  const sleeping = await f.service.listPaths({ sessionId: "s", revision, visibility: "sleeping" });
  const forecast = Object.fromEntries([...active.paths, ...sleeping.paths].map(entry => [entry.id, entry.nextCompaction ?? null]));
  expect(forecast).toEqual({ kept: null, unread: "sleep", fresh: null, reread: "wake", idle: null });
});
