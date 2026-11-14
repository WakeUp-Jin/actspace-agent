import { access, copyFile, mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SessionError, SessionJournal, type EventCodecRegistry } from "@actspace/session-journal";
import type { SessionPrefixRewrite } from "@actspace/session-storage";
import { readJsonlSession } from "./jsonl-reader.js";
import { encodeRows } from "./jsonl-writer.js";
import { sessionFileLayout } from "./layout.js";
import { SessionWriterLease, type AcquireWriterLeaseOptions } from "./writer-lease.js";

type RewindOptions = {
  readonly dataRoot: string;
  readonly runtimeId: string;
  readonly registry: EventCodecRegistry;
  readonly lease?: Pick<AcquireWriterLeaseOptions, "heartbeatMs" | "now" | "isProcessAlive" | "pid">;
};

/**
 * 从某一轮重来（agent-edit-resend-rewind.md §3.4）：整份旧日志先复制进 `recovery/`，
 * 再写一份「前缀 + 收尾事件」的临时文件并 rename 覆盖。步骤与断尾修复（repair.ts）相同。
 */
export async function rewriteJsonlPrefix(
  options: RewindOptions,
  sessionId: string,
  input: SessionPrefixRewrite,
): Promise<{ readonly archive: string }> {
  assertLabel(input.label);
  const layout = sessionFileLayout(options.dataRoot, sessionId);
  const lease = await SessionWriterLease.acquire({
    sessionDir: layout.sessionDir,
    sessionId,
    runtimeId: options.runtimeId,
    ...options.lease,
  });
  const temporaryPath = join(layout.sessionDir, `.rewind-${randomUUID()}.tmp`);
  try {
    const { inspection } = await readJsonlSession(layout.journalPath, options.registry, sessionId);
    if (inspection.header === null || inspection.tornTail !== null || inspection.validation === null)
      throw new SessionError("SESSION_CORRUPT", "Session requires repair before a rewind.");
    const lastSeq = inspection.events.at(-1)?.seq ?? -1;
    if (lastSeq !== input.expectedLastSeq)
      throw new SessionError("SESSION_CORRUPT", "Journal changed after the rewind cut was chosen.");
    if (!Number.isSafeInteger(input.cutSeq) || input.cutSeq < 0 || input.cutSeq > lastSeq)
      throw new RangeError("Rewind cut must drop at least one event.");
    const journal = new SessionJournal({
      registry: options.registry,
      seed: inspection.events.slice(0, input.cutSeq),
      now: () => new Date().toISOString(),
    });
    if (input.closing.length) journal.appendMany(input.closing);
    await mkdir(layout.recoveryDir, { recursive: true });
    const archive = join("recovery", `${input.label}.journal.jsonl`);
    const archivePath = join(layout.sessionDir, archive);
    await copyFile(layout.journalPath, archivePath);
    await syncPath(archivePath);
    await syncPath(layout.recoveryDir);
    const temporary = await open(temporaryPath, "wx", 0o600);
    try {
      // perf-allow: 回退时整份重写日志前缀，只在「编辑重发」时走一次
      await temporary.writeFile(encodeRows([inspection.header, ...journal.readEvents()]));
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    await lease.assertOwned();
    await rename(temporaryPath, layout.journalPath);
    await syncPath(layout.sessionDir);
    return Object.freeze({ archive });
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    await lease.dispose();
  }
}

/** 被移除部分里创建的子会话：整个目录移进父会话的 `recovery/<label>/sessions/`，不再出现在会话目录里。 */
export async function retireJsonlSession(
  options: RewindOptions,
  sessionId: string,
  parentSessionId: string,
  label: string,
): Promise<void> {
  assertLabel(label);
  const layout = sessionFileLayout(options.dataRoot, sessionId);
  const parent = sessionFileLayout(options.dataRoot, parentSessionId);
  // Acquiring creates the directory; never conjure a Session that is already gone.
  await access(layout.journalPath);
  const lease = await SessionWriterLease.acquire({
    sessionDir: layout.sessionDir,
    sessionId,
    runtimeId: options.runtimeId,
    ...options.lease,
  });
  const targetDir = join(parent.recoveryDir, label, "sessions");
  const target = join(targetDir, sessionId);
  let moved = false;
  try {
    await mkdir(targetDir, { recursive: true });
    await lease.assertOwned();
    // Rename while owned, like discard: a later creator at the same id cannot be moved by this call.
    await rename(layout.sessionDir, target);
    moved = true;
    await syncPath(layout.root);
  } finally {
    // The lock moved with the Session; its owner record is no longer where the lease looks, so remove it there.
    await lease.dispose().catch(() => undefined);
    if (moved) await rm(join(target, ".writer-lock"), { recursive: true, force: true }).catch(() => undefined);
  }
}

function assertLabel(label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(label))
    throw new SessionError("INVALID_HEADER", "Rewind label is not path-safe.");
}

async function syncPath(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
