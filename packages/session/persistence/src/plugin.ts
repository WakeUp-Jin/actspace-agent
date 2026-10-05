import { SessionStoreService } from "./session-store.js";
import type { CordisContext } from "@actspace/cordis-adapter";
export const inject = Object.freeze(["session.journal", "session.storage"]);
export function apply(ctx: CordisContext, config: Record<string, unknown> = {}): void { new SessionStoreService(ctx as never, config); }
