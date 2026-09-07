import { ToolRuntimeError } from "./errors.js";

export type OrderedCommitSlot = {
  readonly index: number;
  commit<T>(action: () => Promise<T>): Promise<T>;
  abandon(): Promise<void>;
};

type PendingCommit = {
  readonly action: () => Promise<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
};

export class OrderedToolCommitQueue {
  #reserved = 0;
  #next = 0;
  #pending = new Map<number, PendingCommit>();
  #draining = false;
  #failure: unknown;

  reserve(): OrderedCommitSlot {
    const index = this.#reserved++;
    let used = false;
    const submit = <T>(action: () => Promise<T>): Promise<T> => {
      if (used) return Promise.reject(new ToolRuntimeError({ code: "TOOL_COMMIT_FAILED", message: `Commit slot ${index} was already used.`, retryable: false, phase: "commit" }));
      used = true;
      if (this.#failure !== undefined) return Promise.reject(this.#failure);
      return new Promise<T>((resolve, reject) => {
        this.#pending.set(index, { action, resolve: resolve as (value: unknown) => void, reject });
        void this.#drain();
      });
    };
    return Object.freeze({ index, commit: submit, abandon: () => submit(async () => undefined) });
  }

  async #drain(): Promise<void> {
    if (this.#draining) return;
    this.#draining = true;
    try {
      while (true) {
        const pending = this.#pending.get(this.#next);
        if (pending === undefined) break;
        this.#pending.delete(this.#next);
        try {
          const value = await pending.action();
          pending.resolve(value);
          this.#next += 1;
        } catch (error) {
          this.#failure = error;
          pending.reject(error);
          for (const later of this.#pending.values()) later.reject(error);
          this.#pending.clear();
          break;
        }
      }
    } finally {
      this.#draining = false;
    }
  }
}
