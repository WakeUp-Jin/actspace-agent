import type { SessionHandle } from "@actspace/session-persistence";
import { coreEvent, type RuntimeAgentMode, type RuntimeSessionSnapshot } from "@actspace/shared/runtime-v2";

/** Shared durable mutations; callers reserve the Session scheduling slot first. */
export class SessionModeWriter {
  readonly #blocked = new Set<string>();
  assertAvailable(sessionId: string): void {
    if (this.#blocked.has(sessionId)) throw new Error("AGENT_MODE_RECOVERY_REQUIRED");
  }
  async change(session: SessionHandle, mode: RuntimeAgentMode, snapshot: (session: SessionHandle) => RuntimeSessionSnapshot, source: string): Promise<RuntimeSessionSnapshot> {
    this.assertAvailable(session.header.sessionId);
    if (mode !== "chat" && mode !== "plan" && mode !== "agent") throw new Error("INVALID_AGENT_MODE");
    const before = snapshot(session);
    if ((before.agentMode ?? "agent") === mode) return before;
    if (mode !== "chat" && before.workspaceRoot === null) throw new Error("WORKSPACE_REQUIRED");
    try {
      await session.append(coreEvent("agent/mode-set", { mode, revision: (before.agentModeRevision ?? 0) + 1, changedAt: new Date().toISOString(), source }));
      await session.flush();
    } catch (error) { this.#blocked.add(session.header.sessionId); throw error; }
    return snapshot(session);
  }
}

export async function setInitialSessionTitle(session: SessionHandle, title: string | undefined): Promise<void> {
  if (title === undefined || session.journal.latestEvent("session/title-set") !== undefined) return;
  await session.append(coreEvent("session/title-set", { title: title.trim().slice(0, 160) || null }));
  await session.flush();
}
