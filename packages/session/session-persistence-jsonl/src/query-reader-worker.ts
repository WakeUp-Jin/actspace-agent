import { openSync, closeSync, readSync, fstatSync, statSync } from "node:fs";
import { queryStamp as sourceStamp } from "./query-stamp.js";
import { createHash } from "node:crypto";
import { parentPort } from "node:worker_threads";
import { validateSessionHeader, validateEventEnvelopeShape, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionQuerySource, SessionEventBatch, SessionEventBatchInput } from "@actspace/session-storage";

type Cursor = { version: 1; sessionId: string; identity: string; offset: number; seq: number; boundary: string };
const MAX_LINE = 1024 * 1024;
const MAX_BATCH = 256 * 1024;
parentPort?.on("message", (message: { id: number; path: string; sessionId: string; input?: SessionEventBatchInput; sources?: readonly { path: string; sessionId: string }[] }) => {
  try { parentPort?.postMessage({ id: message.id, result: message.sources ? readSources(message.sources) : message.input ? readBatch(message.path, message.sessionId, message.input) : readSource(message.path, message.sessionId) }); }
  catch (error) { parentPort?.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) }); }
});

/** Cursor stores an implementation-private byte offset plus file and boundary identity.
 * Append-only growth is allowed; replacement, truncation and changed boundaries invalidate it. */
function readBatch(path: string, sessionId: string, input: SessionEventBatchInput): SessionEventBatch {
  if (!Number.isSafeInteger(input.throughSeq) || input.throughSeq < -1) throw new Error("Invalid Journal query revision.");
  if (input.eventTypes && (input.eventTypes.length > 32 || input.eventTypes.some(type => typeof type !== "string" || type.length > 128))) throw new Error("Invalid Journal event filter.");
  const eventTypes = input.eventTypes ? new Set(input.eventTypes) : undefined;
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd);
    const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
    let offset = 0; let seq = -1;
    if (input.cursor) {
      if (input.cursor.length > 2048) throw new Error("Invalid Journal query cursor.");
      const cursor = JSON.parse(input.cursor) as Cursor;
      if (cursor.version !== 1 || cursor.sessionId !== sessionId || cursor.identity !== identity || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > stat.size || !Number.isSafeInteger(cursor.seq) || cursor.seq < -1 || cursor.seq > input.throughSeq || boundary(fd, cursor.offset) !== cursor.boundary) throw new Error("Journal query cursor invalidated; rebuild Session index.");
      offset = cursor.offset; seq = cursor.seq;
    }
    const events: SessionEventEnvelopeV1[] = [];
    let bytes = 0; let scanned = 0;
    // Read small blocks and retain at most one legal record between blocks.
    let buffered = Buffer.alloc(0); let position = offset;
    while (seq < input.throughSeq || offset === 0) {
      let newline = buffered.indexOf(10);
      if (newline < 0) {
        const block = Buffer.allocUnsafe(Math.min(64 * 1024, stat.size - position));
        const size = readSync(fd, block, 0, block.length, position);
        if (size === 0) throw new Error("Journal durable prefix has not reached the requested revision.");
        position += size;
        buffered = Buffer.concat([buffered, block.subarray(0, size)]);
        newline = buffered.indexOf(10);
        if ((newline < 0 ? buffered.length : newline) > MAX_LINE) throw new Error("Journal record exceeds 1 MiB.");
        if (newline < 0) continue;
      }
      const line = buffered.subarray(0, newline);
      if (line.length > MAX_LINE) throw new Error("Journal record exceeds 1 MiB.");
      const value: unknown = JSON.parse(line.toString("utf8"));
      if (offset === 0) validateSessionHeader(value, sessionId);
      else {
        validateEventEnvelopeShape(value);
        if (value.seq !== seq + 1) throw new Error("Journal sequence is discontinuous.");
        seq = value.seq;
        scanned++;
        if (!eventTypes || eventTypes.has(value.type)) events.push(value);
      }
      offset += newline + 1; bytes += newline + 1;
      buffered = buffered.subarray(newline + 1);
      if (bytes >= MAX_BATCH || scanned >= 256) break;
    }
    const current = fstatSync(fd);
    if (current.size < stat.size || current.ino !== stat.ino) throw new Error("Journal changed during query read.");
    const cursor: Cursor = { version: 1, sessionId, identity, offset, seq, boundary: boundary(fd, offset) };
    return { events, cursor: JSON.stringify(cursor), done: seq === input.throughSeq };
  } finally { closeSync(fd); }
}

function boundary(fd: number, offset: number): string {
  const length = Math.min(offset, 128);
  const bytes = Buffer.alloc(length);
  readSync(fd, bytes, 0, length, offset - length);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Two bounded reads independent of file size. The complete newline-terminated
 * prefix is query-visible; incomplete tail bytes are left to Session recovery. */
const sourceCache = new Map<string, { source: SessionQuerySource; bytes: number }>();
let sourceCacheBytes = 0;
function readSources(sources: readonly { path: string; sessionId: string }[]): readonly SessionQuerySource[] {
  if (sources.length > 128) throw new Error("Query descriptor batch exceeds 128 sessions.");
  let bytes = 0;
  return sources.map(source => {
    const result = readSource(source.path, source.sessionId);
    bytes += Buffer.byteLength(JSON.stringify(result));
    if (bytes > 2 * 1024 * 1024) throw new Error("Query descriptor batch exceeds 2 MiB.");
    return result;
  });
}
function readSource(path: string, sessionId: string): SessionQuerySource {
  const cached = sourceCache.get(sessionId);
  // A fresh stat preserves query-time change detection without opening every
  // unchanged Journal. Changed files are reopened and re-statted before parsing.
  if (cached && cached.source.stamp === sourceStamp(statSync(path))) return cached.source;
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd);
    const stamp = sourceStamp(stat);
    if (cached?.source.stamp === stamp) return cached.source;
    let head = Buffer.alloc(0);
    while (head.indexOf(10) < 0 && head.length < Math.min(stat.size, MAX_LINE + 1)) {
      const block = Buffer.alloc(Math.min(4096, stat.size - head.length, MAX_LINE + 1 - head.length));
      readSync(fd, block, 0, block.length, head.length);
      head = Buffer.concat([head, block]);
    }
    const newline = head.indexOf(10);
    if (newline < 0) throw new Error("Invalid or oversized Journal header.");
    const header: unknown = JSON.parse(head.subarray(0, newline).toString("utf8"));
    validateSessionHeader(header, sessionId);
    const offset = Math.max(newline + 1, stat.size - MAX_LINE * 2 - 2);
    const tail = Buffer.alloc(stat.size - offset);
    readSync(fd, tail, 0, tail.length, offset);
    const end = tail.lastIndexOf(10);
    let throughSeq = -1;
    if (end >= 0) {
      const start = tail.lastIndexOf(10, end - 1) + 1;
      if ((start === 0 && offset !== newline + 1) || end - start > MAX_LINE) throw new Error("Invalid or oversized Journal tail.");
      const event: unknown = JSON.parse(tail.subarray(start, end).toString("utf8"));
      validateEventEnvelopeShape(event);
      throughSeq = event.seq;
    } else if (tail.length > MAX_LINE) throw new Error("Journal incomplete tail exceeds 1 MiB.");
    const result: SessionQuerySource = { header: { sessionId: header.sessionId, createdAt: header.createdAt, cwd: header.cwd, worktree: header.worktree, lineage: header.lineage, createdWith: { profileId: header.createdWith.profileId, presetId: header.createdWith.presetId, initialAgentMode: header.createdWith.initialAgentMode } }, throughSeq, stamp };
    const bytes = Buffer.byteLength(JSON.stringify(result));
    if (cached) { sourceCacheBytes -= cached.bytes; sourceCache.delete(sessionId); }
    while (sourceCache.size >= 10_000 || sourceCacheBytes + bytes > 16 * 1024 * 1024) {
      const first = sourceCache.keys().next().value;
      if (!first) break;
      sourceCacheBytes -= sourceCache.get(first)!.bytes; sourceCache.delete(first);
    }
    sourceCache.set(sessionId, { source: result, bytes }); sourceCacheBytes += bytes;
    return result;
  } finally { closeSync(fd); }
}
