import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { SessionRef } from "@actspace/shared/host-protocol";
export interface PendingSubmission { content: string; uploadIds: string[]; ready: boolean }
/** Only previously attempted sends are recorded; this is not an offline task queue. */
export class PendingSubmissions {
  readonly #inflight = new Map<string, Promise<unknown>>();
  constructor(private readonly root: string) {}
  async withRecord<T>(ref: SessionRef, id: string, content: string, action: (record: PendingSubmission, save: () => Promise<void>) => Promise<T>): Promise<T> {
    const key = createHash("sha256").update(JSON.stringify([ref.hostId, ref.sessionId, id])).digest("hex");
    const running = this.#inflight.get(key); if (running) { await running.catch(() => undefined); return this.withRecord(ref, id, content, action); }
    const operation = (async () => {
      const directory = join(this.root, "remote-submissions"), path = join(directory, `${key}.json`);
      let record: PendingSubmission;
      try { record = JSON.parse(await readFile(path, "utf8")); if (record.content !== content) throw new Error("Submission identity already belongs to different content"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; record = { content, uploadIds: [], ready: false }; }
      const save = async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = `${path}.${randomUUID()}.tmp`, file = await open(temporary, "wx", 0o600);
        try { await file.writeFile(JSON.stringify(record)); await file.sync(); } finally { await file.close(); }
        await rename(temporary, path); const dir = await open(directory, "r"); try { await dir.sync(); } finally { await dir.close(); }
      };
      await save(); return action(record, save);
    })();
    this.#inflight.set(key, operation);
    try { return await operation; } finally { this.#inflight.delete(key); }
  }
}
