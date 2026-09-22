export type LlmRegistrationState = "active" | "draining" | "disposed";

export class LlmActivationLeaseOwner {
  readonly registrationId: string;
  #state: LlmRegistrationState = "active";
  #active = 0;
  #waiters = new Set<() => void>();

  constructor(registrationId: string) { this.registrationId = registrationId; }
  get state(): LlmRegistrationState { return this.#state; }
  get activeLeases(): number { return this.#active; }
  acquire(allowDraining = false): LlmActivationLease {
    if (this.#state !== "active" && !(allowDraining && this.#state === "draining")) throw new Error(`LLM registration ${this.registrationId} is ${this.#state}.`);
    this.#active += 1;
    let released = false;
    return Object.freeze({ release: () => { if (released) return; released = true; this.#active -= 1; this.notify(); }, registrationId: this.registrationId });
  }
  beginDrain(): void { if (this.#state === "active") this.#state = "draining"; this.notify(); }
  async dispose(timeoutMs = 30_000): Promise<void> {
    this.beginDrain();
    if (this.#active > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let waiter: (() => void) | undefined;
      try {
        await Promise.race([
          new Promise<void>((resolve) => { waiter = resolve; this.#waiters.add(resolve); }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`LLM registration ${this.registrationId} did not drain.`)), timeoutMs);
            timer.unref?.();
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (waiter !== undefined) this.#waiters.delete(waiter);
      }
    }
    this.#state = "disposed";
  }
  private notify(): void { if (this.#active === 0) { const waiters = [...this.#waiters]; this.#waiters.clear(); for (const resolve of waiters) resolve(); } }
}

export type LlmActivationLease = Readonly<{ registrationId: string; release: () => void }>;
