import { codecs } from "./codec.js";
import { createCoreCodecRegistry } from "./core-codecs.js";
import { EventCodecRegistry } from "./codec-registry.js";
import { SessionJournal } from "./journal.js";
import {
  ACTSPACE_SERVICE_DEFINITIONS,
  bindServiceType,
  getService,
  provideService,
  serviceKey,
  type CordisContext,
} from "@actspace/cordis-adapter";
import type { EventCodec } from "./codec-registry.js";

export const SESSION_CODEC_HOST_PORT_ID = "actspace.host.session.codecs" as const;
/** Host 发现的插件事件 codec；Host 不提供时只用内置的。 */
export const SESSION_CODEC_HOST_PORT = serviceKey<readonly EventCodec[]>(SESSION_CODEC_HOST_PORT_ID);

/** `session.journal` 下注册的对象；取用方一般只用 `registry`。 */
export type SessionJournalService = {
  readonly registry: EventCodecRegistry;
  readonly EventCodecRegistry: typeof EventCodecRegistry;
  readonly SessionJournal: typeof SessionJournal;
  readonly codecs: readonly EventCodec[];
  readonly createCoreCodecRegistry: () => EventCodecRegistry;
};
export const SESSION_JOURNAL_SERVICE = bindServiceType<SessionJournalService>(
  ACTSPACE_SERVICE_DEFINITIONS.sessionJournal,
);

export function apply(ctx: CordisContext): void {
  const discovered = getService(ctx, SESSION_CODEC_HOST_PORT);
  const localTypes = new Set(codecs.map((codec) => codec.type));
  const registry = createCoreCodecRegistry([
    ...(discovered ?? []).filter((codec) => !localTypes.has(codec.type)),
    ...codecs,
  ]);
  provideService(
    ctx,
    SESSION_JOURNAL_SERVICE,
    Object.freeze({ registry, EventCodecRegistry, SessionJournal, codecs, createCoreCodecRegistry: () => registry }),
  );
}
