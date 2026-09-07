import type { LlmFailure } from "./failure.js";

export type LlmRetryPolicy = {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly shouldRetry: (failure: LlmFailure) => boolean;
};

export type LlmRetryPolicySnapshot = {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
};

export const DEFAULT_LLM_RETRY_POLICY: LlmRetryPolicy = Object.freeze({ maxAttempts: 1, baseDelayMs: 250, maxDelayMs: 30_000, shouldRetry: (failure) => failure.retryable });

export function retryPolicySnapshot(policy: LlmRetryPolicy): LlmRetryPolicySnapshot {
  return Object.freeze({ maxAttempts: policy.maxAttempts, baseDelayMs: policy.baseDelayMs, maxDelayMs: policy.maxDelayMs });
}

export function normalizeRetryPolicy(policy: LlmRetryPolicy | undefined): LlmRetryPolicy {
  const value = policy ?? DEFAULT_LLM_RETRY_POLICY;
  if (!Number.isSafeInteger(value.maxAttempts) || value.maxAttempts < 1) throw new Error("LLM retry maxAttempts must be a positive integer.");
  if (!Number.isFinite(value.baseDelayMs) || value.baseDelayMs < 0) throw new Error("LLM retry baseDelayMs must be non-negative.");
  if (!Number.isFinite(value.maxDelayMs) || value.maxDelayMs < value.baseDelayMs) throw new Error("LLM retry maxDelayMs must be >= baseDelayMs.");
  return Object.freeze({ ...value, shouldRetry: value.shouldRetry ?? ((failure: LlmFailure) => failure.retryable) });
}

export function retryDelay(policy: LlmRetryPolicy, failure: LlmFailure, attempt: number): number | null {
  if (attempt >= policy.maxAttempts || !policy.shouldRetry(failure)) return null;
  return Math.min(policy.maxDelayMs, Math.max(failure.retryAfterMs ?? 0, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1)));
}
