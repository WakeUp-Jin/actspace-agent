import { createHash } from "node:crypto";
import type { EventCodec as PluginEventCodec } from "@actspace/cordis-adapter";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionEventCriticality, SessionEventEnvelopeV1 } from "./event-envelope.js";
import { SessionError } from "./errors.js";

export type EventCodecRelationContext = {
  readonly previous: readonly SessionEventEnvelopeV1[];
  readonly candidate: SessionEventEnvelopeV1;
};

export type EventCodec = PluginEventCodec & {
  readonly validateRelations?: (context: EventCodecRelationContext) => void;
};

export type DecodedSessionEvent = {
  readonly event: SessionEventEnvelopeV1;
  readonly data: RuntimeV2JsonValue;
  readonly projected: boolean;
};

export type CodecResolution =
  | { readonly kind: "known"; readonly codec: EventCodec; readonly data: RuntimeV2JsonValue }
  | { readonly kind: "unknown-required" }
  | { readonly kind: "unknown-ignorable" }
  | { readonly kind: "unsupported-required"; readonly codec: EventCodec }
  | { readonly kind: "unsupported-ignorable"; readonly codec: EventCodec };

export class EventCodecRegistry {
  readonly #codecs = new Map<string, EventCodec>();

  constructor(codecs: readonly EventCodec[] = []) {
    for (const codec of codecs) this.register(codec);
  }

  register(codec: EventCodec): void {
    validateCodec(codec);
    const existing = this.#codecs.get(codec.type);
    if (existing !== undefined) {
      throw new SessionError("INVALID_EVENT", `Duplicate Event Codec ${codec.type}; owners ${existing.ownerPluginId} and ${codec.ownerPluginId}.`);
    }
    this.#codecs.set(codec.type, Object.freeze({ ...codec, upgrades: codec.upgrades === undefined ? undefined : Object.freeze({ ...codec.upgrades }) }));
  }

  get(type: string): EventCodec | undefined {
    return this.#codecs.get(type);
  }

  resolve(event: SessionEventEnvelopeV1): CodecResolution {
    const codec = this.#codecs.get(event.type);
    if (codec === undefined) return event.criticality === "required" ? { kind: "unknown-required" } : { kind: "unknown-ignorable" };
    if (codec.ownerPluginId !== event.source.ownerPluginId || codec.criticality !== event.criticality) {
      throw new SessionError("SESSION_CORRUPT", `Event ${event.type} does not match its codec owner or criticality.`);
    }
    if (event.eventVersion > codec.currentVersion) {
      return codec.criticality === "required" ? { kind: "unsupported-required", codec } : { kind: "unsupported-ignorable", codec };
    }
    let version = event.eventVersion;
    let data = event.data;
    while (version < codec.currentVersion) {
      const upgrade = codec.upgrades?.[version];
      if (upgrade === undefined) throw new SessionError("SESSION_CORRUPT", `Codec ${codec.type} has no upgrade from version ${version}.`);
      data = upgrade(data);
      version += 1;
    }
    codec.validate(data);
    return { kind: "known", codec, data };
  }

  get digest(): string {
    const descriptors = [...this.#codecs.values()]
      .map(({ type, ownerPluginId, currentVersion, criticality }) => ({ type, ownerPluginId, currentVersion, criticality }))
      .sort((left, right) => left.type.localeCompare(right.type));
    return createHash("sha256").update(JSON.stringify(descriptors)).digest("hex");
  }

  list(): readonly EventCodec[] {
    return Object.freeze([...this.#codecs.values()].sort((left, right) => left.type.localeCompare(right.type)));
  }
}

function validateCodec(codec: EventCodec): void {
  if (codec.type.length === 0 || codec.ownerPluginId.length === 0) throw new SessionError("INVALID_EVENT", "Codec type and owner are required.");
  if (!Number.isSafeInteger(codec.currentVersion) || codec.currentVersion < 1) throw new SessionError("INVALID_EVENT", `Codec ${codec.type} currentVersion must be >= 1.`);
  if (codec.ownerPluginId === "@actspace/core") {
    if (codec.type.startsWith("plugin/")) throw new SessionError("INVALID_EVENT", `Core codec ${codec.type} cannot use the plugin namespace.`);
  } else if (!codec.type.startsWith(`plugin/${codec.ownerPluginId}/`)) {
    throw new SessionError("INVALID_EVENT", `Plugin codec ${codec.type} is outside owner namespace ${codec.ownerPluginId}.`);
  }
  for (let version = 1; version < codec.currentVersion; version += 1) {
    if (codec.upgrades?.[version] === undefined) throw new SessionError("INVALID_EVENT", `Codec ${codec.type} upgrade chain is missing version ${version}.`);
  }
  for (const version of Object.keys(codec.upgrades ?? {})) {
    const numeric = Number(version);
    if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric >= codec.currentVersion) {
      throw new SessionError("INVALID_EVENT", `Codec ${codec.type} has an invalid upgrade key ${version}.`);
    }
  }
}
