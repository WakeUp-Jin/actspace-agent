import { describe, expect, it } from "vitest";
import { DEFAULT_LLM_RETRY_POLICY, EMPTY_LLM_USAGE, type LlmFailure, type LlmStreamEvent } from "@actspace/llm-service";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { runToolStreamFixture } from "../testing.js";

const failure = (kind: LlmFailure["kind"]): LlmFailure => ({ kind, message: kind === "timeout" ? "请求 relay.example 超时" : kind, retryable: true, attempt: 1 });
const recovered = async function* (): AsyncGenerator<LlmStreamEvent> {
  yield { type: "text-delta", text: "Recovered." };
  yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Recovered." }] };
};

async function run(stream: (attempt: number) => AsyncGenerator<LlmStreamEvent>, retryPolicy?: Parameters<typeof runToolStreamFixture>[0]["retryPolicy"]) {
  let attempts = 0; let journal: readonly SessionEventEnvelopeV1[] = [];
  let error: unknown; let finalText: string | undefined;
  try {
    const result = await runToolStreamFixture({ retryPolicy, stream: () => stream(++attempts), onJournal: value => { journal = value; } });
    finalText = result.result.finalText;
  } catch (caught) { error = caught; }
  return { attempts, journal, error, finalText, retries: journal.filter(event => event.type === "llm/retry") };
}

describe("default LLM retry policy in the loop", () => {
  // Zero delay keeps the test fast; attempts and the retry classes still come from the default policy.
  const fast = { ...DEFAULT_LLM_RETRY_POLICY, baseDelayMs: 0, maxDelayMs: 0 };

  it.each(["timeout", "network"] as const)("retries a %s that produced no output and journals llm/retry", async kind => {
    const result = await run(async function* (attempt) {
      if (attempt < 3) { yield { type: "error", failure: failure(kind) }; return; }
      yield* recovered();
    }, fast);
    expect(result.error).toBeUndefined();
    expect(result.finalText).toBe("Recovered.");
    expect(result.attempts).toBe(3);
    expect(result.retries.map(event => event.data)).toEqual([
      expect.objectContaining({ attempt: 1, nextAttempt: 2, failure: expect.objectContaining({ kind }) }),
      expect.objectContaining({ attempt: 2, nextAttempt: 3, failure: expect.objectContaining({ kind }) }),
    ]);
  });

  it("gives up after the second retry and surfaces the readable message", async () => {
    const result = await run(async function* () { yield { type: "error", failure: failure("timeout") }; }, fast);
    expect(result.attempts).toBe(3);
    expect((result.error as Error).message).toContain("请求 relay.example 超时");
  });

  it("never retries once output was observed", async () => {
    const result = await run(async function* () { yield { type: "text-delta", text: "partial" }; yield { type: "error", failure: failure("timeout") }; }, fast);
    expect(result.attempts).toBe(1);
    expect(result.retries).toHaveLength(0);
  });

  it("leaves rate limits alone unless a route opts in", async () => {
    const result = await run(async function* () { yield { type: "error", failure: failure("rate-limit") }; });
    expect(result.attempts).toBe(1);
    expect(result.retries).toHaveLength(0);
  });
});
