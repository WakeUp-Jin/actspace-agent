import type { SessionHandle } from "@actspace/session-persistence";
import type { RuntimeV2AgentMode, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";

/** Shared durable mutations; callers reserve the Session scheduling slot first. */
export class SessionModeWriter {
  readonly #blocked = new Set<string>();
  assertAvailable(sessionId: string): void {
    if (this.#blocked.has(sessionId)) throw new Error("AGENT_MODE_RECOVERY_REQUIRED");
  }
  async change(session: SessionHandle, mode: RuntimeV2AgentMode, snapshot: (session: SessionHandle) => RuntimeV2SessionSnapshot, source: string): Promise<RuntimeV2SessionSnapshot> {
    this.assertAvailable(session.header.sessionId);
    if (mode !== "chat" && mode !== "plan" && mode !== "agent") throw new Error("INVALID_AGENT_MODE");
    const before = snapshot(session);
    if ((before.agentMode ?? "agent") === mode) return before;
    if (mode !== "chat" && before.workspaceRoot === null) throw new Error("WORKSPACE_REQUIRED");
    try {
      await session.append({ type: "agent/mode-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { mode, revision: (before.agentModeRevision ?? 0) + 1, changedAt: new Date().toISOString(), source }, surface: null });
      await session.flush();
    } catch (error) { this.#blocked.add(session.header.sessionId); throw error; }
    return snapshot(session);
  }
}

export async function setInitialSessionTitle(session: SessionHandle, title: string | undefined): Promise<void> {
  if (title === undefined || session.journal.events.some(event => event.type === "session/title-set")) return;
  await session.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: title.trim().slice(0, 160) || null }, surface: null });
  await session.flush();
}
