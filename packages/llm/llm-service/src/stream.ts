import type { LlmFailure } from "./failure.js";
import type { LlmContentBlock } from "./message.js";
import type { LlmUsage } from "./usage.js";

export type LlmStreamEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | { readonly type: "reasoning-delta"; readonly text: string; readonly signature?: string }
  | { readonly type: "tool-call-delta"; readonly callId: string; readonly name: string; readonly argumentsDelta: string }
  | { readonly type: "done"; readonly stopReason: string | null; readonly usage: LlmUsage; readonly content: readonly LlmContentBlock[] }
  | { readonly type: "error"; readonly usage?: LlmUsage; readonly failure: LlmFailure }
  | { readonly type: "aborted"; readonly usage?: LlmUsage; readonly reason: string };

export type LlmStreamSource = AsyncIterable<LlmStreamEvent>;

export class LlmStreamHandle implements AsyncIterable<LlmStreamEvent> {
  #settled = false;
  #iterator: AsyncIterator<LlmStreamEvent> | undefined;
  constructor(private readonly source: LlmStreamSource, private readonly onSettled: () => void, private readonly onAbort?: (reason: string) => void | Promise<void>) {}

  [Symbol.asyncIterator](): AsyncIterator<LlmStreamEvent> {
    if (this.#iterator !== undefined) return this.#iterator;
    const iterator = this.source[Symbol.asyncIterator]();
    this.#iterator = {
      next: async () => {
        try {
          const result = await iterator.next();
          if (result.done) this.settle();
          return result;
        } catch (error) {
          this.settle();
          throw error;
        }
      },
      return: async (value?: unknown) => {
        try { return await iterator.return?.(value) ?? { done: true, value: undefined }; } finally { this.settle(); }
      },
      throw: async (error?: unknown) => {
        try { return await iterator.throw?.(error) ?? Promise.reject(error); } finally { this.settle(); }
      },
    };
    return this.#iterator;
  }

  async abort(reason = "aborted"): Promise<void> {
    const iterator = this.#iterator;
    try { await this.onAbort?.(reason); await iterator?.return?.(); } finally { this.settle(); }
  }

  get settled(): boolean { return this.#settled; }
  private settle(): void { if (this.#settled) return; this.#settled = true; this.onSettled(); }
}
