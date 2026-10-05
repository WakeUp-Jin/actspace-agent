import { validateSessionEvents, type EventCodecRegistry, type SessionEventEnvelopeV1, type SessionHeaderV1 } from "@actspace/session-journal";
import type { SessionStorage } from "@actspace/session-storage";
import type { ProjectionCheckpoint, SessionProjectionRegistry } from "@actspace/session-projection";

export type ProjectionCacheRead = {
  readonly identity: symbol; readonly revision: string; readonly header: SessionHeaderV1;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly starts: readonly number[]; readonly requests: readonly number[];
  readonly calls: Readonly<Record<string, number[]>>;
  readonly checkpoint: ProjectionCheckpoint;
  readonly accessState: "read-write" | "degraded" | "browse-only" | "corrupt";
};

/** Disposable semantic indexes over one immutable backend snapshot. */
export class SessionProjectionCache {
  readonly #pending = new Map<string, Promise<ProjectionCacheRead>>();
  readonly #cached = new Map<string, { key: string; read: ProjectionCacheRead; bytes: number }>();
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
    const snapshot = await this.options.storage.inspect(sessionId);
    if (!snapshot.header || snapshot.integrity !== "complete") throw new Error(snapshot.problem ?? "Session requires repair.");
    const registry = this.options.createRegistry(snapshot.header);
    const key = JSON.stringify([snapshot.revision, this.options.codecs.digest, registry.stateVersions]);
    const cached = this.#cached.get(sessionId);
    if (cached?.key === key && cached.read.identity === this.options.storage.identity) {
      this.#cached.delete(sessionId); this.#cached.set(sessionId, cached);
      return cached.read;
    }
    if (cached) { this.#cached.delete(sessionId); this.#cachedBytes -= cached.bytes; }
    const validation = validateSessionEvents(snapshot.events, this.options.codecs);
    registry.sync(sessionId, snapshot.events);
    const starts: number[] = []; const requests: number[] = []; const calls: Record<string, number[]> = {};
    let floor = 0;
    for (const event of snapshot.events) {
      if (event.type === "turn/start") starts.push(floor);
      if (event.type === "turn/end") floor = event.seq + 1;
      if (event.type === "request/header") requests.push(event.seq);
      const data = event.data;
      const callId = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).callId : null;
      if (typeof callId === "string") (calls[callId] ??= []).push(event.seq);
    }
    const read: ProjectionCacheRead = { identity: this.options.storage.identity, revision: snapshot.revision, header: snapshot.header, events: snapshot.events, starts, requests, calls, checkpoint: registry.checkpoint(sessionId), accessState: validation.accessState };
    // Lists touch every Session. Bound retained snapshots instead of pinning all history.
    const bytes = JSON.stringify(read).length * 2;
    const budget = 16 * 1024 * 1024;
    if (bytes <= budget) {
      while (this.#cached.size && (this.#cached.size >= 3 || this.#cachedBytes + bytes > budget)) {
        const [id, evicted] = this.#cached.entries().next().value!;
        this.#cached.delete(id); this.#cachedBytes -= evicted.bytes;
      }
      this.#cached.set(sessionId, { key, read, bytes }); this.#cachedBytes += bytes;
    }
    return read;
  }
}
