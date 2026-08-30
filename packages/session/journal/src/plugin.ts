import { codecs } from "./codec.js";
import { createCoreCodecRegistry } from "./core-codecs.js";
import { EventCodecRegistry } from "./codec-registry.js";
import { SessionJournal } from "./journal.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import type { EventCodec } from "./codec-registry.js";

export const SESSION_CODEC_HOST_PORT_ID = "actspace.host.session.codecs" as const;

export function apply(ctx: CordisContext): void {
  const discovered = ctx.get?.(SESSION_CODEC_HOST_PORT_ID) as readonly EventCodec[] | undefined;
  const localTypes = new Set(codecs.map((codec) => codec.type));
  const registry = createCoreCodecRegistry([...(discovered ?? []).filter((codec) => !localTypes.has(codec.type)), ...codecs]);
  ctx.provide?.("session.journal", Object.freeze({ registry, EventCodecRegistry, SessionJournal, codecs, createCoreCodecRegistry: () => registry }));
}

export function activate() {
  const registry = createCoreCodecRegistry(codecs);
  const service = Object.freeze({
    EventCodecRegistry,
    SessionJournal,
    codecs,
    createCoreCodecRegistry: () => registry,
  });
  return { services: { "session.journal": service }, dispose: () => undefined };
}
