import { emitNotification, type CordisContext } from "@actspace/cordis-adapter";
import type { EventCodecRegistry } from "@actspace/session-journal";
import type { SessionProjectionService } from "@actspace/session-projection";
import { SessionStoreService } from "@actspace/session-persistence";
import { repairSubagentPublications } from "@actspace/subagent";
import type { RendererAllowlist } from "../projection/tool-dto.js";
import { RuntimeSessionController } from "./session-controller.js";
import { createAuxiliaryRequestRecorder } from "./auxiliary-request-recorder.js";

export const SESSION_RUNTIME_HOST_PORT_ID = "actspace.host.session" as const;

export type RuntimeSessionHostPort = {
  readonly dataRoot: string;
  readonly runtimeId: string;
  readonly profileId: string;
  readonly manifestDigest: string;
  readonly plugins: readonly { readonly id: string; readonly version: string }[];
  readonly rendererAllowlist?: RendererAllowlist;
};

type SessionJournalService = { readonly registry: EventCodecRegistry };

/**
 * Create the durable Session service inside the Cordis tree. The Host only
 * supplies normalized filesystem/profile facts; Journal ownership and
 * lifecycle stay with this Behavior.
 */
export function apply(ctx: CordisContext): void {
  const host = ctx.get?.(SESSION_RUNTIME_HOST_PORT_ID) as RuntimeSessionHostPort | undefined;
  const journal = ctx.get?.("session.journal") as SessionJournalService | undefined;
  const sessionStore = ctx.get?.("session.store") as SessionStoreService | undefined;
  const projection = ctx.get?.("session.projection") as SessionProjectionService | undefined;
  if (host === undefined) throw new Error(`Session Runtime plugin requires ${SESSION_RUNTIME_HOST_PORT_ID}.`);
  if (journal === undefined) throw new Error("Session Runtime plugin requires session.journal.");
  if (sessionStore === undefined) throw new Error("Session Runtime plugin requires session.store.");
  if (projection === undefined) throw new Error("Session Runtime plugin requires session.projection.");

  const service = new RuntimeSessionController({
    ...host,
    registry: journal.registry,
    projectionService: projection,
    beforeRecovery: async (parent, store) => { await repairSubagentPublications({ store, parent }); },
    onEvent: (sessionId, event) => emitNotification(ctx, "session/event", event, { sessionId }),
    onFlush: (sessionId, throughSeq) => emitNotification(ctx, "session/flush", { sessionId, throughSeq }),
    onCreated: (sessionId) => emitNotification(ctx, "session/created", { sessionId }),
    onDisposed: (sessionId, outcome) => emitNotification(ctx, "session/disposed", { sessionId, outcome }),
  }, sessionStore.store);
  ctx.provide?.("session.runtime", service);
  ctx.provide?.("llm.auxiliary-requests", createAuxiliaryRequestRecorder(service));
  ctx.effect?.(() => async () => {
    await service.closeAll();
  }, "session-runtime");
}

/** Session lifecycle facts are observational; persistence uses explicit awaited ports. */
interface SessionLifecycleEvents {
  /** @mode emit */
  "session/created": (payload: { sessionId: string }) => void;
  /** @mode emit */
  "session/disposed": (payload: { sessionId: string; outcome: unknown }) => void;
}
declare module "@actspace/cordis-adapter" { interface DomainEvents extends SessionLifecycleEvents {} }
