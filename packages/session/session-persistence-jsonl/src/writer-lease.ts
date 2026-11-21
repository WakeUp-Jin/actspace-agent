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
  #beating = false;

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
        // 只看持有进程是否还在：进程退出后立即接管，不等心跳过期。重启 dev / 应用时新进程常在旧进程退出后
        // 几秒内启动，等 30 秒会让选择存储和会话一直锁着，排队任务被暂停。
        if ((options.isProcessAlive ?? defaultProcessAlive)(existing.pid)) {
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

  /**
   * 只有确认锁已经不归自己（文件不在、或里面是别人的 nonce）才算丢失，丢失后不再恢复。
   * 读文件时的其它 I/O 错误只让这一次检查失败：把一次读失败当成丢失，会让选择存储在应用运行期间
   * 一直报 DURABILITY_BLOCKED，每条新消息都被暂停，直到重启。
   */
  async assertOwned(): Promise<void> {
    if (this.#disposed || this.#lost) throw new SessionError("SESSION_LEASE_LOST", "Session writer lease is no longer owned.");
    let current: SessionWriterLeaseOwner | null;
    try { current = await readOwner(this.#ownerPath); }
    catch (error) {
      if (errorCode(error) !== "ENOENT") throw new SessionError("SESSION_LEASE_LOST", "Session writer lease could not be verified.", error);
      current = null;
    }
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

  /**
   * 心跳只是给人看的时间戳：接管锁只看持有进程是否还活着，不看心跳新旧。所以一次心跳写失败
   * （睡眠唤醒后磁盘还没就绪、上一拍没写完下一拍又来）不能让租约丢失，等下一拍再写。
   * 同一时刻只跑一拍：两拍共用一个临时文件，重叠时后一拍的 rename 会 ENOENT。
   */
  async #heartbeat(): Promise<void> {
    if (this.#beating) return;
    this.#beating = true;
    try {
      await this.assertOwned();
      const next = Object.freeze({ ...this.#owner, heartbeatAt: this.#now().toISOString() });
      const temporary = `${this.#ownerPath}.${this.#owner.nonce}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next)}\n`, { encoding: "utf8", flag: "w", mode: 0o600 });
      // 写临时文件期间租约已释放或确认丢失：不能再把自己的记录写回锁目录。
      if (this.#disposed || this.#lost) { await rm(temporary, { force: true }); return; }
      await rename(temporary, this.#ownerPath);
      this.#owner = next;
    } catch {
      // assertOwned 已在确认丢失时停掉心跳；其余失败留给下一拍。
    } finally {
      this.#beating = false;
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
