/** One Worker command at a time. Foreground consumers get at most four turns
 * before a waiting background consumer, with no preemption of native SQL. */
export class ReadModelScheduler {
  #foreground: (() => Promise<void>)[] = [];
  #background: (() => Promise<void>)[] = [];
  #running = false;
  #streak = 0;
  run<T>(foreground: boolean, operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      (foreground ? this.#foreground : this.#background).push(async () => { try { resolve(await operation()); } catch (error) { reject(error); } });
      void this.#drain();
    });
  }
  async #drain(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      while (this.#foreground.length || this.#background.length) {
        const front = this.#foreground.length > 0 && (this.#streak < 4 || !this.#background.length);
        this.#streak = front ? this.#streak + 1 : 0;
        await (front ? this.#foreground : this.#background).shift()!();
      }
    } finally { this.#running = false; }
  }
}
