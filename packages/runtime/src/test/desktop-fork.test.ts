import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { CordisContext } from "@actspace/cordis-adapter";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import type { SessionHandle } from "@actspace/session-persistence";
import { DesktopAppService } from "@actspace/desktop-app";
import { RuntimeSessionController } from "../runtime/session-controller.js";

it("owns a Chat fork before first send, publishes changes and releases its writer on shutdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-fork-"));
  const sessions = new RuntimeSessionController({ dataRoot: root, runtimeId: "fork-test", registry: createCoreCodecRegistry(), profileId: "test", manifestDigest: "test", plugins: [] });
  const attached = new Map<string, SessionHandle>();
  const runs = {
    attach: async (session: SessionHandle) => { attached.set(session.header.sessionId, session); },
    run: async (sessionId: string) => {
      const session = attached.get(sessionId)!;
      expect(await sessions.resume(sessionId)).toBe(session);
      await session.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: "fork replied" }, surface: null });
      await session.flush();
      return { sessionId, snapshot: sessions.snapshot(session) };
    },
  };
  const services = new Map<string, unknown>([["session.runtime", sessions], ["agent.runtime", { runs }], ["compaction.runtime", {}], ["llm.service", {}]]);
  const app = new DesktopAppService({ get: (id: string) => services.get(id) } as CordisContext);
  try {
    const parent = await sessions.create("parent", "/workspace", "chat");
    await app.updateSessionMetadata("parent", { title: "parent" });
    await sessions.browseSessions(); // Preload the index before the child exists.
    const fork = await app.forkMainSession("parent", parent.journal.events.length - 1, "child");
    expect(fork.agentForm).toBe("chat");
    expect(fork.lineage).toMatchObject({ origin: "fork", parentSessionId: "parent" });
    await expect(app.runTurn({ sessionId: "child", content: "hello", agentRunId: "fork-run" })).resolves.toMatchObject({ snapshot: { metadata: { title: "fork replied" } } });
    expect(sessions.getOpen("child")).toBe(attached.get("child"));
    expect((await sessions.browseSessions()).items.find(item => item.sessionId === "child")?.metadata.title).toBe("fork replied");
    await sessions.closeAll();
    const reopened = await sessions.store.open("child");
    await reopened.close();
  } finally {
    await app.dispose();
    await sessions.closeAll();
    for (const session of attached.values()) await session.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
