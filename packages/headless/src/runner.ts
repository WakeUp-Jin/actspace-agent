import type { RuntimeV2JsonValue, RuntimeV2RunTurnResponse, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import type { AgentLoopService } from "@actspace/core-agent-loop";
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
  readonly signal?: AbortSignal;
  readonly onSessionCreated?: (sessionId: string, abort: () => boolean) => void;
  /** DSH-style bounded exit request; the launcher decides when to terminate. */
  readonly appExit?: (code: number) => void;
};

export type DisabledHeadlessHostPort = { readonly enabled: false };

export type HeadlessRunResult = RuntimeV2RunTurnResponse & { readonly session: SessionHandle };

export class HeadlessRunner {
  constructor(private readonly options: { readonly host: HeadlessHostPort; readonly sessions: HeadlessSessionService; readonly agents: AgentLoopService; readonly context?: CordisContext }) {}

  async run(): Promise<HeadlessRunResult> {
    const { host, sessions, agents } = this.options;
    const session = host.sessionId === undefined
      ? host.persistent ? await sessions.create(undefined, host.workspaceRoot) : await sessions.createEphemeral(undefined, host.workspaceRoot)
      : await sessions.resume(host.sessionId);
    if (host.title !== undefined && session.journal.events.every((event) => event.type !== "session/title-set")) {
      await session.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: host.title }, surface: null } as never);
    }
    const agent = await agents.attach(session);
    host.onSessionCreated?.(session.header.sessionId, () => agent.abort("host-abort"));
    if (host.signal?.aborted) agent.abort(typeof host.signal.reason === "string" ? host.signal.reason : "host-abort");
    const started = Date.now();
    const abort = () => agent.abort(typeof host.signal?.reason === "string" ? host.signal.reason : "host-abort");
    if (host.signal?.aborted) abort();
    else host.signal?.addEventListener("abort", abort, { once: true });
    try {
      await this.notify("headless/started", { sessionId: session.header.sessionId, agentId: agent.agentId });
      const result = await agent.followup(host.content, { model: host.model });
      await agent.waitForIdle();
      await session.flush();
      host.appExit?.(result.reason === "completed" ? 0 : result.reason === "aborted" ? 130 : 1);
      await this.notify("headless/completed", { sessionId: session.header.sessionId, agentId: agent.agentId, reason: result.reason });
      return Object.freeze({ session, sessionId: session.header.sessionId, ...result, snapshot: sessions.snapshot(session), durationMs: Date.now() - started });
    } catch (error) {
      await this.notify("headless/failed", { sessionId: session.header.sessionId, agentId: agent.agentId, error: error instanceof Error ? error.message : String(error) });
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
