import { validateSessionEvents, type EventCodecRegistry, type SessionEventEnvelopeV1, type SessionHeaderV1 } from "@actspace/session-journal";
import type { SessionStorage, SessionStorageSnapshot } from "@actspace/session-storage";
import type { ProjectionCheckpoint, SessionProjectionRegistry } from "@actspace/session-projection";
import { createHistoryIndex, forkHistoryIndex, indexHistoryEvents, type HistoryIndex } from "./history-index.js";

export type ProjectionCacheRead = {
  readonly identity: symbol; readonly revision: string; readonly header: SessionHeaderV1;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly starts: readonly number[]; readonly requests: readonly number[];
  /** Seqs of `request/system-prompt` / `request/tools`; history windows prepend the latest one before their start. */
  readonly prompts: readonly number[]; readonly toolSets: readonly number[];
  readonly calls: Readonly<Record<string, number[]>>;
  readonly checkpoint: ProjectionCheckpoint;
  readonly accessState: "read-write" | "degraded" | "browse-only" | "corrupt";
};

/** Retention is bounded by Session count, not by serialized size, so large Journals stay cacheable. */
const MAX_CACHED_SESSIONS = 3;
/** Guard against pinning several enormous Journals at once; the most recent Session is always kept. */
const MAX_CACHED_JOURNAL_BYTES = 96 * 1024 * 1024;

type CacheEntry = {
  /** Backend snapshot this entry was built from; it is the base for `storage.refresh`. */
  readonly snapshot: SessionStorageSnapshot;
  /** Revision + codec set + reducer versions; used when the backend cannot refresh. */
  readonly key: string;
  readonly codecDigest: string;
  readonly stateVersions: string;
  readonly read: ProjectionCacheRead;
  /** Live registry matching `read.checkpoint`; only advanced by `replayTail`, never exposed. */
  readonly registry: SessionProjectionRegistry;
  /** First event seq of the open turn window, carried so indexes can continue incrementally. */
  readonly floor: number;
  readonly bytes: number;
};

/** Disposable semantic indexes over one immutable backend snapshot. */
export class SessionProjectionCache {
  readonly #pending = new Map<string, Promise<ProjectionCacheRead>>();
  readonly #cached = new Map<string, CacheEntry>();
  #cachedBytes = 0;
  constructor(private readonly options: {
    storage: SessionStorage; codecs: EventCodecRegistry;
    createRegistry: (header: SessionHeaderV1) => SessionProjectionRegistry;
  }) {}

  read(sessionId: string): Promise<ProjectionCacheRead> {
    const pending = this.#pending.get(sessionId);
    if (pending) return pending;
    const job = this.#read(sessionId).finally(() => this.#pending.delete(sessionId));
    this.#pending.set(sessionId, job); return job;
  }
  async idle(): Promise<void> { await Promise.allSettled(this.#pending.values()); }
  async events(read: ProjectionCacheRead, fromSeq = 0, untilSeq = read.events.length): Promise<readonly SessionEventEnvelopeV1[]> {
    if (read.identity !== this.options.storage.identity) throw new Error("Snapshot belongs to another storage provider.");
    if (!Number.isSafeInteger(fromSeq) || !Number.isSafeInteger(untilSeq) || fromSeq < 0 || untilSeq < fromSeq || untilSeq > read.events.length) throw new Error("Invalid Journal range.");
    return read.events.slice(fromSeq, untilSeq);
  }

  async #read(sessionId: string): Promise<ProjectionCacheRead> {
    const { storage, codecs } = this.options;
    const cached = this.#cached.get(sessionId);
    if (cached !== undefined && cached.read.identity !== storage.identity) this.#drop(sessionId);
    else if (cached !== undefined && storage.refresh !== undefined) {
      // Validity is decided by the backend's cheap change check, before any Journal content is read.
      const probe = this.options.createRegistry(cached.read.header);
      if (cached.codecDigest !== codecs.digest || cached.stateVersions !== JSON.stringify(probe.stateVersions)) this.#drop(sessionId);
      else {
        let refreshed;
        try { refreshed = await storage.refresh(sessionId, cached.snapshot); }
        catch (error) { this.#drop(sessionId); throw error; }
        if (refreshed.kind === "unchanged") { this.#touch(sessionId, cached); return cached.read; }
        this.#drop(sessionId);
        const { snapshot } = refreshed;
        if (refreshed.kind === "appended") {
          const extended = this.#extend(sessionId, cached, snapshot, refreshed.fromEvent);
          if (extended !== null) return this.#retain(sessionId, extended).read;
        }
        return this.#retain(sessionId, this.#build(sessionId, snapshot)).read;
      }
    }
    const snapshot = await storage.inspect(sessionId);
    if (!snapshot.header || snapshot.integrity !== "complete") throw new Error(snapshot.problem ?? "Session requires repair.");
    const registry = this.options.createRegistry(snapshot.header);
    const key = JSON.stringify([snapshot.revision, codecs.digest, registry.stateVersions]);
    const stale = this.#cached.get(sessionId);
    if (stale?.key === key && stale.read.identity === storage.identity) { this.#touch(sessionId, stale); return stale.read; }
    if (stale) this.#drop(sessionId);
    return this.#retain(sessionId, this.#build(sessionId, snapshot, registry)).read;
  }

  /** Full build: validate (unless the backend already did), fold the projections, index every event. */
  #build(sessionId: string, snapshot: SessionStorageSnapshot, fresh?: SessionProjectionRegistry): CacheEntry {
    if (!snapshot.header || snapshot.integrity !== "complete") throw new Error(snapshot.problem ?? "Session requires repair.");
    const registry = fresh ?? this.options.createRegistry(snapshot.header);
    const accessState = this.#accessState(snapshot);
    registry.sync(sessionId, snapshot.events);
    const index = createHistoryIndex();
    indexHistoryEvents(snapshot.events, index);
    return this.#entry(sessionId, snapshot, registry, index, accessState);
  }

  /** Append-only continuation: validate-free (the backend validated the new events), fold and index only the new events. */
  #extend(sessionId: string, base: CacheEntry, snapshot: SessionStorageSnapshot, fromEvent: number): CacheEntry | null {
    if (!snapshot.header || snapshot.integrity !== "complete" || fromEvent !== base.snapshot.events.length || snapshot.events.length < fromEvent) return null;
    if (snapshot.validated?.codecDigest !== this.options.codecs.digest) return null;
    try {
      const added = snapshot.events.slice(fromEvent);
      base.registry.replayTail(sessionId, added);
      // Reads already handed out must not change underneath their holders: extend a fork of the indexes.
      const { index, touched } = forkHistoryIndex(base.read, base.floor);
      indexHistoryEvents(added, index, touched);
      return this.#entry(sessionId, snapshot, base.registry, index, snapshot.validated.accessState);
    } catch {
      // The registry commits only after every reducer succeeds, but be conservative: a full rebuild reproduces any real failure.
      return null;
    }
  }

  #accessState(snapshot: SessionStorageSnapshot): ProjectionCacheRead["accessState"] {
    if (snapshot.validated?.codecDigest === this.options.codecs.digest) return snapshot.validated.accessState;
    return validateSessionEvents(snapshot.events, this.options.codecs).accessState;
  }

  #entry(sessionId: string, snapshot: SessionStorageSnapshot, registry: SessionProjectionRegistry, index: HistoryIndex, accessState: ProjectionCacheRead["accessState"]): CacheEntry {
    const identity = this.options.storage.identity, codecDigest = this.options.codecs.digest;
    const read: ProjectionCacheRead = { identity, revision: snapshot.revision, header: snapshot.header!, events: snapshot.events, starts: index.starts, requests: index.requests, prompts: index.prompts, toolSets: index.toolSets, calls: index.calls, checkpoint: registry.checkpoint(sessionId), accessState };
    const stateVersions = JSON.stringify(registry.stateVersions);
    return { snapshot, key: JSON.stringify([snapshot.revision, codecDigest, registry.stateVersions]), codecDigest, stateVersions, read, registry, floor: index.floor, bytes: snapshot.bytes ?? 0 };
  }

  #touch(sessionId: string, entry: CacheEntry): void { this.#cached.delete(sessionId); this.#cached.set(sessionId, entry); }
  #drop(sessionId: string): void {
    const entry = this.#cached.get(sessionId);
    if (entry) { this.#cached.delete(sessionId); this.#cachedBytes -= entry.bytes; }
  }

  /** Lists touch every Session. Keep the most recent few (by count, with a byte guard) instead of pinning all history. */
  #retain(sessionId: string, entry: CacheEntry): CacheEntry {
    this.#drop(sessionId);
    this.#cached.set(sessionId, entry); this.#cachedBytes += entry.bytes;
    while (this.#cached.size > 1 && (this.#cached.size > MAX_CACHED_SESSIONS || this.#cachedBytes > MAX_CACHED_JOURNAL_BYTES)) {
      this.#drop(this.#cached.keys().next().value!);
    }
    return entry;
  }
}
