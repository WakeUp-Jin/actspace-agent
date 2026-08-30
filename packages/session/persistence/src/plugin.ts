import { applySessionRecovery, planSessionRecovery, repairTornJsonlSession } from "./recovery.js";
import { SessionStore, SessionStoreService } from "./session-store.js";
import { SessionHandle, sessionFileLayout } from "./session.js";
import { SessionWriteBehind } from "./write-behind.js";
import { SessionWriterLease } from "./writer-lease.js";
import { createJsonlSessionPersistence, JsonlSessionPersistence, JsonlSessionPersistenceService } from "./session-persistence.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export const inject = Object.freeze(["actspace.host.session", "session.journal"]);

export function apply(ctx: CordisContext, config: Record<string, unknown> = {}): void {
  new JsonlSessionPersistenceService(ctx as never, config);
  ctx.provide?.("session.persistence.types", Object.freeze({ SessionStore, SessionStoreService, SessionHandle, SessionWriteBehind, SessionWriterLease, JsonlSessionPersistence, JsonlSessionPersistenceService, createJsonlSessionPersistence, sessionFileLayout, applySessionRecovery, planSessionRecovery, repairTornJsonlSession }));
}

export function activate() {
  const service = Object.freeze({
    SessionStore,
    SessionHandle,
    SessionWriteBehind,
    SessionWriterLease,
    JsonlSessionPersistence,
    JsonlSessionPersistenceService,
    createJsonlSessionPersistence,
    sessionFileLayout,
    applySessionRecovery,
    planSessionRecovery,
    repairTornJsonlSession,
  });
  return { services: { "session.persistence": service }, dispose: () => undefined };
}
