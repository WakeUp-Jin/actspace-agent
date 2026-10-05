import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SessionWriterLease } from "@actspace/session-jsonl";
import { canonical } from "@actspace/composition";
import { HarnessControlError, type SelectionRecord } from "./contracts.js";
export const selectionHash = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
/** The append log is authoritative. Never acknowledge a mutation before fsync. */
export class SelectionStore {
  readonly records: SelectionRecord[] = [];
  #lease?: SessionWriterLease;
  #failure?: unknown;
  #tail: Promise<unknown> = Promise.resolve();
  constructor(readonly root: string, readonly runtimeId: string) {}
  get failure(): unknown { return this.#failure; }
  async open(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await syncDirectory(dirname(this.root));
    try { this.#lease = await SessionWriterLease.acquire({ sessionDir: this.root, sessionId: "harness-selections", runtimeId: this.runtimeId }); }
    catch (cause) { throw new HarnessControlError("STORE_LOCKED", "Harness selection store is owned by another Host", { cause }); }
    try {
      let bytes: string;
      try { bytes = await readFile(join(this.root, "selections.jsonl"), "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      const completeEnd = bytes.lastIndexOf("\n") + 1;
      const complete = bytes.slice(0, completeEnd);
      for (const line of complete.length ? complete.slice(0, -1).split("\n") : []) {
        const row = JSON.parse(line) as { seq: number; checksum: string; record: SelectionRecord };
        if (row.seq !== this.records.length + 1 || row.checksum !== selectionHash({ seq: row.seq, record: row.record })) throw new Error("Selection checksum or sequence mismatch");
        this.#validate(row.record);
        this.records.push(row.record);
      }
      if (completeEnd !== bytes.length) {
        const recovery = join(this.root, "recovery");
        await mkdir(recovery, { recursive: true });
        const evidence = await open(join(recovery, `partial-${randomUUID()}.jsonl`), "wx", 0o600);
        try { await evidence.writeFile(bytes); await evidence.sync(); } finally { await evidence.close(); }
        await syncDirectory(recovery);
        await syncDirectory(this.root);
        const file = await open(join(this.root, "selections.jsonl"), "r+");
        try { await file.truncate(Buffer.byteLength(complete)); await file.sync(); } finally { await file.close(); }
      }
    } catch (cause) { this.#failure = new HarnessControlError("RECOVERY_BLOCKED", "Harness selection log cannot be recovered", { cause }); throw this.#failure; }
  }
  async assertOwned(): Promise<void> {
    if (this.#failure) throw this.#failure;
    try { if (!this.#lease) throw new Error("Store is closed"); await this.#lease.assertOwned(); }
    catch (cause) { this.#failure = new HarnessControlError("DURABILITY_BLOCKED", "Harness selection ownership lost", { cause }); throw this.#failure; }
  }
  append(record: SelectionRecord): Promise<void> {
    const next = this.#tail.then(async () => {
      await this.assertOwned();
      this.#validate(record);
      const seq = this.records.length + 1;
      const row = { seq, record, checksum: selectionHash({ seq, record }) };
      try {
        const file = await open(join(this.root, "selections.jsonl"), "a", 0o600);
        try { await file.writeFile(JSON.stringify(row) + "\n"); await file.sync(); } finally { await file.close(); }
        const directory = await open(this.root, "r");
        try { await directory.sync(); } finally { await directory.close(); }
        await this.assertOwned();
        this.records.push(structuredClone(record));
      } catch (cause) { this.#failure = new HarnessControlError("DURABILITY_BLOCKED", "Harness selection write failed", { cause }); throw this.#failure; }
    });
    this.#tail = next.catch(() => undefined);
    return next;
  }
  latest(id: string): SelectionRecord | undefined { return [...this.records].reverse().find(r => r.harnessId === id); }
  async close(): Promise<void> { await this.#tail; await this.#lease?.dispose(); this.#lease = undefined; }
  #validate(record: SelectionRecord): void {
    if (!record || typeof record.harnessId !== "string" || typeof record.activationId !== "string" || typeof record.requestDigest !== "string" || !record.requestDigest || typeof record.executionDigest !== "string" || !record.authorization?.actor || !record.authorization?.decisionId || !Number.isFinite(Date.parse(record.timestamp)) || !Array.isArray(record.description?.artifactIds) || !Array.isArray(record.description?.sharedServices) || !record.description?.composition) throw new HarnessControlError("RECOVERY_BLOCKED", "Malformed selection record");
    const previous = this.latest(record.harnessId)?.revision ?? 0;
    if (record.schemaVersion !== 1 || !record.activationId || !record.harnessId || !record.executionDigest || !record.description || !Number.isSafeInteger(record.revision) || record.previousRevision !== previous || record.revision !== previous + 1 || this.records.some(r => r.activationId === record.activationId)) throw new HarnessControlError("RECOVERY_BLOCKED", "Invalid selection record or revision");
  }
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, "r");
  try { await directory.sync(); } finally { await directory.close(); }
}
