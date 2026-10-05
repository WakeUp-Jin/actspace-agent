import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { SessionError, validateSessionEvents, validateSessionHeader, type EventCodecRegistry, type SessionHeaderV1 } from "@actspace/session-journal";
import type { SessionStorage, SessionStorageHandle, SessionStorageSnapshot } from "@actspace/session-storage";
import { inspectJsonlSession } from "./jsonl-reader.js";
import { JsonlSessionWriter, encodeRows, type JsonlWriterHooks } from "./jsonl-writer.js";
import { sessionFileLayout } from "./layout.js";
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
  readonly #opening = new Set<Promise<SessionStorageHandle>>();
  constructor(readonly options: JsonlStorageOptions) {}

  async inspect(sessionId: string): Promise<SessionStorageSnapshot> {
    this.#assertOpen();
    const inspection = await inspectJsonlSession(sessionFileLayout(this.options.dataRoot, sessionId).journalPath, this.options.registry, sessionId);
    return Object.freeze({ header: inspection.header, events: inspection.events,
      revision: createHash("sha256").update(inspection.rawBytes).digest("hex"),
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
      return this.#handle(await this.inspect(header.sessionId), "write", writer, lease);
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
      return this.#handle(snapshot, access, writer, lease);
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

  #handle(snapshot: SessionStorageSnapshot, access: "read" | "write", writer?: JsonlSessionWriter, lease?: SessionWriterLease): SessionStorageHandle {
    this.#assertOpen();
    if (!snapshot.header) throw new SessionError("SESSION_CORRUPT", "Missing session header.");
    let current = snapshot; let closed = false; let blocked = false;
    let mutation = Promise.resolve(); let closing: Promise<void> | undefined;
    const assertOpen = () => { if (closed) throw new SessionError("SESSION_CLOSED", "Storage handle is closed."); };
    const assertOwned = async () => { assertOpen(); if (access !== "write") throw new SessionError("SESSION_BROWSE_ONLY", "Read-only storage handle."); await lease!.assertOwned(); };
    const serialize = (operation: () => Promise<void>) => { const job = mutation.then(operation); mutation = job.catch(() => undefined); return job; };
    const handle: SessionStorageHandle = {
      header: snapshot.header, access,
      read: async () => { await mutation; assertOpen(); return structuredClone(current); },
      assertOwned,
      append: events => {
        const copied = structuredClone(events);
        return serialize(async () => {
          await assertOwned(); if (blocked) throw new SessionError("SESSION_DURABILITY_FAILED", "Storage writer is blocked.");
          const all = [...current.events, ...copied]; validateSessionEvents(all, this.options.registry);
          try { await writer!.append(copied); current = { ...current, events: all, revision: createHash("sha256").update(encodeRows([current.header!, ...all])).digest("hex") }; }
          catch (error) { blocked = true; throw error; }
        });
      },
      flush: () => serialize(async () => { await assertOwned(); if (blocked) throw new SessionError("SESSION_DURABILITY_FAILED", "Storage writer is blocked."); }),
      close: () => closing ??= serialize(async () => {
        closed = true;
        const results = await Promise.allSettled([writer?.close(), lease?.dispose()]);
        this.#handles.delete(handle);
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
