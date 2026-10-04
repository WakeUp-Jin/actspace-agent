import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { HOST_LIMITS, HostError } from "@actspace/shared/host-protocol";
import { SerialGate, writeDurableJson } from "./storage.js";

type Upload = {
  version: 1; id: string; deviceId: string; sessionId: string; name: string;
  size: number; sha256: string; offset: number; createdAt: number;
  complete: boolean; pins: string[];
};
export type UploadReference = Pick<Upload, "id" | "name" | "size" | "sha256" | "offset" | "complete">;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** One writer per Host data root. Metadata is the acknowledged offset authority. */
export class HostUploads {
  readonly #gate = new SerialGate();
  #failed = false;
  constructor(private readonly root: string, private readonly now = Date.now) {}
  #directory(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new HostError("NOT_FOUND", "Upload not found");
    return join(this.root, id);
  }
  async #read(id: string): Promise<Upload> {
    if (this.#failed) throw new HostError("RECOVERY_BLOCKED", "Upload persistence failed; restart required");
    let value: Upload;
    try { value = JSON.parse(await readFile(join(this.#directory(id), "state.json"), "utf8")) as Upload; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HostError("NOT_FOUND", "Upload not found"); throw error; }
    if (value.version !== 1 || value.id !== id || !Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > value.size || !Array.isArray(value.pins)) throw new HostError("RECOVERY_BLOCKED", "Invalid upload state");
    return value;
  }
  #check(value: Upload, deviceId: string, sessionId: string) {
    if (value.deviceId !== deviceId || value.sessionId !== sessionId) throw new HostError("FORBIDDEN", "Upload ownership mismatch");
  }
  #reference(value: Upload): UploadReference {
    const { id, name, size, sha256, offset, complete } = value; return { id, name, size, sha256, offset, complete };
  }
  async #save(value: Upload) {
    if (this.#failed) throw new HostError("RECOVERY_BLOCKED", "Upload persistence failed; restart required");
    try { await writeDurableJson(join(this.#directory(value.id), "state.json"), value); }
    catch (error) { this.#failed = true; throw error; }
  }
  begin(input: { deviceId: string; sessionId: string; name: string; size: number; sha256: string }): Promise<UploadReference> {
    return this.#gate.run(async () => {
      if (!Number.isSafeInteger(input.size) || input.size < 0 || input.size > HOST_LIMITS.fileBytes || !/^[a-f0-9]{64}$/.test(input.sha256) || !input.name.trim() || input.name.length > 255 || /[\x00-\x1f/\\]/.test(input.name)) throw new TypeError("Invalid upload metadata");
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      let reserved = 0;
      for (const id of await readdir(this.root)) {
        let item: Upload;
        try { item = await this.#read(id); }
        catch (error) { if (error instanceof HostError && error.kind === "NOT_FOUND") continue; throw error; }
        if (item.deviceId === input.deviceId && item.pins.length === 0) reserved += item.size;
      }
      if (reserved + input.size > 200 * 1024 * 1024) throw new HostError("LIMIT_EXCEEDED", "Device staging quota exceeded");
      const value: Upload = { ...input, version: 1, id: randomUUID(), offset: 0, createdAt: this.now(), complete: false, pins: [] };
      const directory = this.#directory(value.id);
      await mkdir(directory, { mode: 0o700 });
      const file = await open(join(directory, "content"), "wx", 0o600);
      try { await file.sync(); } finally { await file.close(); }
      await this.#save(value);
      return this.#reference(value);
    });
  }
  status(deviceId: string, sessionId: string, id: string): Promise<UploadReference> {
    return this.#gate.run(async () => {
      const value = await this.#read(id); this.#check(value, deviceId, sessionId);
      return this.#reference(value);
    });
  }
  write(deviceId: string, sessionId: string, id: string, offset: number, encoded: string, sha256: string): Promise<UploadReference> {
    return this.#gate.run(async () => {
      if (!Number.isSafeInteger(offset) || offset < 0 || encoded.length > Math.ceil(HOST_LIMITS.chunkBytes / 3) * 4) throw new TypeError("Invalid upload chunk");
      const bytes = Buffer.from(encoded, "base64");
      if (!bytes.length || bytes.length > HOST_LIMITS.chunkBytes || bytes.toString("base64") !== encoded || digest(bytes) !== sha256) throw new TypeError("Invalid upload chunk digest or encoding");
      const value = await this.#read(id); this.#check(value, deviceId, sessionId);
      if (offset + bytes.length > value.size || offset > value.offset) throw new HostError("CONFLICT", "Upload offset mismatch");
      const file = await open(join(this.#directory(id), "content"), "r+");
      try {
        if (offset < value.offset) {
          if (offset + bytes.length > value.offset) throw new HostError("CONFLICT", "Chunk overlaps acknowledged boundary");
          const existing = Buffer.alloc(bytes.length); const read = await file.read(existing, 0, bytes.length, offset);
          if (read.bytesRead !== bytes.length || !existing.equals(bytes)) throw new HostError("CONFLICT", "Acknowledged chunk differs");
          return this.#reference(value);
        }
        if (value.complete) throw new HostError("CONFLICT", "Upload already finished");
        // A crash can leave unacknowledged bytes. Remove them before the next write.
        await file.truncate(value.offset);
        let written = 0;
        while (written < bytes.length) {
          const result = await file.write(bytes, written, bytes.length - written, offset + written);
          if (result.bytesWritten === 0) throw new Error("Upload write made no progress");
          written += result.bytesWritten;
        }
        await file.sync();
        const next = { ...value, offset: offset + bytes.length };
        await this.#save(next); return this.#reference(next);
      } finally { await file.close(); }
    });
  }
  finish(deviceId: string, sessionId: string, id: string): Promise<UploadReference> {
    return this.#gate.run(async () => {
      const value = await this.#read(id); this.#check(value, deviceId, sessionId);
      if (value.offset !== value.size) throw new HostError("CONFLICT", "Upload incomplete");
      const path = join(this.#directory(id), "content");
      // Upper bound is 20 MiB. Read only the acknowledged content after truncation.
      const file = await open(path, "r+");
      try { await file.truncate(value.offset); await file.sync(); } finally { await file.close(); }
      if (digest(await readFile(path)) !== value.sha256) throw new HostError("CONFLICT", "Upload digest mismatch");
      const next = { ...value, complete: true }; await this.#save(next); return this.#reference(next);
    });
  }
  /** Persist pins before accepting a task; callers reconcile orphan pins against the task ledger. */
  pin(deviceId: string, sessionId: string, ids: readonly string[], submissionId: string): Promise<readonly UploadReference[]> {
    return this.#gate.run(async () => {
      if (ids.length > HOST_LIMITS.messageFiles || new Set(ids).size !== ids.length) throw new HostError("LIMIT_EXCEEDED", "Too many attachments");
      const values = await Promise.all(ids.map(id => this.#read(id)));
      for (const value of values) { this.#check(value, deviceId, sessionId); if (!value.complete) throw new HostError("CONFLICT", "Attachment incomplete"); }
      if (values.reduce((sum, value) => sum + value.size, 0) > HOST_LIMITS.messageBytes) throw new HostError("LIMIT_EXCEEDED", "Attachments exceed message limit");
      for (const value of values) if (!value.pins.includes(submissionId)) await this.#save({ ...value, pins: [...value.pins, submissionId] });
      return values.map(value => this.#reference(value));
    });
  }
  abort(deviceId: string, sessionId: string, id: string): Promise<void> {
    return this.#gate.run(async () => {
      const value = await this.#read(id); this.#check(value, deviceId, sessionId);
      if (value.pins.length) throw new HostError("CONFLICT", "Task attachment cannot be deleted");
      await rm(this.#directory(id), { recursive: true });
    });
  }
  describe(sessionId: string, id: string): Promise<UploadReference> {
    return this.#gate.run(async () => {
      const value = await this.#read(id);
      if (value.sessionId !== sessionId || !value.complete || !value.pins.length) throw new HostError("NOT_FOUND", "Session artifact not found");
      return this.#reference(value);
    });
  }
  resolve(sessionId: string, id: string): Promise<{ path: string; mediaType: string }> {
    return this.#gate.run(async () => {
      const value = await this.#read(id);
      if (value.sessionId !== sessionId || !value.complete || !value.pins.length) throw new HostError("NOT_FOUND", "Session artifact not found");
      const path = join(this.#directory(id), "content");
      const bytes = await readFile(path);
      if (bytes.length !== value.size || digest(bytes) !== value.sha256) throw new HostError("RECOVERY_BLOCKED", "Artifact integrity check failed");
      return { path, mediaType: detectMediaType(bytes) };
    });
  }
  async readForSession(sessionId: string, id: string): Promise<{ bytes: Uint8Array; mediaType: string }> {
    const value = await this.resolve(sessionId, id);
    return { bytes: await readFile(value.path), mediaType: value.mediaType };
  }
  /** All authenticated owner devices may read committed session attachments. */
  read(sessionId: string, id: string, offset: number, length: number): Promise<{ data: string; sha256: string; size: number }> {
    return this.#gate.run(async () => {
      const value = await this.#read(id);
      if (value.sessionId !== sessionId || !value.complete || !value.pins.length) throw new HostError("NOT_FOUND", "Session artifact not found");
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > value.size || !Number.isSafeInteger(length) || length < 1 || length > HOST_LIMITS.chunkBytes) throw new TypeError("Invalid artifact range");
      const file = await open(join(this.#directory(id), "content"), "r");
      try {
        const bytes = Buffer.alloc(Math.min(length, value.size - offset));
        const result = await file.read(bytes, 0, bytes.length, offset);
        if (result.bytesRead !== bytes.length) throw new HostError("RECOVERY_BLOCKED", "Artifact content missing");
        return { data: bytes.toString("base64"), sha256: digest(bytes), size: value.size };
      } finally { await file.close(); }
    });
  }
  reconcilePins(exists: (sessionId: string, submissionId: string) => Promise<boolean>): Promise<void> {
    return this.#gate.run(async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      for (const id of await readdir(this.root)) {
        let value: Upload;
        try { value = await this.#read(id); } catch (error) { if (error instanceof HostError && error.kind === "NOT_FOUND") continue; throw error; }
        const pins: string[] = [];
        for (const pin of value.pins) if (await exists(value.sessionId, pin)) pins.push(pin);
        if (pins.length !== value.pins.length) await this.#save({ ...value, pins });
      }
    });
  }
  cleanup(): Promise<void> {
    return this.#gate.run(async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      for (const id of await readdir(this.root)) {
        // An interrupted begin can leave a directory without metadata.
        let value: Upload;
        try { value = await this.#read(id); }
        catch (error) {
          if (!(error instanceof HostError) || error.kind !== "NOT_FOUND") throw error;
          if (this.now() - (await stat(this.#directory(id))).mtimeMs > 86_400_000) await rm(this.#directory(id), { recursive: true });
          continue;
        }
        if (!value.pins.length && this.now() - value.createdAt > 86_400_000) await rm(this.#directory(id), { recursive: true });
      }
    });
  }
}

function detectMediaType(bytes: Uint8Array): string {
  const value = Buffer.from(bytes);
  if (value.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (value[0] === 255 && value[1] === 216 && value[2] === 255) return "image/jpeg";
  if (value.subarray(0, 4).toString() === "RIFF" && value.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return "application/octet-stream";
}
