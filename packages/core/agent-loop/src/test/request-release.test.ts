import { describe, expect, it } from "vitest";
import { ContextEngine } from "@actspace/context-engine";
import { EMPTY_LLM_USAGE, type LlmStreamEvent } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

// fixture 结束时会注销路由并等 100ms：有 prepared call 没释放时，抛出来的是 "did not drain"，而不是下面断言的原始错误。
describe("prepared calls that never dispatch", () => {
  const retry = { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, shouldRetry: () => true };
  const failOnce = () => {
    let attempt = 0;
    return async function* (): AsyncGenerator<LlmStreamEvent> {
      if (attempt++ === 0) { yield { type: "error", failure: { kind: "timeout", message: "timeout", retryable: true, attempt: 1 } }; return; }
      yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Done" }] };
    };
  };

  it.each([1, 2])("releases the call when the records of attempt %i cannot be written", async (failingAttempt) => {
    let binds = 0;
    const run = runToolStreamFixture({ stream: failOnce(), retryPolicy: retry, createContextEngine: (options) => {
      const engine = new ContextEngine(options);
      const bindRequest = engine.bindRequest.bind(engine);
      engine.bindRequest = async (context) => {
        if (++binds === failingAttempt) throw new Error("bind failed");
        return bindRequest(context);
      };
      return engine;
    } });
    await expect(run).rejects.toThrow("bind failed");
    expect(binds).toBe(failingAttempt);
  });

  it("releases the call when the prepared model cannot be recorded", async () => {
    const run = runToolStreamFixture({ terminalOnly: true, createContextEngine: (options) => {
      const engine = new ContextEngine(options);
      engine.recordPrepared = async () => { throw new Error("record failed"); };
      return engine;
    } });
    await expect(run).rejects.toThrow("record failed");
  });

  it("releases the call when an llm/stream hook fails before dispatching", async () => {
    const run = runToolStreamFixture({ terminalOnly: true, context: {
      get: () => ({ flush: async () => {} }),
      waterfall: async (type: string, _payload: unknown, next: unknown) => {
        if (type === "llm/stream") throw new Error("hook failed");
        return (next as () => Promise<object>)();
      },
    } as never });
    await expect(run).rejects.toThrow("hook failed");
  });

  const hookContext = (stream: (next: () => Promise<AsyncIterable<LlmStreamEvent>>) => AsyncIterable<LlmStreamEvent>) => ({
    get: () => ({ flush: async () => {} }),
    waterfall: async (type: string, _payload: unknown, next: unknown) => (type === "llm/stream"
      ? stream(next as () => Promise<AsyncIterable<LlmStreamEvent>>)
      : (next as () => Promise<object>)()),
  }) as never;

  it("releases the call when an llm/stream hook answers with its own stream instead of dispatching", async () => {
    const { result } = await runToolStreamFixture({ terminalOnly: true, context: hookContext(async function* () {
      yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Replaced" }] };
    }) });
    expect(result.finalText).toBe("Replaced");
  });

  it("keeps the call for an llm/stream hook that dispatches only once its stream is read", async () => {
    const { result } = await runToolStreamFixture({ terminalOnly: true, context: hookContext(async function* (next) {
      yield* await next();
    }) });
    expect(result.finalText).toBe("Done.");
  });
});
