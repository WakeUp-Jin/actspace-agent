import type { EventCodecRegistry } from "./codec-registry.js";
import { defaultSessionProvenance, snapshotSessionJson, type SessionEventCandidateV1, type SessionEventEnvelopeV1 } from "./event-envelope.js";
import { SessionError } from "./errors.js";
import { effectiveSessionEvents, validateSessionEvents, type SessionValidationResult } from "./invariant-validator.js";
import { SessionSurface, type SessionSurfaceView } from "./surface.js";

export type SessionJournalOptions = {
  readonly registry: EventCodecRegistry;
  readonly now?: () => string;
  readonly seed?: readonly SessionEventEnvelopeV1[];
};

export class SessionJournal {
  readonly #registry: EventCodecRegistry;
  readonly #now: () => string;
  #events: SessionEventEnvelopeV1[];
  #surface: SessionSurface;
  #validation: SessionValidationResult;

  constructor(options: SessionJournalOptions) {
    this.#registry = options.registry;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#events = [...(options.seed ?? [])];
    this.#validation = validateSessionEvents(this.#events, this.#registry);
    this.#surface = SessionSurface.fromEvents(this.#projectableEvents(this.#events));
  }

  append(candidate: SessionEventCandidateV1): SessionEventEnvelopeV1 {
    if (this.#validation.accessState === "browse-only" || this.#validation.accessState === "corrupt") {
      throw new SessionError("SESSION_BROWSE_ONLY", `Cannot append to a ${this.#validation.accessState} Session.`);
    }
    const codec = this.#registry.get(candidate.type);
    if (codec === undefined) throw new SessionError("UNKNOWN_CODEC", `No Event Codec is registered for ${candidate.type}.`);
    if (candidate.eventVersion !== codec.currentVersion) {
      throw new SessionError("UNSUPPORTED_EVENT_VERSION", `New events must use ${candidate.type} version ${codec.currentVersion}.`);
    }
    if (candidate.source.ownerPluginId !== codec.ownerPluginId) {
      throw new SessionError("INVALID_EVENT", `Event ${candidate.type} owner must be ${codec.ownerPluginId}.`);
    }
    const event = snapshotSessionJson({
      recordKind: "event",
      seq: this.#events.length,
      type: candidate.type,
      eventVersion: candidate.eventVersion,
      criticality: codec.criticality,
      time: this.#now(),
      source: candidate.source,
      data: candidate.data,
      surface: candidate.surface,
      provenance: candidate.provenance ?? defaultSessionProvenance(),
    }) as SessionEventEnvelopeV1;
    const nextEvents = [...this.#events, event];
    const validation = validateSessionEvents(nextEvents, this.#registry);
    const nextSurface = this.#surface.clone();
    const projectedBefore = this.#projectableEvents(this.#events).length;
    const effectiveNext = this.#projectableEvents(nextEvents);
    for (const effectiveEvent of effectiveNext.slice(projectedBefore)) nextSurface.apply(effectiveEvent);
    this.#events = nextEvents;
    this.#validation = validation;
    this.#surface = nextSurface;
    return event;
  }

  appendMany(candidates: readonly SessionEventCandidateV1[]): readonly SessionEventEnvelopeV1[] {
    const checkpoint = this.#events;
    const appended: SessionEventEnvelopeV1[] = [];
    try {
      for (const candidate of candidates) appended.push(this.append(candidate));
      return Object.freeze(appended);
    } catch (error) {
      this.#events = checkpoint;
      this.#validation = validateSessionEvents(this.#events, this.#registry);
      this.#surface = SessionSurface.fromEvents(this.#projectableEvents(this.#events));
      throw error;
    }
  }

  get events(): readonly SessionEventEnvelopeV1[] {
    return Object.freeze([...this.#events]);
  }

  get surface(): SessionSurfaceView {
    return this.#surface.view;
  }

  get validation(): SessionValidationResult {
    return this.#validation;
  }

  get lastSeq(): number {
    return this.#events.length - 1;
  }

  #projectableEvents(events: readonly SessionEventEnvelopeV1[]): SessionEventEnvelopeV1[] {
    return effectiveSessionEvents(events).filter((event) => this.#registry.resolve(event).kind === "known");
  }
}
