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
    get: () => undefined,
    attach: async (session: SessionHandle) => { attached.set(session.header.sessionId, session); },
    run: async (sessionId: string) => {
      const session = attached.get(sessionId)!;
      expect(await sessions.resume(sessionId)).toBe(session);
      await session.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: "fork replied" }, surface: null });
      await session.flush();
      return { sessionId, snapshot: sessions.snapshot(session) };
    },
  };
  let backgroundRunning = false;
  const services = new Map<string, unknown>([["session.runtime", sessions], ["agent.runtime", { runs }], ["compaction.runtime", {}], ["llm.service", {}], ["tools.shell-tools", { hasRunningBackgroundTask: (sessionId: string) => sessionId === "parent" && backgroundRunning }]]);
  const app = new DesktopAppService({ get: (id: string) => services.get(id) } as CordisContext);
  try {
    const parent = await sessions.create("parent", "/workspace", "chat");
    const unboundChat = await sessions.create("unbound-chat", undefined, "chat");
    await expect(app.updateSessionAgentMode("unbound-chat", "plan", 0)).rejects.toThrow("WORKSPACE_REQUIRED");
    expect(sessions.snapshot(unboundChat)).toMatchObject({ workspaceRoot: null, agentMode: "chat", agentModeRevision: 0 });
    await app.updateSessionMetadata("parent", { title: "parent" });
    const beforeModeSwitch = parent.journal.events.length - 1;
    backgroundRunning = true;
    await expect(app.updateSessionAgentMode("parent", "plan", 0)).rejects.toThrow("SESSION_BUSY");
    backgroundRunning = false;
    const changed = await app.updateSessionAgentMode("parent", "plan", 0);
    expect(changed).toMatchObject({ agentMode: "plan", agentModeRevision: 1 });
    await expect(app.updateSessionAgentMode("parent", "agent", 0)).rejects.toThrow("AGENT_MODE_CONFLICT");
    await sessions.browseSessions(); // Preload the index before the child exists.
    const fork = await app.forkMainSession("parent", beforeModeSwitch, "child");
    expect(fork.agentFormId).toBe("actspace.main");
    expect(fork.agentMode).toBe("chat");
    expect(fork.lineage).toMatchObject({ origin: "fork", parentSessionId: "parent" });
    await expect(app.runTurn({ sessionId: "child", content: "hello", agentRunId: "fork-run" })).resolves.toMatchObject({ snapshot: { metadata: { title: "fork replied" } } });
    expect(sessions.getOpen("child")).toBe(attached.get("child"));
    expect((await sessions.browseSessions()).items.find(item => item.sessionId === "child")?.metadata.title).toBe("fork replied");
    await sessions.closeAll();
    expect(await sessions.inspect("parent")).toMatchObject({ agentMode: "plan", agentModeRevision: 1 });
    expect(await sessions.inspect("child")).toMatchObject({ agentMode: "chat", agentModeRevision: 0 });
    expect((await sessions.browseSessions()).items.find(item => item.sessionId === "parent")).toMatchObject({ agentMode: "plan", agentModeRevision: 1 });
    const reopened = await sessions.store.open("child");
    await reopened.close();
  } finally {
    await app.dispose();
    await sessions.closeAll();
    for (const session of attached.values()) await session.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
