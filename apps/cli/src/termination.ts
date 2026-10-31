/** Coordinates only the current invocation; never discovers or kills unrelated processes. */
export class CliTermination {
  #exitCode: 130 | 143 | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #abort: (() => unknown) | undefined;
  readonly #cleanups = new Set<() => void>();
  constructor(private readonly exit: (code: number) => void, private readonly budgetMs = 5_000) {}
  get exitCode(): 130 | 143 | undefined { return this.#exitCode; }
  setAbort(abort: () => unknown): void { this.#abort = abort; if (this.#exitCode !== undefined) abort(); }
  addCleanup(cleanup: () => void): void { this.#cleanups.add(cleanup); }
  signal(signal: "SIGINT" | "SIGTERM"): void {
    if (this.#exitCode !== undefined) { this.force(); return; }
    this.#exitCode = signal === "SIGINT" ? 130 : 143;
    this.#timer = setTimeout(() => this.force(), this.budgetMs);
    this.#timer.unref();
    this.#abort?.();
  }
  dispose(): void { clearTimeout(this.#timer); this.#cleanups.clear(); this.#abort = undefined; }
  private force(): void {
    for (const cleanup of this.#cleanups) {
      try { cleanup(); } catch { /* Other owned groups still need terminating. */ }
    }
    this.exit(this.#exitCode ?? 130);
  }
}
