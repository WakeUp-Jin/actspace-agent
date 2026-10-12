import { expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { sessionFileLayout } from "@actspace/session-jsonl";
import { JsonlSessionStorageService } from "@actspace/session-jsonl/plugin";
import { CordisContextClass } from "@actspace/cordis-adapter";
import type { ToolPreparedEnvironment } from "@actspace/tools-runtime";
import { createContextHost } from "./context-host.js";
import { RuntimeSessionController } from "../session/session-controller.js";

it("exposes real JSONL files, normalizes only files and does not fabricate ephemeral history", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "context-host-")); const registry = createCoreCodecRegistry();
  const ctx = new CordisContextClass();
  ctx.provide("actspace.host.session", { dataRoot, runtimeId: "test" });
  ctx.provide("session.journal", { registry });
  const storage = new JsonlSessionStorageService(ctx);
  const sessions = new RuntimeSessionController({ dataRoot, runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] }, new SessionStore({ registry }, storage));
  const tools = { workspaceRoot: dataRoot, createArtifact: async () => { throw Error("unused"); } } as unknown as Omit<ToolPreparedEnvironment, "journal">;
  const host = createContextHost(() => sessions, tools);
  try {
    await sessions.create("persisted", dataRoot); await sessions.createEphemeral("ephemeral", dataRoot);
    await writeFile(join(dataRoot, "AGENTS.md"), "rules"); await mkdir(join(dataRoot, "directory"));
    expect(await host.normalizeFile("persisted", "AGENTS.md")).toMatch(/AGENTS\.md$/);
    expect(await host.normalizeFile("persisted", "directory")).toBeUndefined();
    expect(await host.normalizeFile("unknown", "AGENTS.md")).toBeUndefined();
    expect(await host.historyPath("persisted")).toBe(await host.normalizeFile("persisted", sessionFileLayout(dataRoot, "persisted").journalPath));
    expect(await host.historyPath("ephemeral")).toBeUndefined();
    expect(await host.historyPath("missing")).toBeUndefined();
  } finally { await sessions.closeAll(); await storage.close(); await ctx.fiber.dispose(); await rm(dataRoot, { recursive: true, force: true }); }
});


it("plugin query capabilities preserve durable watermarks without initializing global history on flush", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "context-query-")); const registry = createCoreCodecRegistry();
  const ctx = new CordisContextClass();
  ctx.provide("actspace.host.session", { dataRoot, runtimeId: "test" });
  ctx.provide("session.journal", { registry });
  const storage = new JsonlSessionStorageService(ctx);
  const store = new SessionStore({ registry }, storage);
  const sessions = new RuntimeSessionController({ dataRoot, runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] }, store);
  const lists = vi.spyOn(store, "listSessionIds");
  try {
    const session = await sessions.create("persisted", dataRoot);
    await session.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: "Indexed title" }, surface: null });
    await session.flush();
    expect(lists).not.toHaveBeenCalled();
    const durable = session.durableSeq!;
    const sources = await sessions.querySources();
    expect(sources?.sources).toHaveLength(1);
    expect(sources?.sources[0]?.throughSeq).toBe(durable);
    // Simulate provider-visible bytes ahead of this process's fsync barrier.
    const original = storage.querySources.bind(storage);
    const sourceRead = vi.spyOn(storage, "querySources").mockImplementation(async ids => (await original(ids)).map(source => ({ ...source, throughSeq: durable + 100 })));
    expect((await sessions.querySources())?.sources[0]?.throughSeq).toBe(durable);
    sourceRead.mockRestore();
    const batch = await sessions.readEventBatch("persisted", { throughSeq: durable });
    expect(batch.done).toBe(true);
    expect(batch.events.some(event => event.type === "session/title-set")).toBe(true);
    await mkdir(join(dataRoot, "sessions-v2", "broken"));
    await writeFile(join(dataRoot, "sessions-v2", "broken", "journal.jsonl"), "not-json\n");
    const partial = await sessions.querySources();
    expect(partial?.sources.map(source => source.header.sessionId)).toEqual(["persisted"]);
    expect(partial?.failedSessionIds).toEqual(["broken"]);

  } finally { await sessions.closeAll(); await storage.close(); await ctx.fiber.dispose(); await rm(dataRoot, { recursive: true, force: true }); }
});

it("single-source queries avoid inventory and keep owned append tails behind the durable boundary", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "context-single-query-")); const registry = createCoreCodecRegistry();
  const ctx = new CordisContextClass();
  ctx.provide("actspace.host.session", { dataRoot, runtimeId: "test" }); ctx.provide("session.journal", { registry });
  const storage = new JsonlSessionStorageService(ctx);
  const store = new SessionStore({ registry }, storage);
  const sessions = new RuntimeSessionController({ dataRoot, runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] }, store);
  const lists = vi.spyOn(store, "listSessionIds");
  try {
    const session = await sessions.create("owned", dataRoot);
    await session.flush();
    const before = await sessions.querySource("owned");
    expect(before?.appendOnlyToken).toBeTruthy();
    const durable = session.durableSeq!;
    await session.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: "tail" }, surface: null });
    await session.flush();
    // Real Provider bytes advanced; withhold Runtime publication of that barrier.
    const boundary = vi.spyOn(session, "durableSeq", "get").mockReturnValue(durable);
    expect((await sessions.querySource("owned"))?.stamp).toBe(before?.stamp);
    boundary.mockRestore();
    expect((await sessions.querySource("owned"))?.throughSeq).toBeGreaterThan(durable);
    expect(lists).not.toHaveBeenCalled();
  } finally { await sessions.closeAll(); await storage.close(); await ctx.fiber.dispose(); await rm(dataRoot, { recursive: true, force: true }); }
});
