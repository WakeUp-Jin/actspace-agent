import {
  SessionJournal,
  validateSessionEvents,
  validateSessionHeader,
  type EventCodecRegistry,
  type SessionHeaderV1,
} from "@actspace/session-journal";
import type { SessionPrefixRewrite, SessionStorage, SessionStorageHandle, SessionStorageSnapshot } from "../index.js";

/** Independent test implementation: no filesystem or JSONL helpers. */
export class MemorySessionStorage implements SessionStorage {
  readonly identity = Symbol("memory-storage");
  readonly #records = new Map<string, SessionStorageSnapshot>();
  readonly #writers = new Set<string>();
  readonly #handles = new Set<SessionStorageHandle>();
  /** Archived Journals and retired Sessions, keyed by `<sessionId>/<label>`; tests read them back. */
  readonly archives = new Map<string, SessionStorageSnapshot>();
  #closed = false;
  constructor(private readonly registry: EventCodecRegistry) {}
  #assertOpen() {
    if (this.#closed) throw new Error("Storage is closed.");
  }
  async inspect(id: string) {
    this.#assertOpen();
    const value = this.#records.get(id);
    if (!value) throw new Error("Session does not exist.");
    return structuredClone(value);
  }
  async listSessionIds() {
    this.#assertOpen();
    return [...this.#records.keys()].sort();
  }
  async create(header: SessionHeaderV1) {
    this.#assertOpen();
    validateSessionHeader(header);
    if (this.#records.has(header.sessionId)) throw new Error("Session already exists.");
    this.#records.set(header.sessionId, {
      header: structuredClone(header),
      events: [],
      revision: "0",
      integrity: "complete",
    });
    return this.open(header.sessionId, "write");
  }
  async open(id: string, access: "read" | "write"): Promise<SessionStorageHandle> {
    let snapshot = await this.inspect(id);
    this.#assertOpen();
    let closed = false;
    if (access === "write") {
      if (this.#writers.has(id)) throw new Error("Session writer is locked.");
      this.#writers.add(id);
    }
    const assertOpen = () => {
      if (closed) throw new Error("Handle is closed.");
    };
    const assertOwned = async () => {
      assertOpen();
      if (access !== "write" || !this.#writers.has(id)) throw new Error("Handle is not a writer.");
    };
    const handle: SessionStorageHandle = {
      header: snapshot.header!,
      access,
      read: async () => {
        assertOpen();
        return structuredClone(snapshot);
      },
      assertOwned,
      append: async (events) => {
        await assertOwned();
        const next = [...snapshot.events, ...structuredClone(events)];
        validateSessionEvents(next, this.registry);
        snapshot = { ...snapshot, events: next, revision: String(Number(snapshot.revision) + 1) };
      },
      flush: async () => {
        await assertOwned();
        this.#records.set(id, structuredClone(snapshot));
      },
      close: async () => {
        if (closed) return;
        closed = true;
        if (access === "write") this.#writers.delete(id);
        this.#handles.delete(handle);
      },
    };
    this.#handles.add(handle);
    return handle;
  }
  async discard(handle: SessionStorageHandle) {
    if (!this.#handles.has(handle)) throw new Error("Not an owned handle.");
    await handle.assertOwned();
    this.#records.delete(handle.header.sessionId);
    await handle.close();
  }
  async rewritePrefix(id: string, input: SessionPrefixRewrite) {
    this.#assertOpen();
    if (this.#writers.has(id)) throw new Error("Session writer is locked.");
    const current = await this.inspect(id);
    if ((current.events.at(-1)?.seq ?? -1) !== input.expectedLastSeq)
      throw new Error("Journal changed after the rewind cut was chosen.");
    if (!Number.isSafeInteger(input.cutSeq) || input.cutSeq < 0 || input.cutSeq > input.expectedLastSeq)
      throw new RangeError("Rewind cut must drop at least one event.");
    const journal = new SessionJournal({ registry: this.registry, seed: current.events.slice(0, input.cutSeq) });
    if (input.closing.length) journal.appendMany(input.closing);
    const archive = `recovery/${input.label}.journal.jsonl`;
    this.archives.set(`${id}/${archive}`, current);
    this.#records.set(id, {
      ...current,
      events: structuredClone(journal.readEvents()),
      revision: String(Number(current.revision) + 1),
    });
    return { archive };
  }
  async retireInto(id: string, parentId: string, label: string) {
    this.#assertOpen();
    if (this.#writers.has(id)) throw new Error("Session writer is locked.");
    const current = await this.inspect(id);
    this.archives.set(`${parentId}/recovery/${label}/sessions/${id}`, current);
    this.#records.delete(id);
  }
  async close() {
    this.#closed = true;
    await Promise.all([...this.#handles].map((handle) => handle.close()));
  }
}
