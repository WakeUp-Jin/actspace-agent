import type { SessionEventHistory } from "./history.js";
import type { EventCodecRegistry } from "./codec-registry.js";
import { defaultSessionProvenance, snapshotSessionJson, type SessionEventCandidateV1, type SessionEventEnvelopeV1 } from "./event-envelope.js";
import { SessionError } from "./errors.js";
import { SessionEventValidator, type SessionValidationResult } from "./invariant-validator.js";
import { SessionSurface, type SessionSurfaceView } from "./surface.js";

export type SessionJournalOptions = {
  readonly registry: EventCodecRegistry;
  readonly now?: () => string;
  readonly seed?: readonly SessionEventEnvelopeV1[];
  readonly history?: SessionEventHistory;
  readonly retainedEvents?: number;
  readonly retainedBytes?: number;
};

export class SessionJournal {
  readonly #registry: EventCodecRegistry;
  readonly #now: () => string;
  #events: SessionEventEnvelopeV1[];
  #surface: SessionSurface;
  #validation: SessionValidationResult;
  readonly #validator: SessionEventValidator;
  readonly #history?: SessionEventHistory;
  readonly #retainedEvents: number;
  readonly #retainedBytes: number;
  #firstSeq = 0;
  #lastSeq = -1;
  #bytes = 0;
  #sizes: number[] = [];
  readonly #latest = new Map<string, number>();
  readonly #projections = new Map<symbol, { seq: number; state: unknown }>();

  constructor(options: SessionJournalOptions) {
    this.#registry = options.registry;
    this.#history = options.history;
    this.#retainedEvents = options.retainedEvents ?? 512;
    this.#retainedBytes = options.retainedBytes ?? 4 * 1024 * 1024;
    if (!Number.isSafeInteger(this.#retainedEvents) || this.#retainedEvents < 1 || !Number.isSafeInteger(this.#retainedBytes) || this.#retainedBytes < 1) throw new RangeError("Journal retention limits must be positive integers.");
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#events = (options.seed ?? []).map(event => snapshotSessionJson(event));
    this.#lastSeq = this.#events.at(-1)?.seq ?? -1;
    for (const event of this.#events) this.#latest.set(event.type, event.seq);
    this.#sizes = this.#events.map(event => Buffer.byteLength(JSON.stringify(event)));
    this.#bytes = this.#sizes.reduce((a, b) => a + b, 0);
    this.#validator = new SessionEventValidator(this.#registry);
    this.#surface = new SessionSurface();
    this.#validation = this.#validator.append(this.#events, undefined, effective => { for (const event of effective) this.#surface.apply(event); });
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
      seq: this.#lastSeq + 1,
      type: candidate.type,
      eventVersion: candidate.eventVersion,
      criticality: codec.criticality,
      time: this.#now(),
      source: candidate.source,
      data: candidate.data,
      surface: candidate.surface,
      provenance: candidate.provenance ?? defaultSessionProvenance(),
    }) as SessionEventEnvelopeV1;
    return this.#commit([event])[0]!;
  }

  appendMany(candidates: readonly SessionEventCandidateV1[]): readonly SessionEventEnvelopeV1[] {
    // Build candidates without changing accepted state, then validate/commit once.
    if (this.#validation.accessState === "browse-only" || this.#validation.accessState === "corrupt") throw new SessionError("SESSION_BROWSE_ONLY", "Cannot append to a read-only Session.");
    const events = candidates.map((candidate, index) => {
      const codec = this.#registry.get(candidate.type);
      if (!codec) throw new SessionError("UNKNOWN_CODEC", `No Event Codec is registered for ${candidate.type}.`);
      if (candidate.eventVersion !== codec.currentVersion) throw new SessionError("UNSUPPORTED_EVENT_VERSION", `New events must use ${candidate.type} version ${codec.currentVersion}.`);
      if (candidate.source.ownerPluginId !== codec.ownerPluginId) throw new SessionError("INVALID_EVENT", `Event ${candidate.type} owner must be ${codec.ownerPluginId}.`);
      return snapshotSessionJson({ recordKind: "event", seq: this.#lastSeq + 1 + index, type: candidate.type, eventVersion: candidate.eventVersion, criticality: codec.criticality, time: this.#now(), source: candidate.source, data: candidate.data, surface: candidate.surface, provenance: candidate.provenance ?? defaultSessionProvenance() }) as SessionEventEnvelopeV1;
    });
    return this.#commit(events);
  }

  #commit(events: readonly SessionEventEnvelopeV1[]): readonly SessionEventEnvelopeV1[] {
    let surface = this.#surface;
    const validation = this.#validator.append(events, () => this.events, effective => {
      if (!effective.some(event => event.surface !== null)) return;
      surface = this.#surface.clone();
      for (const event of effective) surface.apply(event);
    });
    for (const event of events) {
      this.#events.push(event); this.#lastSeq = event.seq; this.#latest.set(event.type, event.seq);
      const bytes = Buffer.byteLength(JSON.stringify(event)); this.#sizes.push(bytes); this.#bytes += bytes;
    }
    this.#surface = surface; this.#validation = validation;
    return Object.freeze([...events]);
  }

  /** Explicit history read, possibly from the Host file. Never a partial prefix. */
  readEvents(start = 0, end = this.lastSeq + 1): readonly SessionEventEnvelopeV1[] {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > this.lastSeq + 1) throw new RangeError("Invalid Journal history range.");
    const archived = start < this.#firstSeq ? this.#history!.readEvents(start, Math.min(end, this.#firstSeq)) : [];
    if (archived.length !== Math.max(0, Math.min(end, this.#firstSeq) - start) || archived.some((event, index) => event.seq !== start + index)) throw new SessionError("SESSION_CORRUPT", "History provider returned an incomplete or mismatched range.");
    const recent = end > this.#firstSeq ? this.#events.slice(Math.max(start, this.#firstSeq) - this.#firstSeq, end - this.#firstSeq) : [];
    return Object.freeze([...archived, ...recent]);
  }

  eventsAfter(seq: number, throughSeq = this.lastSeq): readonly SessionEventEnvelopeV1[] {
    return this.readEvents(Math.max(0, seq + 1), throughSeq + 1);
  }

  *iterateEvents(start = 0, end = this.lastSeq + 1): IterableIterator<SessionEventEnvelopeV1> {
    for (let offset = start; offset < end; offset += 128) yield* this.readEvents(offset, Math.min(end, offset + 128));
  }

  latestEvent(type: string, before = this.lastSeq): SessionEventEnvelopeV1 | undefined {
    const latest = this.#latest.get(type);
    if (latest === undefined) return undefined;
    if (latest <= before) return this.readEvents(latest, latest + 1)[0];
    for (let end = Math.min(before + 1, this.lastSeq + 1); end > 0; end -= 128) {
      const events = this.readEvents(Math.max(0, end - 128), end);
      for (let index = events.length - 1; index >= 0; index--) if (events[index]!.type === type) return events[index];
    }
    return undefined;
  }

  latestEvents(types: readonly string[]): readonly SessionEventEnvelopeV1[] {
    return types.flatMap(type => { const event = this.latestEvent(type); return event ? [event] : []; }).sort((a, b) => a.seq - b.seq);
  }

  /** Lazy domain projection: replay once in pages, then reduce only the suffix.
   * Keys belong to the domain; reducers must be pure and return new state. */
  project<T>(key: symbol, initial: () => T, reduce: (state: T, event: SessionEventEnvelopeV1) => T): T {
    const prior = this.#projections.get(key);
    let state = prior ? prior.state as T : initial();
    const through = this.lastSeq;
    for (const event of this.iterateEvents((prior?.seq ?? -1) + 1, through + 1)) state = reduce(state, event);
    this.#projections.set(key, { seq: through, state });
    return state;
  }

  /** Only the durable prefix can leave memory; current Surface and validator are independent. */
  releaseDurable(throughSeq: number): void {
    if (!this.#history) return;
    let remove = 0, bytes = this.#bytes;
    while (remove < this.#events.length && this.#events[remove]!.seq <= throughSeq &&
      (this.#events.length - remove > this.#retainedEvents || bytes > this.#retainedBytes)) bytes -= this.#sizes[remove++]!;
    if (!remove) return;
    this.#events.splice(0, remove); this.#sizes.splice(0, remove); this.#firstSeq += remove; this.#bytes = bytes;
  }

  get retainedEventCount(): number { return this.#events.length; }
  get retainedEventBytes(): number { return this.#bytes; }
  /** Compatibility for external consumers; new callers use explicit readEvents/ranges. */
  get events(): readonly SessionEventEnvelopeV1[] { return this.readEvents(); }

  get surface(): SessionSurfaceView {
    return this.#surface.view;
  }

  get validation(): SessionValidationResult {
    return this.#validation;
  }

  get lastSeq(): number {
    return this.#lastSeq;
  }

}
