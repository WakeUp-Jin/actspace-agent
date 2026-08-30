export type AsyncDisposer = () => void | Promise<void>;

export type ScopeDisposerState = "active" | "quiescing" | "disposed";

export class ScopeDisposer {
  #state: ScopeDisposerState = "active";
  #disposePromise: Promise<void> | undefined;
  #activeWork = 0;
  #workWaiters: Array<() => void> = [];
  readonly #disposers: AsyncDisposer[] = [];

  get state(): ScopeDisposerState { return this.#state; }
  get disposed(): boolean { return this.#state !== "active"; }

  /** Acquire a lease for work that must settle before scope disposal completes. */
  acquire(): () => void {
    if (this.#state !== "active") throw new Error("Scope is already disposed.");
    this.#activeWork += 1;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#activeWork -= 1;
      if (this.#activeWork === 0) {
        const waiters = this.#workWaiters.splice(0);
        for (const resolve of waiters) resolve();
      }
    };
  }

  add(disposer: AsyncDisposer): () => void {
    if (this.#state !== "active") throw new Error("Scope is already disposed.");
    let active = true;
    this.#disposers.push(async () => {
      if (!active) return;
      active = false;
      await disposer();
    });
    return () => { active = false; };
  }

  async dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) return this.#disposePromise;
    this.#state = "quiescing";
    const disposers = [...this.#disposers].reverse();
    this.#disposers.length = 0;
    this.#disposePromise = (async () => {
      let failure: unknown;
      for (const disposer of disposers) {
        try { await disposer(); } catch (error) { failure ??= error; }
      }
      if (this.#activeWork > 0) await new Promise<void>((resolve) => this.#workWaiters.push(resolve));
      this.#state = "disposed";
      if (failure !== undefined) throw failure;
    })();
    return this.#disposePromise;
  }
}
