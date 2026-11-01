/** Monotonic execution budget; explicit wall-clock deadlines never pause. */
export class ExecutionBudget {
  readonly #waiting = new Set<string>();
  #last: number;
  #remaining: number;
  constructor(durationMs: number, private readonly deadline: number | null = null, private readonly clock = { monotonic: () => performance.now(), wall: () => Date.now() }) {
    if (!Number.isFinite(durationMs) || durationMs < 0 || (deadline !== null && !Number.isFinite(deadline))) throw new Error("Invalid execution budget");
    this.#remaining = durationMs;
    this.#last = clock.monotonic();
  }
  waitForApproval(approvalId: string): void { this.#tick(); this.#waiting.add(approvalId); }
  settleApproval(approvalId: string): void { this.#tick(); this.#waiting.delete(approvalId); }
  remainingMs(): number {
    this.#tick();
    const execution = this.#remaining <= 0 ? 0 : this.#waiting.size ? Infinity : this.#remaining;
    return Math.max(0, Math.min(execution, this.deadline === null ? Infinity : this.deadline - this.clock.wall()));
  }
  get expired(): boolean { this.#tick(); return this.#remaining <= 0 || (this.deadline !== null && this.clock.wall() >= this.deadline); }
  #tick(): void {
    const now = this.clock.monotonic();
    if (!this.#waiting.size) this.#remaining = Math.max(0, this.#remaining - Math.max(0, now - this.#last));
    this.#last = now;
  }
}

/** Timer adapter around the accounting model; waiting approvals reschedule the deadline. */
export class RunBudget {
  #budget: ExecutionBudget | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;
  constructor(private readonly durationMs: number, private readonly deadline: number | null, private readonly expire: () => void) {}
  start(): void { if (this.#budget || this.#disposed) return; this.#budget = new ExecutionBudget(this.durationMs, this.deadline); this.#schedule(); }
  waitForApproval(id: string): void { this.#budget?.waitForApproval(id); this.#schedule(); }
  settleApproval(id: string): void { this.#budget?.settleApproval(id); this.#schedule(); }
  dispose(): void { this.#disposed = true; clearTimeout(this.#timer); }
  #schedule(): void {
    clearTimeout(this.#timer);
    if (!this.#budget || this.#disposed) return;
    const remaining = this.#budget.remainingMs();
    if (remaining <= 0) { this.expire(); return; }
    if (!Number.isFinite(remaining)) return;
    this.#timer = setTimeout(() => this.#schedule(), Math.min(remaining, 2_147_483_647));
    this.#timer.unref?.();
  }
}
