import { Service, type CordisContext, type CordisServiceContext } from "@actspace/cordis-adapter";
import type { EventCodecRegistry } from "@actspace/session-journal";
import { JsonlSessionStorage } from "./storage.js";

export const inject = Object.freeze(["actspace.host.session", "session.journal"]);

/**
 * 消费方拿到的是这个包装对象，不是 `JsonlSessionStorage` 本身。`refresh`、`rewritePrefix` 这类可选能力
 * 一旦漏转发，消费方看到的就是"这个后端不支持"，不会报错。所以存储实现的公开成员必须全部转发：
 * 给存储加了方法却没在这里转发，`implements` 会让编译失败。
 */
type ForwardedStorage = Pick<JsonlSessionStorage, Exclude<keyof JsonlSessionStorage, "options">>;

export class JsonlSessionStorageService extends Service implements ForwardedStorage {
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
  refresh(...args: Parameters<JsonlSessionStorage["refresh"]>) { return this.storage.refresh(...args); }
  querySource(...args: Parameters<JsonlSessionStorage["querySource"]>) { return this.storage.querySource(...args); }
  querySources(...args: Parameters<JsonlSessionStorage["querySources"]>) { return this.storage.querySources(...args); }
  readEventBatch(...args: Parameters<JsonlSessionStorage["readEventBatch"]>) { return this.storage.readEventBatch(...args); }
  listSessionIds() { return this.storage.listSessionIds(); }
  create(...args: Parameters<JsonlSessionStorage["create"]>) { return this.storage.create(...args); }
  open(...args: Parameters<JsonlSessionStorage["open"]>) { return this.storage.open(...args); }
  discard(...args: Parameters<JsonlSessionStorage["discard"]>) { return this.storage.discard(...args); }
  rewritePrefix(...args: Parameters<JsonlSessionStorage["rewritePrefix"]>) { return this.storage.rewritePrefix(...args); }
  retireInto(...args: Parameters<JsonlSessionStorage["retireInto"]>) { return this.storage.retireInto(...args); }
  close() { return this.storage.close(); }
}
export function apply(ctx: CordisContext): void { new JsonlSessionStorageService(ctx as never); }
