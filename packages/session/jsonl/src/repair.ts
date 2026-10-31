import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SessionError, SessionJournal, type EventCodecRegistry } from "@actspace/session-journal";
import type { SessionInspection } from "./jsonl-reader.js";
import { encodeRows } from "./jsonl-writer.js";
import { SessionWriterLease } from "./writer-lease.js";
export async function repairTornJsonlSession(options: {
  readonly inspection: SessionInspection;
  readonly registry: EventCodecRegistry;
  readonly runtimeId: string;
}): Promise<{ readonly repairId: string | null; readonly forensicPath: string }> {
  const { inspection } = options;
  if (inspection.header === null || inspection.tornTail === null || inspection.validation === null) {
    throw new SessionError("SESSION_CORRUPT", "Only a validated prefix with a torn final line can use torn-tail repair.");
  }
  const sessionDir = dirname(inspection.journalPath);
  const recoveryDir = join(sessionDir, "recovery");
  await mkdir(recoveryDir, { recursive: true });
  const lease = await SessionWriterLease.acquire({ sessionDir, sessionId: inspection.header.sessionId, runtimeId: options.runtimeId });
  const digest = inspection.contentDigest;
  const forensicPath = join(recoveryDir, `${digest}.journal.jsonl`);
  const temporaryPath = join(sessionDir, `.repair-${randomUUID()}.tmp`);
  try {
    if (createHash("sha256").update(await readFile(inspection.journalPath)).digest("hex") !== digest) throw new Error("Journal changed after inspection; inspect again before repair.");
    await copyFile(inspection.journalPath, forensicPath);
    await syncFile(forensicPath);
    const journal = new SessionJournal({ registry: options.registry, seed: inspection.events, now: () => new Date().toISOString() });
    // Only repair the physical prefix. SessionStore performs semantic recovery after open.
    const temporary = await open(temporaryPath, "wx", 0o600);
    try {
      await temporary.writeFile(encodeRows([inspection.header, ...journal.events]));
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    await rename(temporaryPath, inspection.journalPath);
    await syncDirectory(sessionDir);
    return Object.freeze({ repairId: null, forensicPath });
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    await lease.dispose();
  }
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}
