import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionHeaderV1 } from "@actspace/session-journal";
import { SessionError } from "@actspace/session-journal";

export type JsonlWriteOperation = "open" | "header-write" | "append-write" | "file-fsync" | "truncate" | "directory-fsync" | "rename";

export type JsonlWriterHooks = {
  readonly before?: (operation: JsonlWriteOperation) => void | Promise<void>;
  readonly afterWriteChunk?: (operation: "header-write" | "append-write", writtenBytes: number, totalBytes: number) => void | Promise<void>;
  readonly maxWriteBytes?: number;
};

export class JsonlSessionWriter {
  #handle: Awaited<ReturnType<typeof open>> | null;
  #position: number;
  #closed = false;
  #corrupt = false;

  private constructor(
    readonly journalPath: string,
    handle: Awaited<ReturnType<typeof open>>,
    position: number,
    private readonly hooks: JsonlWriterHooks,
  ) {
    this.#handle = handle;
    this.#position = position;
  }

  static async create(journalPath: string, header: SessionHeaderV1, hooks: JsonlWriterHooks = {}): Promise<JsonlSessionWriter> {
    const directory = dirname(journalPath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = join(directory, `.journal-${randomUUID()}.tmp`);
    await hooks.before?.("open");
    const temporary = await open(temporaryPath, "wx", 0o600);
    try {
      const bytes = encodeRows([header]);
      await hooks.before?.("header-write");
      await writeAll(temporary, bytes, 0, "header-write", hooks);
      await hooks.before?.("file-fsync");
      await temporary.sync();
      await temporary.close();
      const existing = await stat(journalPath).then(() => true, (error: unknown) => {
        if (errorCode(error) === "ENOENT") return false;
        throw error;
      });
      if (existing) throw new SessionError("INVALID_HEADER", `Session Journal already exists at ${journalPath}.`);
      await hooks.before?.("rename");
      await rename(temporaryPath, journalPath);
      await syncDirectory(directory, hooks);
      return JsonlSessionWriter.open(journalPath, hooks);
    } catch (error) {
      await temporary.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (error instanceof SessionError) throw error;
      throw new SessionError("SESSION_DURABILITY_FAILED", "Failed to publish Session Header.", error);
    }
  }

  static async open(journalPath: string, hooks: JsonlWriterHooks = {}): Promise<JsonlSessionWriter> {
    await hooks.before?.("open");
    const handle = await open(journalPath, "r+", 0o600);
    const stat = await handle.stat();
    return new JsonlSessionWriter(journalPath, handle, stat.size, hooks);
  }

  get corrupt(): boolean {
    return this.#corrupt;
  }

  async append(events: readonly SessionEventEnvelopeV1[]): Promise<void> {
    if (events.length === 0) return;
    const handle = this.#assertWritable();
    const originalLength = this.#position;
    const bytes = encodeRows(events);
    try {
      await this.hooks.before?.("append-write");
      await writeAll(handle, bytes, originalLength, "append-write", this.hooks);
      await this.hooks.before?.("file-fsync");
      await handle.sync();
      this.#position += bytes.length;
    } catch (error) {
      try {
        await this.hooks.before?.("truncate");
        await handle.truncate(originalLength);
        await handle.sync();
      } catch (rollbackError) {
        this.#corrupt = true;
        await this.close().catch(() => undefined);
        throw new SessionError("SESSION_CORRUPT", "Append failed and the Journal length could not be restored.", { error, rollbackError });
      }
      throw new SessionError("SESSION_DURABILITY_FAILED", "Journal append failed before durability.", error);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const handle = this.#handle;
    this.#handle = null;
    await handle?.close();
  }

  #assertWritable(): Awaited<ReturnType<typeof open>> {
    if (this.#closed || this.#handle === null) throw new SessionError("SESSION_CLOSED", "Session writer is closed.");
    if (this.#corrupt) throw new SessionError("SESSION_CORRUPT", "Session writer is corrupt.");
    return this.#handle;
  }
}

export function encodeRows(rows: readonly (SessionHeaderV1 | SessionEventEnvelopeV1)[]): Buffer {
  return Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function writeAll(
  handle: Awaited<ReturnType<typeof open>>,
  bytes: Buffer,
  startPosition: number,
  operation: "header-write" | "append-write",
  hooks: JsonlWriterHooks,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) {
    const length = Math.min(bytes.length - offset, hooks.maxWriteBytes ?? bytes.length);
    const result = await handle.write(bytes, offset, length, startPosition + offset);
    if (result.bytesWritten <= 0) throw new Error("File write made no progress.");
    offset += result.bytesWritten;
    await hooks.afterWriteChunk?.(operation, offset, bytes.length);
  }
}

async function syncDirectory(directory: string, hooks: JsonlWriterHooks): Promise<void> {
  await hooks.before?.("directory-fsync");
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : undefined;
}
