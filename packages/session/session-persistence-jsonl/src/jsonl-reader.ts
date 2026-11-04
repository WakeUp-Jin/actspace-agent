import { createHash, type Hash } from "node:crypto";
import type { Stats } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import type { EventCodecRegistry } from "@actspace/session-journal";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { validateSessionHeader, type SessionHeaderV1 } from "@actspace/session-journal";
import { SessionEventValidator, type SessionAccessState, type SessionValidationDiagnostic, type SessionValidationResult } from "@actspace/session-journal";
import { queryStamp } from "./query-stamp.js";

export type SessionInspection = {
  readonly journalPath: string;
  readonly header: SessionHeaderV1 | null;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly accessState: SessionAccessState;
  readonly diagnostics: readonly SessionValidationDiagnostic[];
  readonly validation: SessionValidationResult | null;
  readonly tornTail: { readonly offset: number; readonly bytes: Buffer } | null;
  /** SHA-256 of the journal file as read. Large Journals are not kept in memory; callers that need the bytes re-read the file and compare digests. */
  readonly contentDigest: string;
  /** Journal bytes consumed by this inspection. */
  readonly bytes?: number;
};

/**
 * Everything needed to continue an append-only read without touching the bytes already consumed.
 * It is created only from a clean read (no torn tail, valid, file unchanged while being read) and is
 * single-use: `refreshJsonlSession` takes ownership and hands a new state to the extended result.
 */
export type JournalResume = {
  /** dev:ino:birthtime — a different file (rename, repair, recreate) can never be extended. */
  readonly identity: string;
  /** Full physical stamp of the file when `size` bytes had been consumed. */
  readonly stamp: string;
  readonly size: number;
  /** Last bytes already consumed; the next read re-reads and compares them to detect in-place rewrites near the end. */
  readonly tail: Buffer;
  /** Running SHA-256 over bytes [0, size). Never finalized directly; copied before digesting. */
  readonly hash: Hash;
  readonly validator: SessionEventValidator;
  readonly header: SessionHeaderV1;
  readonly events: readonly SessionEventEnvelopeV1[];
  readonly registry: EventCodecRegistry;
};

const TAIL_BYTES = 4096;

export async function inspectJsonlSession(
  journalPath: string,
  registry: EventCodecRegistry,
  expectedSessionId?: string,
): Promise<SessionInspection> {
  return (await readJsonlSession(journalPath, registry, expectedSessionId)).inspection;
}

/** Full read. Same result as `inspectJsonlSession`, plus the state needed to extend it later when it is safely extensible. */
export async function readJsonlSession(
  journalPath: string,
  registry: EventCodecRegistry,
  expectedSessionId?: string,
): Promise<{ readonly inspection: SessionInspection; readonly resume: JournalResume | null }> {
  const handle = await open(journalPath, "r");
  let bytes: Buffer;
  let stat: Stats;
  try {
    // Stat before reading: bytes appended during the read make the next stamp differ instead of hiding.
    stat = await handle.stat();
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  const hash = createHash("sha256").update(bytes);
  const diagnostics: SessionValidationDiagnostic[] = [];
  let header: SessionHeaderV1 | null = null;
  const events: SessionEventEnvelopeV1[] = [];
  let tornTail: SessionInspection["tornTail"] = null;
  try {
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error("Journal must not contain a UTF-8 BOM.");
    const hasFinalLf = bytes.length > 0 && bytes[bytes.length - 1] === 0x0a;
    let parseBytes = bytes;
    if (!hasFinalLf) {
      const lastLf = bytes.lastIndexOf(0x0a);
      const offset = lastLf + 1;
      tornTail = Object.freeze({ offset, bytes: Buffer.from(bytes.subarray(offset)) });
      parseBytes = bytes.subarray(0, offset);
    }
    const lines = parseBytes.toString("utf8").split("\n").filter((line) => line.length > 0);
    if (lines.length === 0) throw new Error("Journal has no Header.");
    const headerValue = JSON.parse(lines[0] as string) as unknown;
    validateSessionHeader(headerValue, expectedSessionId);
    header = headerValue;
    for (let index = 1; index < lines.length; index += 1) {
      events.push(JSON.parse(lines[index] as string) as SessionEventEnvelopeV1);
    }
    const validator = new SessionEventValidator(registry);
    const validation = validator.append(events);
    if (tornTail !== null) {
      diagnostics.push({ code: "INVALID_EVENT", seq: events.length, type: "physical/torn-tail", message: "Journal has a torn final line; explicit repair is required." });
      const inspection = freezeInspection({ journalPath, header, events, accessState: "corrupt", diagnostics: [...validation.diagnostics, ...diagnostics], validation, tornTail, contentDigest: hash.copy().digest("hex"), bytes: bytes.length });
      return { inspection, resume: null };
    }
    // Resume is only sound when the stamp describes exactly the bytes consumed.
    const extensible = bytes.length === stat.size && bytes.length > 0;
    const resume: JournalResume | null = extensible ? {
      identity: identityOf(stat), stamp: queryStamp(stat), size: bytes.length, tail: Buffer.from(bytes.subarray(Math.max(0, bytes.length - TAIL_BYTES))),
      hash, validator, header, events, registry,
    } : null;
    const contentDigest = hash.copy().digest("hex");
    const inspection = freezeInspection({ journalPath, header, events, accessState: validation.accessState, diagnostics: validation.diagnostics, validation, tornTail: null, contentDigest, bytes: bytes.length });
    // The state refers to the frozen array, not the builder array.
    return { inspection, resume: resume ? { ...resume, events: inspection.events } : null };
  } catch (error) {
    diagnostics.push({ code: "INVALID_EVENT", seq: events.length, type: "physical/invalid", message: error instanceof Error ? error.message : String(error) });
    return { inspection: freezeInspection({ journalPath, header, events, accessState: "corrupt", diagnostics, validation: null, tornTail, contentDigest: hash.copy().digest("hex"), bytes: bytes.length }), resume: null };
  }
}

export type JournalRefresh =
  | { readonly kind: "unchanged" }
  | { readonly kind: "appended"; readonly inspection: SessionInspection; readonly resume: JournalResume; readonly fromEvent: number }
  /** Not provably append-only (or anything unexpected): the caller must do a full read. */
  | { readonly kind: "full" };

/**
 * Bring a clean read up to date. Reads only the bytes appended after `resume.size` (plus a small tail
 * overlap used to detect rewrites), and parses and validates only the new events.
 * Takes ownership of `resume` (its hash and validator are advanced); on `full` it must be discarded.
 * File-level errors such as ENOENT propagate exactly as they do for a full read.
 */
export async function refreshJsonlSession(journalPath: string, resume: JournalResume): Promise<JournalRefresh> {
  const handle = await open(journalPath, "r");
  try {
    const stat = await handle.stat();
    if (identityOf(stat) !== resume.identity) return { kind: "full" };
    if (stat.size === resume.size) return queryStamp(stat) === resume.stamp ? { kind: "unchanged" } : { kind: "full" };
    if (stat.size < resume.size) return { kind: "full" };
    try { return await extend(handle, stat, journalPath, resume); }
    catch { return { kind: "full" }; }
  } finally { await handle.close(); }
}

async function extend(handle: FileHandle, stat: Stats, journalPath: string, resume: JournalResume): Promise<JournalRefresh> {
  const from = resume.size - resume.tail.length;
  const buffer = Buffer.allocUnsafe(stat.size - from);
  let filled = 0;
  while (filled < buffer.length) {
    const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, from + filled);
    if (bytesRead === 0) return { kind: "full" };
    filled += bytesRead;
  }
  if (!buffer.subarray(0, resume.tail.length).equals(resume.tail)) return { kind: "full" };
  const added = buffer.subarray(resume.tail.length);
  // A partial last line is the torn-tail case; let the full reader report it with its exact diagnostics.
  if (added[added.length - 1] !== 0x0a) return { kind: "full" };
  const next: SessionEventEnvelopeV1[] = [];
  for (const line of added.toString("utf8").split("\n")) if (line.length > 0) next.push(JSON.parse(line) as SessionEventEnvelopeV1);
  const validation = resume.validator.append(next, () => resume.events);
  resume.hash.update(added);
  const events = Object.freeze([...resume.events, ...next]);
  const inspection: SessionInspection = Object.freeze({
    journalPath, header: resume.header, events, accessState: validation.accessState, diagnostics: validation.diagnostics,
    validation, tornTail: null, contentDigest: resume.hash.copy().digest("hex"), bytes: stat.size,
  });
  const tail = Buffer.concat([resume.tail, added]);
  return {
    kind: "appended", inspection, fromEvent: resume.events.length,
    resume: { ...resume, stamp: queryStamp(stat), size: stat.size, tail: tail.subarray(Math.max(0, tail.length - TAIL_BYTES)), events },
  };
}

function identityOf(stat: Stats): string {
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}

function freezeInspection(value: SessionInspection): SessionInspection {
  return Object.freeze({ ...value, events: Object.freeze(value.events as SessionEventEnvelopeV1[]), diagnostics: Object.freeze([...value.diagnostics]) });
}
