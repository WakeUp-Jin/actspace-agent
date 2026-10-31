import { describe, expect, it } from "vitest";
import type { LlmFailure } from "../failure.js";
import { DEFAULT_LLM_RETRY_POLICY, normalizeRetryPolicy, retryDelay } from "../retry-policy.js";

const failure = (kind: LlmFailure["kind"], retryable = true): LlmFailure => ({ kind, message: kind, retryable, attempt: 1 });

describe("default LLM retry policy", () => {
  it("retries connection-level failures twice, with backoff, then gives up", () => {
    const policy = normalizeRetryPolicy(undefined);
    expect(policy.maxAttempts).toBe(3);
    for (const kind of ["timeout", "network"] as const) {
      expect(retryDelay(policy, failure(kind), 1)).toBe(1_000);
      expect(retryDelay(policy, failure(kind), 2)).toBe(2_000);
      expect(retryDelay(policy, failure(kind), 3)).toBeNull();
    }
  });

  it("does not retry rate limits, provider errors or unclassified failures by default", () => {
    for (const kind of ["rate-limit", "provider", "proxy", "unknown", "authentication"] as const) {
      expect(retryDelay(DEFAULT_LLM_RETRY_POLICY, failure(kind), 1)).toBeNull();
    }
    expect(retryDelay(DEFAULT_LLM_RETRY_POLICY, failure("timeout", false), 1)).toBeNull();
  });

  it("keeps a route-provided shouldRetry", () => {
    const policy = normalizeRetryPolicy({ maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, shouldRetry: value => value.kind === "provider" });
    expect(retryDelay(policy, failure("provider"), 1)).toBe(0);
    expect(retryDelay(policy, failure("timeout"), 1)).toBeNull();
  });
});
