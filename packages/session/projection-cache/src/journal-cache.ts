import { createHash, randomUUID } from "node:crypto";
import { open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateEventEnvelopeShape, validateSessionEvents, validateSessionHeader, type EventCodecRegistry, type SessionEventEnvelopeV1, type SessionHeaderV1 } from "@actspace/session-journal";
import type { ProjectionCheckpoint, SessionProjectionRegistry } from "@actspace/session-projection";

type Stored = {
  version: 1; identity: string; inode: string; size: number; stamp: string;
  header: SessionHeaderV1; offsets: number[]; starts: number[]; requests: number[]; turnFloor: number;
  calls: Record<string, number[]>; anchor: { offset: number; length: number; digest: string };
  checkpoint: ProjectionCheckpoint; accessState: "read-write" | "degraded" | "browse-only" | "corrupt";
};
export type ProjectionCacheRead = Readonly<Stored>;

/** Disposable state checkpoints and byte offsets over the durable JSONL prefix. */
export class SessionProjectionCache {
  readonly #pending = new Map<string, Promise<ProjectionCacheRead>>();
  constructor(private readonly options: {
    root: string; codecs: EventCodecRegistry;
    createRegistry: (header: SessionHeaderV1) => SessionProjectionRegistry;
    warn?: (error: unknown) => void;
  }) {}

  read(sessionId: string): Promise<ProjectionCacheRead> {
    const pending = this.#pending.get(sessionId);
    if (pending) return pending;
    const job = this.#read(sessionId).finally(() => this.#pending.delete(sessionId));
    this.#pending.set(sessionId, job);
    return job;
  }

  async idle(): Promise<void> { await Promise.allSettled(this.#pending.values()); }

  async events(read: ProjectionCacheRead, fromSeq = 0, untilSeq = read.offsets.length): Promise<readonly SessionEventEnvelopeV1[]> {
    if (!Number.isSafeInteger(fromSeq) || !Number.isSafeInteger(untilSeq) || fromSeq < 0 || untilSeq < fromSeq || untilSeq > read.offsets.length) throw new Error("Invalid Journal range.");
    if (fromSeq === untilSeq) return [];
    const paths = this.#paths(read.header.sessionId);
    const file = await open(paths.journal, "r");
    try {
      const info = await file.stat();
      if (inode(info) !== read.inode || info.size < read.size || (info.size === read.size && stamp(info) !== read.stamp)) throw new Error("Journal changed while reading history; retry.");
      const start = read.offsets[fromSeq]!;
      const end = read.offsets[untilSeq] ?? read.size;
      return parseEvents(await bytesAt(file, start, end - start), fromSeq, start).events;
    } finally { await file.close(); }
  }

  async #read(sessionId: string): Promise<ProjectionCacheRead> {
    const paths = this.#paths(sessionId);
    const file = await open(paths.journal, "r");
    try {
      const info = await file.stat();
      const prefix = await bytesAt(file, 0, Math.min(info.size, 1024 * 1024 + 1));
      const headerEnd = prefix.indexOf(10);
      if (headerEnd < 0) throw new Error("Journal has no complete Header.");
      const header: unknown = JSON.parse(prefix.subarray(0, headerEnd).toString("utf8"));
      validateSessionHeader(header, sessionId);
      const registry = this.options.createRegistry(header);
      const identity = hash(JSON.stringify({ header, codecs: this.options.codecs.digest, versions: registry.stateVersions }));
      let cached: Stored | undefined;
      try {
        const candidate = JSON.parse(await readFile(paths.cache, "utf8")) as Stored;
        if (candidate.version !== 1 || candidate.identity !== identity || candidate.inode !== inode(info) || candidate.size > info.size || candidate.size < headerEnd + 1 || !Array.isArray(candidate.offsets) || candidate.offsets.length !== candidate.checkpoint.throughJournalSeq + 1) throw new Error("Stale projection checkpoint.");
        if (candidate.size === info.size && candidate.stamp !== stamp(info)) throw new Error("Journal rewritten.");
        if (!Number.isSafeInteger(candidate.anchor.offset) || !Number.isSafeInteger(candidate.anchor.length) || candidate.anchor.offset < 0 || candidate.anchor.offset + candidate.anchor.length !== candidate.size) throw new Error("Invalid checkpoint anchor.");
        if (hash(await bytesAt(file, candidate.anchor.offset, candidate.anchor.length)) !== candidate.anchor.digest) throw new Error("Journal checkpoint anchor changed.");
        registry.restore(sessionId, candidate.checkpoint);
        cached = candidate;
      } catch { registry.sync(sessionId, []); }

      const start = cached?.size ?? headerEnd + 1;
      const tail = await bytesAt(file, start, info.size - start);
      const parsed = parseEvents(tail, cached?.offsets.length ?? 0, start);
      let accessState = cached?.accessState ?? validateSessionEvents(parsed.events, this.options.codecs).accessState;
      for (const event of parsed.events) {
        const resolution = this.options.codecs.resolve(event);
        if (resolution.kind.endsWith("required")) accessState = "browse-only";
        else if (resolution.kind !== "known" && accessState === "read-write") accessState = "degraded";
        registry.apply(sessionId, event);
      }
      const offsets = [...(cached?.offsets ?? []), ...parsed.offsets];
      const starts = [...(cached?.starts ?? [])]; const requests = [...(cached?.requests ?? [])];
      let turnFloor = cached?.turnFloor ?? 0;
      const calls = { ...(cached?.calls ?? {}) };
      for (const event of parsed.events) {
        if (event.type === "turn/start") starts.push(turnFloor);
        if (event.type === "turn/end") turnFloor = event.seq + 1;
        if (event.type === "request/header") requests.push(event.seq);
        const data = event.data;
        const callId = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).callId : null;
        if (typeof callId === "string") calls[callId] = [...(calls[callId] ?? []), event.seq];
      }
      const anchorOffset = offsets.at(-1) ?? 0;
      const anchorBytes = await bytesAt(file, anchorOffset, info.size - anchorOffset);
      const result: Stored = { version: 1, identity, inode: inode(info), stamp: stamp(info), size: info.size, header, offsets, starts, requests, turnFloor, calls, anchor: { offset: anchorOffset, length: anchorBytes.length, digest: hash(anchorBytes) }, checkpoint: registry.checkpoint(sessionId), accessState };
      if (!cached || parsed.events.length) {
        const temporary = `${paths.cache}.${randomUUID()}.tmp`;
        try { await writeFile(temporary, JSON.stringify(result), { mode: 0o600 }); await rename(temporary, paths.cache); }
        catch (error) { this.options.warn?.(error); await unlink(temporary).catch(() => undefined); }
      }
      return result;
    } finally { await file.close(); }
  }

  #paths(sessionId: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sessionId) || sessionId === "." || sessionId === "..") throw new Error("Invalid session id.");
    const root = join(this.options.root, "sessions-v2", sessionId);
    return { journal: join(root, "journal.jsonl"), cache: join(root, "projection-checkpoint.json") };
  }
}

function parseEvents(bytes: Buffer, baseSeq: number, baseOffset: number): { events: SessionEventEnvelopeV1[]; offsets: number[] } {
  const events: SessionEventEnvelopeV1[] = []; const offsets: number[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const end = bytes.indexOf(10, offset);
    if (end < 0) throw new Error("Journal has a torn final line; repair is required.");
    if (end === offset) { offset++; continue; }
    const event: unknown = JSON.parse(bytes.subarray(offset, end).toString("utf8"));
    validateEventEnvelopeShape(event);
    if (event.seq !== baseSeq + events.length) throw new Error("Journal sequence is not contiguous.");
    offsets.push(baseOffset + offset); events.push(event); offset = end + 1;
  }
  return { events, offsets };
}

async function bytesAt(file: Awaited<ReturnType<typeof open>>, offset: number, length: number): Promise<Buffer> {
  const bytes = Buffer.alloc(length); let read = 0;
  while (read < length) { const result = await file.read(bytes, read, length - read, offset + read); if (!result.bytesRead) throw new Error("Journal shortened while reading."); read += result.bytesRead; }
  return bytes;
}
function hash(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function inode(info: Awaited<ReturnType<typeof stat>>): string { return `${info.dev}:${info.ino}`; }
function stamp(info: Awaited<ReturnType<typeof stat>>): string { return `${info.size}:${info.mtimeMs}:${info.ctimeMs}`; }
