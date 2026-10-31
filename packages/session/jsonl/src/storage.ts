import { JsonlEventHistory } from "./event-history.js";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { SessionError, SessionEventValidator, validateSessionHeader, type EventCodecRegistry, type SessionHeaderV1 } from "@actspace/session-journal";
import type { SessionStorage, SessionStorageHandle, SessionStorageSnapshot } from "@actspace/session-storage";
import { inspectJsonlSession } from "./jsonl-reader.js";
import { JsonlSessionWriter, type JsonlWriterHooks } from "./jsonl-writer.js";
import { sessionFileLayout } from "./layout.js";
import { JsonlQueryReader } from "./query-reader.js";
import { queryStamp } from "./query-stamp.js";
import { SessionWriterLease, type AcquireWriterLeaseOptions } from "./writer-lease.js";

export interface JsonlStorageOptions {
  readonly dataRoot: string;
  readonly runtimeId: string;
  readonly registry: EventCodecRegistry;
  readonly writerHooks?: JsonlWriterHooks;
  readonly lease?: Pick<AcquireWriterLeaseOptions, "heartbeatMs" | "staleMs" | "now" | "isProcessAlive" | "pid">;
}

/** Physical backend; file layout, fsync and cross-process writer ownership stay here. */
export class JsonlSessionStorage implements SessionStorage {
  readonly identity = Symbol("jsonl-session-storage");
  readonly #handles = new Set<SessionStorageHandle>();
  #closed = false;
  #queryReader?: JsonlQueryReader;
  readonly #queryProofs = new Map<string, { idle(): Promise<void>; stamp?: string; token: string; owned(): Promise<void> }>();
  async querySources(sessionIds: readonly string[]) {
    this.#assertOpen();
    await Promise.all(sessionIds.map(id => this.#queryProofs.get(id)?.idle()));
    const sources = await (this.#queryReader ??= new JsonlQueryReader()).sources(sessionIds.map(sessionId => ({ sessionId, path: this.journalPath(sessionId) })));
    return Promise.all(sources.map(source => this.#withQueryProof(source)));
  }
  async querySource(sessionId: string) {
    this.#assertOpen();
    await this.#queryProofs.get(sessionId)?.idle();
    return this.#withQueryProof(await (this.#queryReader ??= new JsonlQueryReader()).source(this.journalPath(sessionId), sessionId));
  }
  async #withQueryProof(source: import("@actspace/session-storage").SessionQuerySource) {
    const proof = this.#queryProofs.get(source.header.sessionId);
    if (!proof?.stamp || proof.stamp !== source.stamp) return source;
    await proof.owned();
    return { ...source, appendOnlyToken: proof.token };
  }
  readEventBatch(sessionId: string, input: import("@actspace/session-storage").SessionEventBatchInput) {
    this.#assertOpen();
    return (this.#queryReader ??= new JsonlQueryReader()).read(this.journalPath(sessionId), sessionId, input);
  }
  readonly #opening = new Set<Promise<SessionStorageHandle>>();
  constructor(readonly options: JsonlStorageOptions) {}
  journalPath(sessionId: string): string { return sessionFileLayout(this.options.dataRoot, sessionId).journalPath; }

  async inspect(sessionId: string): Promise<SessionStorageSnapshot> {
    this.#assertOpen();
    const inspection = await inspectJsonlSession(sessionFileLayout(this.options.dataRoot, sessionId).journalPath, this.options.registry, sessionId);
    return Object.freeze({ header: inspection.header, events: inspection.events,
      revision: inspection.contentDigest,
      integrity: inspection.tornTail === null && inspection.validation !== null ? "complete" : "repair-required",
      ...(inspection.tornTail !== null || inspection.validation === null ? { problem: inspection.diagnostics.map(item => item.message).join("; ") } : {}),
    });
  }

  async listSessionIds(): Promise<readonly string[]> {
    this.#assertOpen();
    const root = join(this.options.dataRoot, "sessions-v2");
    await mkdir(root, { recursive: true });
    return (await readdir(root, { withFileTypes: true })).filter(item => item.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(item.name)).map(item => item.name).sort();
  }

  create(header: SessionHeaderV1): Promise<SessionStorageHandle> {
    return this.#track(() => this.#create(header));
  }
  async #create(header: SessionHeaderV1): Promise<SessionStorageHandle> {
    this.#assertOpen(); validateSessionHeader(header);
    const layout = sessionFileLayout(this.options.dataRoot, header.sessionId);
    const lease = await SessionWriterLease.acquire({ sessionDir: layout.sessionDir, sessionId: header.sessionId, runtimeId: this.options.runtimeId, ...this.options.lease });
    let writer: JsonlSessionWriter | undefined;
    try {
      writer = await JsonlSessionWriter.create(layout.journalPath, header, this.options.writerHooks);
      return this.#handle(await this.inspect(header.sessionId), "write", writer, lease, queryStamp(await stat(layout.journalPath)));
    } catch (error) {
      const cleanup = await Promise.allSettled([writer?.close(), lease.dispose()]);
      throwWithCleanup(error, cleanup);
    }
  }

  open(sessionId: string, access: "read" | "write"): Promise<SessionStorageHandle> {
    return this.#track(() => this.#open(sessionId, access));
  }
  async #open(sessionId: string, access: "read" | "write"): Promise<SessionStorageHandle> {
    this.#assertOpen();
    // Acquire before inspection so a previous writer cannot append between replay and open.
    const layout = sessionFileLayout(this.options.dataRoot, sessionId);
    const lease = access === "write" ? await SessionWriterLease.acquire({ sessionDir: layout.sessionDir, sessionId, runtimeId: this.options.runtimeId, ...this.options.lease }) : undefined;
    let writer: JsonlSessionWriter | undefined;
    try {
      const snapshot = await this.inspect(sessionId);
      if (snapshot.header === null || snapshot.integrity !== "complete") throw new SessionError("SESSION_CORRUPT", snapshot.problem ?? "Session requires repair.");
      if (access === "write") writer = await JsonlSessionWriter.open(layout.journalPath, this.options.writerHooks);
      return this.#handle(snapshot, access, writer, lease, writer ? queryStamp(await stat(layout.journalPath)) : undefined);
    } catch (error) { throwWithCleanup(error, await Promise.allSettled([writer?.close(), lease?.dispose()])); }
  }

  async discard(handle: SessionStorageHandle): Promise<void> {
    if (!this.#handles.has(handle) || handle.access !== "write") throw new Error("Cannot discard a session without its writer.");
    await handle.assertOwned();
    const layout = sessionFileLayout(this.options.dataRoot, handle.header.sessionId);
    const retired = join(layout.root, `.discard-${randomUUID()}`);
    // Rename while owned. A later creator at the original ID cannot be removed by cleanup.
    await rename(layout.sessionDir, retired);
    try { await handle.close(); } finally { await rm(retired, { recursive: true, force: true }); }
  }

  async close(): Promise<void> {
    this.#closed = true;
    await this.#queryReader?.close();
    await Promise.allSettled([...this.#opening]);
    const results = await Promise.allSettled([...this.#handles].map(handle => handle.close()));
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(r => r.reason), "Failed to close session storage.");
  }

  #track(open: () => Promise<SessionStorageHandle>): Promise<SessionStorageHandle> {
    // Register before acquisition starts, so provider close joins provisional ownership.
    const pending = Promise.resolve().then(open);
    this.#opening.add(pending);
    void pending.then(() => this.#opening.delete(pending), () => this.#opening.delete(pending));
    return pending;
  }

  #assertOpen(): void { if (this.#closed) throw new SessionError("SESSION_CLOSED", "Storage is closed."); }

  #handle(snapshot: SessionStorageSnapshot, access: "read" | "write", writer?: JsonlSessionWriter, lease?: SessionWriterLease, initialStamp?: string): SessionStorageHandle {
    this.#assertOpen();
    if (!snapshot.header) throw new SessionError("SESSION_CORRUPT", "Missing session header.");
    const header = snapshot.header;
    const validator = new SessionEventValidator(this.options.registry);
    validator.append(snapshot.events);
    const history = new JsonlEventHistory(this.journalPath(header.sessionId), snapshot.events.length);
    let lastSeq = snapshot.events.at(-1)?.seq ?? -1;
    // Release event bodies after validation. Explicit reads reload the authoritative file.
    snapshot = { ...snapshot, events: [] };
    let closed = false; let blocked = false;
    let mutation = Promise.resolve(); let closing: Promise<void> | undefined;
    const assertOpen = () => { if (closed) throw new SessionError("SESSION_CLOSED", "Storage handle is closed."); };
    const assertOwned = async () => { assertOpen(); if (access !== "write") throw new SessionError("SESSION_BROWSE_ONLY", "Read-only storage handle."); await lease!.assertOwned(); };
    const serialize = (operation: () => Promise<void>) => { const job = mutation.then(operation); mutation = job.catch(() => undefined); return job; };
    const proof = { idle: () => mutation, stamp: initialStamp, token: randomUUID(), owned: assertOwned };
    if (writer) this.#queryProofs.set(header.sessionId, proof);
    const handle: SessionStorageHandle = {
      header, access, history,
      read: async () => {
        await mutation; assertOpen();
        const read = await this.inspect(header.sessionId);
        if (read.integrity !== "complete") throw new SessionError("SESSION_CORRUPT", read.problem ?? "Session requires repair.");
        if (access === "read") return { ...read, events: read.events.slice(0, lastSeq + 1), revision: snapshot.revision };
        return read;
      },
      assertOwned,
      append: events => {
        const copied = structuredClone(events);
        return serialize(async () => {
          await assertOwned(); if (blocked) throw new SessionError("SESSION_DURABILITY_FAILED", "Storage writer is blocked.");
          const needsHistory = copied.some(event => this.options.registry.get(event.type)?.validateRelations !== undefined);
          const previous = needsHistory ? (await this.inspect(header.sessionId)).events : [];
          const before = queryStamp(await stat(writer!.journalPath));
          if (before !== proof.stamp) { blocked = true; proof.stamp = undefined; throw new SessionError("SESSION_CORRUPT", "Journal changed outside its owned writer."); }
          validator.append(copied, () => previous);
          try {
            await writer!.append(copied);
            if (proof.stamp) proof.stamp = queryStamp(await stat(writer!.journalPath));
            history.appended(copied);
            lastSeq = copied.at(-1)?.seq ?? lastSeq;
          }
          catch (error) { blocked = true; proof.stamp = undefined; throw error; }
        });
      },
      flush: () => serialize(async () => { await assertOwned(); if (blocked) throw new SessionError("SESSION_DURABILITY_FAILED", "Storage writer is blocked."); }),
      close: () => closing ??= serialize(async () => {
        closed = true;
        const results = await Promise.allSettled([Promise.resolve().then(() => history.close()), writer?.close(), lease?.dispose()]);
        this.#handles.delete(handle);
        if (this.#queryProofs.get(handle.header.sessionId) === proof) this.#queryProofs.delete(handle.header.sessionId);
        const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        if (failures.length) throw new AggregateError(failures.map(r => r.reason), "Storage handle cleanup failed.");
      }),
    };
    this.#handles.add(handle); return handle;
  }
}

function throwWithCleanup(error: unknown, results: PromiseSettledResult<unknown>[]): never {
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length) throw new AggregateError([error, ...failures.map(r => r.reason)], "Storage operation and cleanup failed.");
  throw error;
}
