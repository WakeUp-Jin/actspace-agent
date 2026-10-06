import { expect, it } from "vitest";
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
