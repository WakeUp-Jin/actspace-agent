import { hostname } from "node:os";
import { open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { CliError, CliUsageError } from "./errors";

export type SessionLockRecord = {
  sessionId: string;
  hostname: string;
  pid: number;
  createdAt: string;
};

export type SessionLock = {
  record: SessionLockRecord;
  release(): Promise<void>;
};

export type SessionLockDependencies = {
  hostname?: () => string;
  pid?: number;
  isProcessAlive?: (pid: number) => boolean;
  now?: () => Date;
};

export async function acquireSessionLock(
  sessionRoot: string,
  sessionId: string,
  dependencies: SessionLockDependencies = {},
): Promise<SessionLock> {
  assertSafeSessionId(sessionId);
  const lockPath = join(sessionRoot, sessionId, "cli.lock");
  const currentHostname = (dependencies.hostname ?? hostname)();
  const pid = dependencies.pid ?? process.pid;
  const record: SessionLockRecord = {
    sessionId,
    hostname: currentHostname,
    pid,
    createdAt: (dependencies.now?.() ?? new Date()).toISOString(),
  };
  let handle: FileHandle;
  try {
    handle = await writeLock(lockPath, record);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const existing = await readLock(lockPath);
    const isAlive = dependencies.isProcessAlive ?? isProcessAlive;
    if (!existing || existing.hostname !== currentHostname || isAlive(existing.pid)) {
      throw new CliError(`Session is already open: ${sessionId}`, "SESSION_LOCKED", 2);
    }
    await unlink(lockPath);
    try {
      handle = await writeLock(lockPath, record);
    } catch (retryError) {
      if (isAlreadyExists(retryError)) {
        throw new CliError(`Session is already open: ${sessionId}`, "SESSION_LOCKED", 2);
      }
      throw retryError;
    }
  }

  let released = false;
  return {
    record,
    release: async () => {
      if (released) return;
      released = true;
      await handle.close();
      const current = await readLock(lockPath);
      if (current && sameLock(current, record)) await unlink(lockPath).catch(() => {});
    },
  };
}

export function assertSafeSessionId(sessionId: string): void {
  if (!sessionId || sessionId === "." || sessionId === ".." || sessionId.includes("/") || sessionId.includes("\\")) {
    throw new CliUsageError(`Invalid session id: ${sessionId}`, "INVALID_SESSION_ID");
  }
}

async function writeLock(path: string, record: SessionLockRecord): Promise<FileHandle> {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
    return handle;
  } catch (error) {
    await handle.close();
    await unlink(path).catch(() => {});
    throw error;
  }
}

async function readLock(path: string): Promise<SessionLockRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<SessionLockRecord>;
    if (
      typeof parsed.sessionId !== "string"
      || typeof parsed.hostname !== "string"
      || typeof parsed.pid !== "number"
      || typeof parsed.createdAt !== "string"
    ) return null;
    return parsed as SessionLockRecord;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "EEXIST";
}

function sameLock(left: SessionLockRecord, right: SessionLockRecord): boolean {
  return left.sessionId === right.sessionId
    && left.hostname === right.hostname
    && left.pid === right.pid
    && left.createdAt === right.createdAt;
}
