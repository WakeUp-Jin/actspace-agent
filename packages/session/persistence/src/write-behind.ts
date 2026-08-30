import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { SessionError } from "@actspace/session-journal";
import { encodeRows } from "@actspace/session-jsonl";

export type SessionWriteBehindOptions = {
  readonly write: (events: readonly SessionEventEnvelopeV1[]) => Promise<void>;
  readonly reportBackgroundFailure: (error: unknown) => void;
  readonly maxDelayMs?: number;
  readonly maxEvents?: number;
  readonly maxBytes?: number;
};

export class SessionWriteBehind {
  readonly #maxDelayMs: number;
  readonly #maxEvents: number;
  readonly #maxBytes: number;
  #pending: SessionEventEnvelopeV1[] = [];
  #pendingBytes = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #active: Promise<void> | undefined;
  #barrier: Promise<void> | undefined;
  #blocked: unknown;
  #closed = false;

  constructor(private readonly options: SessionWriteBehindOptions) {
    this.#maxDelayMs = options.maxDelayMs ?? 200;
    this.#maxEvents = options.maxEvents ?? 128;
    this.#maxBytes = options.maxBytes ?? 256 * 1024;
  }

  get canAccept(): boolean {
    return !this.#closed && this.#blocked === undefined;
  }

  get hasWork(): boolean {
    return this.#pending.length > 0 || this.#active !== undefined;
  }

  enqueue(event: SessionEventEnvelopeV1): void {
    if (this.#closed) throw new SessionError("SESSION_CLOSED", "Session write-behind is closed.");
    if (this.#blocked !== undefined) throw new SessionError("SESSION_DURABILITY_FAILED", "Session writer is blocked after a durability failure.", this.#blocked);
    this.#pending.push(event);
    this.#pendingBytes += encodeRows([event]).length;
    if (this.#pending.length >= this.#maxEvents || this.#pendingBytes >= this.#maxBytes) {
      this.#cancelTimer();
      void this.#startBackground();
    } else if (this.#timer === undefined && this.#active === undefined && this.#barrier === undefined) {
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        void this.#startBackground();
      }, this.#maxDelayMs);
      this.#timer.unref?.();
    }
  }

  flush(): Promise<void> {
    if (this.#barrier !== undefined) return this.#barrier;
    this.#cancelTimer();
    this.#barrier = this.#drain().finally(() => {
      this.#barrier = undefined;
    });
    return this.#barrier;
  }

  resumeAfterFailure(): void {
    if (this.#closed) throw new SessionError("SESSION_CLOSED", "Session write-behind is closed.");
    this.#blocked = undefined;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    try {
      await this.flush();
    } finally {
      this.#closed = true;
      this.#cancelTimer();
    }
  }

  async #drain(): Promise<void> {
    if (this.#blocked !== undefined) throw new SessionError("SESSION_DURABILITY_FAILED", "Session writer is blocked after a durability failure.", this.#blocked);
    if (this.#active !== undefined) await this.#active;
    while (this.#pending.length > 0) await this.#startWrite(false);
  }

  async #startBackground(): Promise<void> {
    if (this.#active !== undefined || this.#pending.length === 0 || this.#barrier !== undefined || this.#blocked !== undefined) return;
    try {
      await this.#startWrite(true);
      if (this.#pending.length > 0 && this.#timer === undefined) {
        this.#timer = setTimeout(() => {
          this.#timer = undefined;
          void this.#startBackground();
        }, this.#maxDelayMs);
        this.#timer.unref?.();
      }
    } catch {
      // The failure is retained and reported by #startWrite.
    }
  }

  #startWrite(background: boolean): Promise<void> {
    const batch = this.#pending;
    this.#pending = [];
    this.#pendingBytes = 0;
    const operation = Promise.resolve()
      .then(() => this.options.write(batch))
      .catch((error: unknown) => {
        this.#pending = batch.concat(this.#pending);
        this.#pendingBytes = encodeRows(this.#pending).length;
        this.#blocked = error;
        if (background) this.options.reportBackgroundFailure(error);
        throw error;
      })
      .finally(() => {
        this.#active = undefined;
      });
    this.#active = operation;
    return operation;
  }

  #cancelTimer(): void {
    if (this.#timer === undefined) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
