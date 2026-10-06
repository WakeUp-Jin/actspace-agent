import { Service, type CordisContext, type CordisServiceContext } from "@actspace/cordis-adapter";
import type { EventCodecRegistry } from "@actspace/session-journal";
import { JsonlSessionStorage } from "./storage.js";

export const inject = Object.freeze(["actspace.host.session", "session.journal"]);
export class JsonlSessionStorageService extends Service {
  static inject = inject;
  readonly storage: JsonlSessionStorage;
  constructor(ctx: CordisServiceContext) {
    super(ctx, "session.storage");
    const host = ctx.get("actspace.host.session") as { dataRoot: string; runtimeId: string } | undefined;
    const journal = ctx.get("session.journal") as { registry: EventCodecRegistry } | undefined;
    if (!host || !journal) throw new Error("JSONL storage requires Host session configuration and codecs.");
    this.storage = new JsonlSessionStorage({ ...host, registry: journal.registry });
    ctx.effect(() => () => this.storage.close(), "session.storage");
  }
  get identity() { return this.storage.identity; }
  journalPath(sessionId: string) { return this.storage.journalPath(sessionId); }
  inspect(...args: Parameters<JsonlSessionStorage["inspect"]>) { return this.storage.inspect(...args); }
  listSessionIds() { return this.storage.listSessionIds(); }
  create(...args: Parameters<JsonlSessionStorage["create"]>) { return this.storage.create(...args); }
  open(...args: Parameters<JsonlSessionStorage["open"]>) { return this.storage.open(...args); }
  discard(...args: Parameters<JsonlSessionStorage["discard"]>) { return this.storage.discard(...args); }
  close() { return this.storage.close(); }
}
export function apply(ctx: CordisContext): void { new JsonlSessionStorageService(ctx as never); }
