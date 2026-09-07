import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAIN_AGENT_DESCRIPTOR, MainAgentInbox } from "@actspace/core-agent";
import { AgentScope } from "@actspace/core-scope";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import type { AgentLoop } from "../loop.js";
import { AgentLoopService } from "../service.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("AgentLoopService", () => {
  it("durably enqueues and claims a followup before starting the turn", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-agent-loop-service-"));
    roots.push(dataRoot);
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-test", registry });
    const session = await store.create({
      sessionId: "session-service",
      createdAt: "2026-08-29T00:00:00.000Z",
      lineage: null,
      createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest },
    });
    const listeners = new Map<string, Array<(payload: unknown) => unknown>>();
    const context = {
      on: (type: string, listener: (payload: unknown) => unknown) => { const entries = listeners.get(type) ?? []; entries.push(listener); listeners.set(type, entries); return () => undefined; },
      parallel: async (type: string, payload: unknown) => { await Promise.all((listeners.get(type) ?? []).map((listener) => listener(payload))); },
    };
    const notifications: Array<{ type: string; payload: unknown }> = [];
    context.on("agent/inbox/inserted", (payload) => { notifications.push({ type: "inserted", payload }); });
    context.on("agent/inbox/claimed", (payload) => { notifications.push({ type: "claimed", payload }); });
    let disposed = 0;
    const loop = {
      active: false,
      abort: () => false,
      quiesce: () => undefined,
      waitForIdle: async () => undefined,
      runTurn: async (input: { content: unknown; messageId?: string }) => {
        await session.append(core("turn/start", { turnId: "turn-1", agentRunId: "run-1", mode: "agent" }));
        return { agentRunId: "run-1", turnId: "turn-1", reason: "completed" as const, steps: 1, finalText: "ok" };
      },
    } as unknown as AgentLoop;
    const service = new AgentLoopService({
      context,
      create: async () => ({ descriptor: MAIN_AGENT_DESCRIPTOR, scope: new AgentScope("main:session-service", undefined, "main:session-service"), session, inbox: new MainAgentInbox(session), loop, dispose: async () => { disposed += 1; await session.close(); } }),
    });

    const agent = await service.attach(session);
    const result = await agent.followup("hello", { messageId: "message-1" });
    expect(result.finalText).toBe("ok");
    expect(agent.agentId).toBe("main:session-service");
    expect(session.journal.events.map((event) => event.type)).toEqual(["agent/inbox/spliced", "agent/inbox/spliced", "turn/start"]);
    expect(session.journal.events.map((event) => event.seq)).toEqual([0, 1, 2]);
    expect(notifications.map((item) => item.type)).toEqual(["inserted", "claimed"]);
    expect(session.journal.surface.entries).toHaveLength(1);

    await service.dispose();
    await service.dispose();
    expect(disposed).toBe(1);
  });

  it("keeps two Agent subjects isolated and ignores observer failures", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-agent-loop-two-agent-"));
    roots.push(dataRoot);
    const registry = createCoreCodecRegistry();
    const store = new SessionStore({ dataRoot, runtimeId: "runtime-test", registry });
    const sessions = await Promise.all(["one", "two"].map((id) => store.create({
      sessionId: `session-${id}`,
      createdAt: "2026-08-29T00:00:00.000Z",
      lineage: null,
      createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest },
    })));
    const listeners = new Map<string, Array<(payload: unknown) => unknown>>();
    const context = {
      on: (type: string, listener: (payload: unknown) => unknown) => { const entries = listeners.get(type) ?? []; entries.push(listener); listeners.set(type, entries); return () => undefined; },
      parallel: async (type: string, payload: unknown) => { await Promise.all((listeners.get(type) ?? []).map((listener) => listener(payload))); },
    };
    const seen: string[] = [];
    context.on("agent/inbox/inserted", (payload) => { seen.push(String((payload as { agentId: string }).agentId)); });
    context.on("agent/inbox/inserted", () => { throw new Error("observer failure"); });
    const service = new AgentLoopService({
      context,
      create: async (session) => {
        const id = `main:${session.header.sessionId}`;
        const scope = new AgentScope(id, undefined, id);
        const loop = { active: false, abort: () => false, quiesce: () => undefined, waitForIdle: async () => undefined, runTurn: async () => ({ agentRunId: id, turnId: id, reason: "completed" as const, steps: 1, finalText: id }) } as unknown as AgentLoop;
        return { descriptor: MAIN_AGENT_DESCRIPTOR, scope, session, inbox: new MainAgentInbox(session), loop, dispose: async () => { await session.close(); } };
      },
    });

    const [first, second] = await Promise.all(sessions.map((session) => service.attach(session)));
    const [firstResult, secondResult] = await Promise.all([first.followup("one"), second.followup("two")]);
    expect(firstResult.finalText).toBe("main:session-one");
    expect(secondResult.finalText).toBe("main:session-two");
    expect(seen.sort()).toEqual(["main:session-one", "main:session-two"]);
    expect(sessions[0].journal.events.every((event) => event.data === null || !JSON.stringify(event.data).includes("session-two"))).toBe(true);
    expect(sessions[1].journal.events.every((event) => event.data === null || !JSON.stringify(event.data).includes("session-one"))).toBe(true);
    await service.dispose();
  });
});

function core(type: string, data: unknown) {
  return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never;
}
