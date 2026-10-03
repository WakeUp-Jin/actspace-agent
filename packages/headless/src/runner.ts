import type { RuntimeV2AgentMode, RuntimeV2JsonValue, RuntimeV2RunTurnResponse, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
type HeadlessRunService = {
  attach(session: SessionHandle): Promise<unknown>;
  run(sessionId: string, input: { content: RuntimeV2JsonValue; model?: string }, signal?: AbortSignal): Promise<RuntimeV2RunTurnResponse>;
  abort(sessionId: string): boolean;
  service: { exclusive<T>(sessionId: string, operation: () => Promise<T>): Promise<T> };
};
import type { SessionHandle } from "@actspace/session-persistence";
import { emitContained, type CordisContext } from "@actspace/cordis-adapter";

export const HEADLESS_HOST_PORT_ID = "actspace.host.headless" as const;

export type HeadlessSessionService = {
  readonly create: (sessionId?: string, cwd?: string) => Promise<SessionHandle>;
  readonly createEphemeral: (sessionId?: string, cwd?: string) => Promise<SessionHandle>;
  readonly resume: (sessionId: string) => Promise<SessionHandle>;
  readonly snapshot: (session: SessionHandle) => RuntimeV2SessionSnapshot;
};

export type HeadlessHostPort = {
  readonly enabled?: true;
  readonly content: RuntimeV2JsonValue;
  readonly persistent: boolean;
  readonly workspaceRoot?: string;
  readonly sessionId?: string;
  readonly title?: string;
  readonly model?: string;
  /** Optional API mode; CLI leaves this unset and resumes the saved mode. */
  readonly mode?: RuntimeV2AgentMode;
  readonly signal?: AbortSignal;
  readonly onSessionCreated?: (sessionId: string, abort: () => boolean) => void;
  /** DSH-style bounded exit request; the launcher decides when to terminate. */
  readonly appExit?: (code: number) => void;
};

export type DisabledHeadlessHostPort = { readonly enabled: false };

export type HeadlessRunResult = RuntimeV2RunTurnResponse & { readonly session: SessionHandle };

export class HeadlessRunner {
  constructor(private readonly options: { readonly host: HeadlessHostPort; readonly sessions: HeadlessSessionService; readonly agents: HeadlessRunService; readonly context?: CordisContext }) {}

  async run(): Promise<HeadlessRunResult> {
    const { host, sessions, agents } = this.options;
    const session = host.sessionId === undefined
      ? host.persistent ? await sessions.create(undefined, host.workspaceRoot) : await sessions.createEphemeral(undefined, host.workspaceRoot)
      : await sessions.resume(host.sessionId);
    if (host.title !== undefined && session.journal.events.every((event) => event.type !== "session/title-set")) {
      await session.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: host.title }, surface: null } as never);
    }
    await agents.attach(session);
    const sessionId = session.header.sessionId;
    const controller = new AbortController();
    const abort = () => { controller.abort(host.signal?.reason ?? "host-abort"); return agents.abort(sessionId); };
    const currentMode = sessions.snapshot(session).agentMode ?? "agent";
    const mode = host.mode ?? currentMode;
    if (mode !== "chat" && mode !== "plan" && mode !== "agent") throw new Error("INVALID_AGENT_MODE");
    if (mode !== currentMode) {
      if (mode !== "chat" && sessions.snapshot(session).workspaceRoot === null) throw new Error("WORKSPACE_REQUIRED");
      await agents.service.exclusive(sessionId, async () => {
      await session.append({ type: "agent/mode-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { mode, revision: (sessions.snapshot(session).agentModeRevision ?? 0) + 1, changedAt: new Date().toISOString(), source: "headless" }, surface: null });
      await session.flush();
      });
    }
    host.onSessionCreated?.(sessionId, abort);
    const started = Date.now();
    if (host.signal?.aborted) abort();
    else host.signal?.addEventListener("abort", abort, { once: true });
    try {
      await this.notify("headless/started", { sessionId: session.header.sessionId, agentId: `main:${sessionId}` });
      const result = await agents.run(sessionId, { content: host.content, model: host.model }, controller.signal);
      await session.flush();
      host.appExit?.(result.reason === "completed" ? 0 : result.reason === "aborted" ? 130 : 1);
      await this.notify("headless/completed", { sessionId: session.header.sessionId, agentId: `main:${sessionId}`, reason: result.reason });
      return Object.freeze({ session, ...result, snapshot: sessions.snapshot(session), durationMs: Date.now() - started });
    } catch (error) {
      await this.notify("headless/failed", { sessionId: session.header.sessionId, agentId: `main:${sessionId}`, error: error instanceof Error ? error.message : String(error) });
      host.appExit?.(host.signal?.aborted ? 130 : 1);
      throw error;
    } finally {
      host.signal?.removeEventListener("abort", abort);
    }
  }

  private async notify(type: string, payload: unknown): Promise<void> {
    await emitContained(this.options.context, type, payload);
  }
}
