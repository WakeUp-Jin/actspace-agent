import { SessionModeWriter, setInitialSessionTitle } from "@actspace/agent-service";
import type {
  RuntimeAgentMode,
  RuntimeJsonValue,
  RuntimeRunTurnResponse,
  RuntimeSessionSnapshot,
} from "@actspace/shared/runtime-v2";
type HeadlessRunService = {
  initialize(sessionId: string): Promise<void>;
  run(
    sessionId: string,
    input: { content: RuntimeJsonValue; model?: string },
    signal?: AbortSignal,
  ): Promise<RuntimeRunTurnResponse>;
  service: Pick<import("@actspace/agent-service").AgentService, "exclusive" | "snapshot" | "resume">;
};
import type { SessionHandle } from "@actspace/session-persistence";
import {
  ACTSPACE_SERVICE_IDS,
  emitNotification,
  serviceKey,
  serviceView,
  type CordisContext,
} from "@actspace/cordis-adapter";

export const HEADLESS_HOST_PORT_ID = "actspace.host.headless" as const;

export type HeadlessSessionService = {
  readonly create: (sessionId?: string, cwd?: string) => Promise<SessionHandle>;
  readonly createEphemeral: (sessionId?: string, cwd?: string) => Promise<SessionHandle>;
  readonly resume: (sessionId: string) => Promise<SessionHandle>;
  readonly snapshot: (session: SessionHandle) => RuntimeSessionSnapshot;
};

export type HeadlessHostPort = {
  readonly enabled?: true;
  readonly content: RuntimeJsonValue;
  readonly persistent: boolean;
  readonly workspaceRoot?: string;
  readonly sessionId?: string;
  readonly title?: string;
  readonly model?: string;
  /** Optional API mode; CLI leaves this unset and resumes the saved mode. */
  readonly mode?: RuntimeAgentMode;
  readonly signal?: AbortSignal;
  readonly onSessionCreated?: (sessionId: string, abort: () => boolean) => void;
  /** DSH-style bounded exit request; the launcher decides when to terminate. */
  readonly appExit?: (code: number) => void;
};

export type DisabledHeadlessHostPort = { readonly enabled: false };
export const HEADLESS_HOST_PORT = serviceKey<HeadlessHostPort | DisabledHeadlessHostPort>(HEADLESS_HOST_PORT_ID);
/** Runner 用到的两个 Runtime 服务，各取自己读的那一面。 */
export const HEADLESS_SESSIONS_VIEW = serviceView<HeadlessSessionService>(ACTSPACE_SERVICE_IDS.sessionRuntime);
export const HEADLESS_AGENT_RUNTIME_VIEW = serviceView<{ readonly runs: HeadlessRunService }>(
  ACTSPACE_SERVICE_IDS.agentRuntime,
);

export type HeadlessRunResult = RuntimeRunTurnResponse & { readonly session: SessionHandle };

export class HeadlessRunner {
  readonly #modeWriter = new SessionModeWriter();
  constructor(
    private readonly options: {
      readonly host: HeadlessHostPort;
      readonly sessions: HeadlessSessionService;
      readonly agents: HeadlessRunService;
      readonly context?: CordisContext;
    },
  ) {}

  async run(): Promise<HeadlessRunResult> {
    const { host, sessions, agents } = this.options;
    const session =
      host.sessionId === undefined
        ? host.persistent
          ? await sessions.create(undefined, host.workspaceRoot)
          : await sessions.createEphemeral(undefined, host.workspaceRoot)
        : await sessions.resume(host.sessionId);
    await setInitialSessionTitle(session, host.title);
    await agents.initialize(session.header.sessionId);
    const sessionId = session.header.sessionId;
    const controller = new AbortController();
    const abort = () => {
      if (controller.signal.aborted) return false;
      controller.abort(host.signal?.reason ?? "host-abort");
      return true;
    };
    if (host.mode !== undefined) {
      await agents.service.exclusive(sessionId, () =>
        this.#modeWriter.change(session, host.mode!, (value) => sessions.snapshot(value), "headless"),
      );
    }
    host.onSessionCreated?.(sessionId, abort);
    const started = Date.now();
    if (host.signal?.aborted) abort();
    else host.signal?.addEventListener("abort", abort, { once: true });
    try {
      this.notify("headless/started", { sessionId: session.header.sessionId, agentId: `main:${sessionId}` });
      if (host.sessionId !== undefined) {
        const state = await agents.service.snapshot(sessionId);
        if (state.paused) await agents.service.resume(sessionId, state.revision);
      }
      const result = await agents.run(sessionId, { content: host.content, model: host.model }, controller.signal);
      await session.flush();
      host.appExit?.(result.outcome === "completed" ? 0 : result.outcome === "cancelled" ? 130 : 1);
      this.notify("headless/completed", {
        sessionId: session.header.sessionId,
        agentId: `main:${sessionId}`,
        outcome: result.outcome,
      });
      return Object.freeze({
        session,
        ...result,
        snapshot: sessions.snapshot(session),
        durationMs: Date.now() - started,
      });
    } catch (error) {
      this.notify("headless/failed", {
        sessionId: session.header.sessionId,
        agentId: `main:${sessionId}`,
        error: error instanceof Error ? error.message : String(error),
      });
      host.appExit?.(host.signal?.aborted ? 130 : 1);
      throw error;
    } finally {
      host.signal?.removeEventListener("abort", abort);
    }
  }

  private notify(type: string, payload: unknown): void {
    emitNotification(this.options.context, type, payload);
  }
}
export const HEADLESS_RUNNER_SERVICE = serviceKey<HeadlessRunner>(ACTSPACE_SERVICE_IDS.headlessRunner);
