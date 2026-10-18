import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { SessionError, snapshotSessionJson, type SessionEventEnvelopeV1, type SessionEventHistory } from "@actspace/session-journal";

/** Byte locators retain no event bodies. The fd pins this writer's file identity. */
export class JsonlEventHistory implements SessionEventHistory {
  private readonly fd: number;
  private readonly ends: number[] = [];
  private closed = false;
  constructor(path: string, expectedEvents: number) {
    this.fd = openSync(path, "r");
    try {
      const buffer = Buffer.allocUnsafe(64 * 1024);
      let offset = 0, lineStart = 0;
      for (;;) {
        const length = readSync(this.fd, buffer, 0, buffer.length, offset);
        if (!length) break;
        for (let index = 0; index < length; index++) if (buffer[index] === 10) {
          const end = offset + index + 1;
          if (end - lineStart > 1) this.ends.push(end);
          else if (this.ends.length) this.ends[this.ends.length - 1] = end;
          lineStart = end;
        }
        offset += length;
      }
      if (this.ends.length !== expectedEvents + 1 || this.ends.at(-1) !== offset) throw new SessionError("SESSION_CORRUPT", "Journal byte index does not match the validated prefix.");
    } catch (error) { closeSync(this.fd); throw error; }
  }
  appended(events: readonly SessionEventEnvelopeV1[]): void {
    let end = this.ends.at(-1)!;
    for (const event of events) {
      if (event.seq !== this.ends.length - 1) throw new SessionError("SESSION_CORRUPT", "Journal history sequence gap.");
      end += Buffer.byteLength(JSON.stringify(event) + "\n"); this.ends.push(end);
    }
  }
  readEvents(start: number, end: number): readonly SessionEventEnvelopeV1[] {
    if (this.closed) throw new SessionError("SESSION_CLOSED", "Journal history is closed.");
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > this.ends.length - 1) throw new SessionError("INVALID_EVENT", "History range is outside the durable Journal.");
    if (fstatSync(this.fd).size < this.ends.at(-1)!) throw new SessionError("SESSION_CORRUPT", "Journal was truncated while owned.");
    const events: SessionEventEnvelopeV1[] = [];
    // Read bounded pages; a single oversized record must still be readable.
    for (let seq = start; seq < end;) {
      let next = seq + 1;
      while (next < end && this.ends[next + 1]! - this.ends[seq]! <= 256 * 1024) next++;
      const position = this.ends[seq]!;
      const bytes = Buffer.allocUnsafe(this.ends[next]! - position);
      let read = 0;
      while (read < bytes.length) {
        const count = readSync(this.fd, bytes, read, bytes.length - read, position + read);
        if (!count) throw new SessionError("SESSION_CORRUPT", "Journal history read ended early.");
        read += count;
      }
      for (const line of bytes.toString("utf8").split("\n").filter(line => line.length > 0)) {
        const event = JSON.parse(line) as SessionEventEnvelopeV1;
        if (event.recordKind !== "event" || event.seq !== seq) throw new SessionError("SESSION_CORRUPT", `History sequence mismatch at ${seq}.`);
        events.push(snapshotSessionJson(event)); seq++;
      }
    }
    return Object.freeze(events);
  }
  close(): void { if (!this.closed) { this.closed = true; closeSync(this.fd); } }
}
