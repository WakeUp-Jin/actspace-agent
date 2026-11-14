import {
  ACTSPACE_SERVICE_DEFINITIONS,
  ACTSPACE_SERVICE_IDS,
  bindServiceType,
  provideService,
  requireService,
  serviceView,
  type CordisContext,
} from "@actspace/cordis-adapter";

export interface SessionCheckpoint {
  flush(input: { readonly sessionId: string; readonly throughSeq: number; readonly reason: string }): Promise<void>;
}
export const SESSION_CHECKPOINT_SERVICE = bindServiceType<SessionCheckpoint>(
  ACTSPACE_SERVICE_DEFINITIONS.sessionCheckpoint,
);

/** 这个包用到的 `session.runtime`：按 id 找到打开着的会话并落盘。 */
export const CHECKPOINT_SESSIONS_VIEW = serviceView<{
  readonly getOpen: (sessionId: string) => { readonly flush: (throughSeq?: number) => Promise<void> } | undefined;
}>(ACTSPACE_SERVICE_IDS.sessionRuntime);

export const inject = Object.freeze(["session.runtime"]);

export function apply(ctx: CordisContext): void {
  const runtime = requireService(ctx, CHECKPOINT_SESSIONS_VIEW, "Session checkpoint policy");
  provideService(
    ctx,
    SESSION_CHECKPOINT_SERVICE,
    Object.freeze({
      flush: async (payload: unknown) => {
        if (payload === null || typeof payload !== "object" || Array.isArray(payload))
          throw new Error("Invalid session.checkpoint payload.");
        const record = payload as Record<string, unknown>;
        if (
          typeof record.sessionId !== "string" ||
          typeof record.throughSeq !== "number" ||
          !Number.isSafeInteger(record.throughSeq)
        ) {
          throw new Error("Invalid session.checkpoint identity.");
        }
        const session = runtime.getOpen(record.sessionId);
        if (session === undefined) throw new Error(`Session ${record.sessionId} is not live.`);
        await session.flush(record.throughSeq);
      },
    }),
  );
}
