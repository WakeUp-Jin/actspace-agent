import { emitContained, type CordisContext } from "@actspace/cordis-adapter";
import type { EventCodecRegistry } from "@actspace/session-journal";
import { SessionStoreService } from "@actspace/session-persistence";
import type { SessionPersistence } from "@actspace/session-persistence";
import { repairSubagentPublications } from "@actspace/subagent";
import type { RendererAllowlist } from "../projection/tool-dto.js";
import { RuntimeSessionController } from "./session-controller.js";

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
  const persistence = ctx.get?.("session.persistence") as SessionPersistence | undefined;
  if (host === undefined) throw new Error(`Session Runtime plugin requires ${SESSION_RUNTIME_HOST_PORT_ID}.`);
  if (journal === undefined) throw new Error("Session Runtime plugin requires session.journal.");
  if (persistence === undefined) throw new Error("Session Runtime plugin requires session.persistence.");

  const sessionStore = new SessionStoreService(ctx as unknown as import("@actspace/cordis-adapter").CordisServiceContext);
  const service = new RuntimeSessionController({
    ...host,
    registry: journal.registry,
    beforeRecovery: async (parent, store) => { await repairSubagentPublications({ store, parent }); },
    onEvent: async (sessionId, event) => { await emitContained(ctx, "session/event", event, { sessionId }); },
    onFlush: (sessionId, throughSeq) => emitContained(ctx, "session/flush", { sessionId, throughSeq }),
    onCreated: (sessionId) => emitContained(ctx, "session/created", { sessionId }),
    onDisposed: (sessionId, outcome) => emitContained(ctx, "session/disposed", { sessionId, outcome }),
  }, sessionStore.store);
  ctx.provide?.("session.runtime", service);
  ctx.effect?.(() => async () => {
    await service.flushAll();
    await service.closeAll();
  }, "session-runtime");
}
