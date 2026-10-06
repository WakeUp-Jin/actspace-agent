import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContextEngine } from "@actspace/context";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { JsonlSessionStorage, sessionFileLayout } from "@actspace/session-jsonl";

it("converts an existing persisted Session without changing bytes, seq or Surface", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "context-compatibility-"));
  const registry = createCoreCodecRegistry();
  const storage = new JsonlSessionStorage({ dataRoot, runtimeId: "fixture", registry });
  const store = new SessionStore({ registry }, storage);
  const session = await store.create({ sessionId: "old-session", createdAt: "2026-01-01T00:00:00Z", lineage: null,
    createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
  try {
    await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: "old" },
      surface: { kind: "append", node: { kind: "user", messageId: "old", content: "Old conversation" } } });
    await session.flush();
    const path = sessionFileLayout(dataRoot, session.header.sessionId).journalPath;
    const bytes = await readFile(path); const seq = session.lastSeq; const surface = session.journal.surface;
    const engine = new ContextEngine({ resolve: request => ({ request,
      content: { system: { sections: [], modelFacts: [] }, conversation: session.journal.surface, supplements: [], tools: [] },
      status: { throughJournalSeq: session.lastSeq, cycle: 0, paths: [], facts: [], plugins: {} },
    }) });
    const input = await engine.toLlmInput(await engine.getContext({ sessionId: session.header.sessionId, requestId: "r", routeId: "test", model: "test", options: {} }));
    expect(input.messages).toEqual([{ role: "user", content: "Old conversation" }]);
    expect(session.lastSeq).toBe(seq); expect(session.journal.surface).toEqual(surface);
    expect(await readFile(path)).toEqual(bytes);
  } finally { await session.close(); await storage.close(); await rm(dataRoot, { recursive: true, force: true }); }
});

it("copies the typed sleeping-index reference during a real JSONL fork without rewriting parent text", async () => {
  const { codecs, STATE_EVENT, CONTEXT_OWNER } = await import("@actspace/context/codec");
  const dataRoot = await mkdtemp(join(tmpdir(), "context-fork-"));
  const registry = createCoreCodecRegistry(); codecs.forEach(codec => registry.register(codec));
  const storage = new JsonlSessionStorage({ dataRoot, runtimeId: "fixture", registry });
  const copies: string[] = [];
  const store = new SessionStore({ registry, forkArtifacts: { copyForSession: async (_parent, _child, id) => { copies.push(id); return { artifactId: `child-${id}` }; }, deleteForSession: async () => {} } }, storage);
  const createdWith = { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest };
  const parent = await store.create({ sessionId: "parent", createdAt: new Date().toISOString(), lineage: null, createdWith });
  try {
    await parent.append({ type: STATE_EVENT, eventVersion: 1, source: { ownerPluginId: CONTEXT_OWNER }, surface: null, data: { op: "index", index: { artifactId: "sleeping", mediaType: "text/plain", size: 1, sha256: "hash" }, indexDigest: "digest" } });
    await parent.flush(); const path = sessionFileLayout(dataRoot, "parent").journalPath; const bytes = await readFile(path);
    const child = await store.fork({ parentSessionId: "parent", newSessionId: "child", boundarySeq: parent.lastSeq, createdAt: new Date().toISOString(), createdWith });
    try {
      expect(copies).toEqual(["sleeping"]);
      expect(child.journal.events[0]!.data).toMatchObject({ index: { artifactId: "child-sleeping" } });
      expect(await readFile(path)).toEqual(bytes);
      expect(child.journal.surface).toEqual(parent.journal.surface);
    } finally { await child.close(); }
  } finally { await parent.close(); await storage.close(); await rm(dataRoot, { recursive: true, force: true }); }
});
