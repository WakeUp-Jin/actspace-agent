import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SessionError } from "@actspace/session-journal";

export type SessionWriterLeaseOwner = {
  readonly sessionId: string;
  readonly runtimeId: string;
  readonly pid: number;
  readonly nonce: string;
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
};

export type AcquireWriterLeaseOptions = {
  readonly sessionDir: string;
  readonly sessionId: string;
  readonly runtimeId: string;
  readonly pid?: number;
  readonly heartbeatMs?: number;
  readonly staleMs?: number;
  readonly now?: () => Date;
  readonly isProcessAlive?: (pid: number) => boolean;
};

export class SessionWriterLease {
  readonly #lockDir: string;
  readonly #ownerPath: string;
  readonly #heartbeatMs: number;
  readonly #now: () => Date;
  #owner: SessionWriterLeaseOwner;
  #timer: ReturnType<typeof setInterval> | undefined;
  #disposed = false;
  #lost = false;

  private constructor(options: AcquireWriterLeaseOptions, owner: SessionWriterLeaseOwner) {
    this.#lockDir = join(options.sessionDir, ".writer-lock");
    this.#ownerPath = join(this.#lockDir, "owner.json");
    this.#heartbeatMs = options.heartbeatMs ?? 5_000;
    this.#now = options.now ?? (() => new Date());
    this.#owner = owner;
    this.#timer = setInterval(() => void this.#heartbeat(), this.#heartbeatMs);
    this.#timer.unref?.();
  }

  static async acquire(options: AcquireWriterLeaseOptions): Promise<SessionWriterLease> {
    const now = options.now ?? (() => new Date());
    const pid = options.pid ?? process.pid;
    const lockDir = join(options.sessionDir, ".writer-lock");
    const ownerPath = join(lockDir, "owner.json");
    const recoveryDir = join(options.sessionDir, "recovery");
    await mkdir(options.sessionDir, { recursive: true });
    await mkdir(recoveryDir, { recursive: true });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const stamp = now().toISOString();
      const owner: SessionWriterLeaseOwner = Object.freeze({ sessionId: options.sessionId, runtimeId: options.runtimeId, pid, nonce: randomUUID(), acquiredAt: stamp, heartbeatAt: stamp });
      try {
        await mkdir(lockDir);
        await writeFile(ownerPath, `${JSON.stringify(owner)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
        return new SessionWriterLease(options, owner);
      } catch (error) {
        const code = errorCode(error);
        if (code !== "EEXIST") {
          await rm(lockDir, { recursive: true, force: true }).catch(() => undefined);
          throw error;
        }
        const existing = await readOwner(ownerPath);
        const age = now().getTime() - Date.parse(existing.heartbeatAt);
        const isAlive = (options.isProcessAlive ?? defaultProcessAlive)(existing.pid);
        if (age <= (options.staleMs ?? 30_000) || isAlive) {
          throw new SessionError("SESSION_WRITER_LOCKED", `Session ${options.sessionId} is owned by runtime ${existing.runtimeId} pid ${existing.pid}.`);
        }
        const stalePath = join(recoveryDir, `stale-lock-${existing.nonce}`);
        try {
          await rename(lockDir, stalePath);
        } catch (renameError) {
          if (["ENOENT", "EEXIST"].includes(errorCode(renameError) ?? "")) continue;
          throw renameError;
        }
      }
    }
    throw new SessionError("SESSION_WRITER_LOCKED", `Could not acquire writer lease for ${options.sessionId}.`);
  }

  get owner(): SessionWriterLeaseOwner {
    return this.#owner;
  }

  async assertOwned(): Promise<void> {
    if (this.#disposed || this.#lost) throw new SessionError("SESSION_LEASE_LOST", "Session writer lease is no longer owned.");
    const current = await readOwner(this.#ownerPath).catch(() => null);
    if (current?.nonce !== this.#owner.nonce) {
      this.#lost = true;
      this.#stopHeartbeat();
      throw new SessionError("SESSION_LEASE_LOST", "Session writer lease ownership changed.");
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopHeartbeat();
    const current = await readOwner(this.#ownerPath).catch(() => null);
    if (current?.nonce === this.#owner.nonce) await rm(this.#lockDir, { recursive: true, force: true });
  }

  async #heartbeat(): Promise<void> {
    try {
      await this.assertOwned();
      const next = Object.freeze({ ...this.#owner, heartbeatAt: this.#now().toISOString() });
      const temporary = `${this.#ownerPath}.${this.#owner.nonce}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next)}\n`, { encoding: "utf8", flag: "w", mode: 0o600 });
      await rename(temporary, this.#ownerPath);
      this.#owner = next;
    } catch {
      this.#lost = true;
      this.#stopHeartbeat();
    }
  }

  #stopHeartbeat(): void {
    if (this.#timer === undefined) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }
}

async function readOwner(path: string): Promise<SessionWriterLeaseOwner> {
  const value = JSON.parse(await readFile(path, "utf8")) as SessionWriterLeaseOwner;
  if (typeof value.nonce !== "string" || typeof value.runtimeId !== "string" || !Number.isSafeInteger(value.pid)) throw new Error("Invalid writer lease owner record.");
  return value;
}

function defaultProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : undefined;
}
