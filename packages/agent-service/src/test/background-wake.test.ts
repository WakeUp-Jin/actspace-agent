import { AgentScope } from "@actspace/core-scope";
import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { isBackgroundWake, type RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { taskCodecs } from "../task-events.js";
import { TaskLedger } from "../task-ledger.js";
import { SessionRunManager, type RunExecutionResult } from "../run-manager.js";

async function fixture(options: { readonly outcome?: (content: RuntimeV2JsonValue) => RunExecutionResult; readonly canStart?: () => boolean } = {}) {
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec));
  const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "wake", createdAt: "2026-10-22T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
  const ledger = await TaskLedger.open(session);
  const state = { pending: false, executed: [] as RuntimeV2JsonValue[] };
  const factory = { create: async (input: { readonly initial: { readonly content: RuntimeV2JsonValue } }) => ({
    execute: async () => { state.executed.push(input.initial.content); if (isBackgroundWake(input.initial.content)) state.pending = false; return options.outcome?.(input.initial.content) ?? { outcome: "completed" as const, value: null }; },
    dispose: async () => {},
  }) };
  const manager = new SessionRunManager({ ledger, harnessId: "main", readConfiguration: () => ({ mode: "agent" }), hasPendingNotifications: () => state.pending, canStart: options.canStart,
    acquire: async () => ({ scope: new AgentScope("wake-run"), context: {}, harnessId: "main", generationId: "g1", revision: 1, getService: <T>() => factory as T, release: async () => {} }) });
  const settle = async () => { for (let i = 0; i < 20; i++) { await manager.waitForIdle(); await new Promise(resolve => setTimeout(resolve, 0)); } };
  return { manager, ledger, session, state, settle };
}
const wakes = (contents: readonly RuntimeV2JsonValue[]) => contents.filter(content => isBackgroundWake(content)).length;

describe("background wake", () => {
  it("submits one wake task for an idle Session with pending notifications", async () => {
    const { manager, ledger, session, state, settle } = await fixture();
    state.pending = true;
    manager.wake(); manager.wake();
    await settle();
    expect(wakes(state.executed)).toBe(1);
    expect(ledger.snapshot().tasks).toEqual([expect.objectContaining({ submissionId: expect.stringMatching(/^background-wake:/), state: "completed" })]);
    expect(session.journal.events.filter(event => event.type === "user/message")).toEqual([]);
    await manager.dispose(); await session.close();
  });

  it("does nothing without pending notifications, while paused or while draining", async () => {
    const idle = await fixture();
    idle.manager.wake(); await idle.settle();
    expect(idle.state.executed).toEqual([]);

    const paused = await fixture();
    await paused.ledger.pause(); paused.state.pending = true;
    paused.manager.wake(); await paused.settle();
    expect(paused.state.executed).toEqual([]);

    const draining = await fixture({ canStart: () => false });
    draining.state.pending = true;
    draining.manager.wake(); await draining.settle();
    expect(draining.state.executed).toEqual([]);
    for (const value of [idle, paused, draining]) { await value.manager.dispose(); await value.session.close(); }
  });

  it("lets queued user work read the notification instead of waking", async () => {
    const { manager, state, session, settle } = await fixture();
    state.pending = true;
    await manager.submit("user", "hello");
    await settle();
    expect(state.executed[0]).toBe("hello");
    // The fake Run does not claim notifications; a wake follows the user Run.
    expect(wakes(state.executed)).toBe(1);
    await manager.dispose(); await session.close();
  });

  it("wakes after a Run settles when a notification arrived during its last step", async () => {
    const { manager, state, session, settle } = await fixture({ outcome: content => { if (content === "hello") state.pending = true; return { outcome: "completed", value: null }; } });
    await manager.submit("user", "hello");
    await settle();
    expect(state.executed).toEqual(["hello", { kind: "background-wake" }]);
    await manager.dispose(); await session.close();
  });

  it("does not retry a wake Run that failed until the user acts", async () => {
    const { manager, state, session, settle } = await fixture({ outcome: content => isBackgroundWake(content) ? (state.pending = true, { outcome: "failed", value: null }) : { outcome: "completed", value: null } });
    state.pending = true;
    manager.wake(); await settle();
    expect(wakes(state.executed)).toBe(1);
    manager.wake(); await settle();
    expect(wakes(state.executed)).toBe(1);
    await manager.dispose(); await session.close();
  });
});
