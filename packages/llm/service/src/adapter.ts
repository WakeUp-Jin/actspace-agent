import type { LlmCredential, CredentialResolver } from "./credential-port.js";
import type { LlmFailure } from "./failure.js";
import type { LlmContentBlock, LlmMessage, LlmRequestOptions, LlmToolDefinition } from "./message.js";
import type { LlmStreamSource } from "./stream.js";
import type { LlmRetryPolicy } from "./retry-policy.js";

export type ResolvedLlmRequest = {
  readonly requestId: string;
  readonly sessionId?: string;
  readonly routeId: string;
  readonly model: string;
  readonly messages: readonly LlmMessage[];
  readonly tools: readonly LlmToolDefinition[];
  readonly options: LlmRequestOptions;
  readonly credentialRef: string;
  /** Non-secret model facts resolved before dispatch and safe to persist in a request snapshot. */
  readonly contextWindow?: number | null;
};

export type LlmRequestModelFacts = {
  readonly contextWindow: number | null;
};

export type LlmAdapterDispatchInput = {
  readonly request: ResolvedLlmRequest;
  readonly credential: LlmCredential;
  readonly signal: AbortSignal;
};

export type LlmAdapterPrepareInput = {
  readonly request: ResolvedLlmRequest;
  readonly signal: AbortSignal;
};

/** A request-bound adapter entry. Provider-specific facts stay behind this contract. */
export type LlmPreparedAdapterCall = {
  readonly request: ResolvedLlmRequest;
  dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource>;
  forAttempt?(request: ResolvedLlmRequest): LlmPreparedAdapterCall;
  cancel?(requestId: string): Promise<void>;
};

export interface LlmAdapter {
  readonly adapterVersion: string;
  resolveModelFacts?(model: string): LlmRequestModelFacts;
  prepare?(input: LlmAdapterPrepareInput): LlmPreparedAdapterCall;
  prepareAsync?(input: LlmAdapterPrepareInput): Promise<LlmPreparedAdapterCall>;
  dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource>;
  cancel?(requestId: string): Promise<void>;
  dispose?(): Promise<void>;
}

export type LlmRouteRegistration = {
  readonly routeId: string;
  readonly providerId: string;
  readonly modelPattern: string;
  readonly adapter: LlmAdapter;
  readonly credentialRef: string;
  readonly defaults: LlmRequestOptions;
  /** Durable retry policy owned by the route, never by an SDK. */
  readonly retryPolicy?: LlmRetryPolicy;
};

export type LlmRouteDescriptor = Pick<LlmRouteRegistration, "routeId" | "providerId" | "modelPattern" | "credentialRef" | "defaults">;

export function matchesModel(pattern: string, model: string): boolean {
  return pattern === "*" || pattern === model || (pattern.endsWith("/*") && model.startsWith(pattern.slice(0, -1)));
}

export type LlmAdapterFailure = LlmFailure;
export type { CredentialResolver };
