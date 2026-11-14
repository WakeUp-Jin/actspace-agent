import { emitNotification, getService, provideService, type CordisContext } from "@actspace/cordis-adapter";
import { LLM_AUXILIARY_REQUESTS_SERVICE } from "@actspace/llm-service";
import { SESSION_JOURNAL_SERVICE } from "@actspace/session-journal";
import { SESSION_PROJECTION_SERVICE } from "@actspace/session-projection";
import { SESSION_STORE_SERVICE } from "@actspace/session-persistence";
import type { RendererAllowlist } from "../projection/tool-dto.js";
import { RuntimeSessionController } from "./session-controller.js";
import { createAuxiliaryRequestRecorder } from "./auxiliary-request-recorder.js";
import { SESSION_RUNTIME_HOST_PORT, SESSION_RUNTIME_SERVICE } from "../service-keys.js";

export const SESSION_RUNTIME_HOST_PORT_ID = "actspace.host.session" as const;

export type RuntimeSessionHostPort = {
  readonly dataRoot: string;
  readonly runtimeId: string;
  readonly profileId: string;
  readonly manifestDigest: string;
  readonly plugins: readonly { readonly id: string; readonly version: string }[];
  readonly rendererAllowlist?: RendererAllowlist;
};

/**
 * Create the durable Session service inside the Cordis tree. The Host only
 * supplies normalized filesystem/profile facts; Journal ownership and
 * lifecycle stay with this Behavior.
 */
export function apply(ctx: CordisContext): void {
  const host = getService(ctx, SESSION_RUNTIME_HOST_PORT);
  const journal = getService(ctx, SESSION_JOURNAL_SERVICE);
  const sessionStore = getService(ctx, SESSION_STORE_SERVICE);
  const projection = getService(ctx, SESSION_PROJECTION_SERVICE);
  if (host === undefined) throw new Error(`Session Runtime plugin requires ${SESSION_RUNTIME_HOST_PORT_ID}.`);
  if (journal === undefined) throw new Error("Session Runtime plugin requires session.journal.");
  if (sessionStore === undefined) throw new Error("Session Runtime plugin requires session.store.");
  if (projection === undefined) throw new Error("Session Runtime plugin requires session.projection.");

  const service = new RuntimeSessionController(
    {
      ...host,
      registry: journal.registry,
      projectionService: projection,
      onEvent: (sessionId, event) => emitNotification(ctx, "session/event", event, { sessionId }),
      onFlush: (sessionId, throughSeq) => emitNotification(ctx, "session/flush", { sessionId, throughSeq }),
      onCreated: (sessionId) => emitNotification(ctx, "session/created", { sessionId }),
      onDisposed: (sessionId, outcome) => emitNotification(ctx, "session/disposed", { sessionId, outcome }),
    },
    sessionStore.store,
  );
  provideService(ctx, SESSION_RUNTIME_SERVICE, service);
  provideService(ctx, LLM_AUXILIARY_REQUESTS_SERVICE, createAuxiliaryRequestRecorder(service));
  ctx.effect?.(
    () => async () => {
      await service.closeAll();
    },
    "session-runtime",
  );
}

/** Session lifecycle facts are observational; persistence uses explicit awaited ports. */
interface SessionLifecycleEvents {
  /** @mode emit */
  "session/created": (payload: { sessionId: string }) => void;
  /** @mode emit */
  "session/disposed": (payload: { sessionId: string; outcome: unknown }) => void;
}
declare module "@actspace/cordis-adapter" {
  interface DomainEvents extends SessionLifecycleEvents {}
}
