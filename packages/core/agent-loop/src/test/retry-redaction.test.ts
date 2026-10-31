import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { EMPTY_LLM_USAGE, type LlmStreamEvent } from "@actspace/llm-service";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { AgentLoopLiveEvent } from "../loop.js";
import { runToolStreamFixture } from "../testing.js";

// Deliberately outside the generic sk-/Bearer patterns, with an encoded variant.
const credential = "acceptance_custom/credential+retry_42";
const encoded = encodeURIComponent(credential);
const failure = {
  kind: "rate-limit" as const, retryable: true, httpStatus: 429, attempt: 1,
  retryAfterMs: 0, message: `HTTP429 provider echoed ${credential} ${encoded}`,
  providerCode: credential, providerMessage: encoded,
};

describe("credential redaction through actual AgentLoop retries", () => {
  it.each([false, true])("keeps retry diagnostics safe (exhausted=%s)", async (exhausted) => {
    let attempts = 0;
    let journal: readonly SessionEventEnvelopeV1[] = [];
    const events: AgentLoopLiveEvent[] = [];
    let error: unknown;
    let reason: string | undefined;
    try {
      const run = await runToolStreamFixture({
        credential: { apiKey: credential },
        retryPolicy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, shouldRetry: value => value.retryable },
        stream: async function* (): AsyncGenerator<LlmStreamEvent> {
          attempts += 1;
          if (exhausted || attempts < 3) { yield { type: "error", failure }; return; }
          yield { type: "text-delta", text: "Recovered answer." };
          yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Recovered answer." }] };
        },
        onJournal: value => { journal = value; },
        onLiveEvent: value => { events.push(value); },
      });
      reason = run.result.reason;
      expect(run.result.finalText).toBe("Recovered answer.");
    } catch (caught) { error = caught; }

    expect(attempts).toBe(3);
    const retries = journal.filter(event => event.type === "llm/retry");
    expect(retries).toHaveLength(2);
    expect(retries.map(event => event.data)).toEqual([
      expect.objectContaining({ attempt: 1, nextAttempt: 2, delayMs: 0, failure: expect.objectContaining({ httpStatus: 429, retryable: true }) }),
      expect.objectContaining({ attempt: 2, nextAttempt: 3, delayMs: 0, failure: expect.objectContaining({ httpStatus: 429, retryable: true }) }),
    ]);
    expect(journal.filter(event => event.type === "llm/retry-started")).toHaveLength(2);
    expect(journal.filter(event => event.type === "request/header").map(event => (event.data as { attempt: number }).attempt)).toEqual([1, 2, 3]);
    const serialized = inspect({ journal, events, error }, { depth: null });
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain(credential);
    expect(serialized).not.toContain(encoded);
    if (exhausted) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("HTTP429");
      expect(events.at(-1)).toMatchObject({ kind: "run-state", message: "failed", failure: { httpStatus: 429, retryable: true } });
      expect(journal.at(-1)).toMatchObject({ type: "turn/end", data: { reason: "failed" } });
    } else {
      expect(error).toBeUndefined();
      expect(reason).toBe("completed");
      expect(journal.at(-1)).toMatchObject({ type: "turn/end", data: { reason: "completed" } });
    }
  });
});
