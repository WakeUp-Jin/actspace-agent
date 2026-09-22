import { randomUUID } from "node:crypto";
import type { LlmMessage, LlmRequestOptions, LlmToolDefinition } from "./message.js";
import { PreparedLlmCall } from "./prepared-call.js";
import { LlmRouteRegistry, type LlmRouteRegistrationHandle } from "./route-registry.js";
import type { CredentialResolver } from "./credential-port.js";
import { matchesModel, type LlmAdapterPrepareInput, type LlmPreparedAdapterCall, type LlmRouteRegistration, type ResolvedLlmRequest } from "./adapter.js";
import { normalizeRetryPolicy } from "./retry-policy.js";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";
import type { LlmHostPort } from "./plugin.js";

export type PrepareLlmRequest = {
  readonly requestId?: string;
  readonly sessionId?: string;
  readonly routeId: string;
  readonly model: string;
  readonly messages: readonly LlmMessage[];
  readonly tools?: readonly LlmToolDefinition[];
  readonly options?: LlmRequestOptions;
  readonly credentialRef?: string;
  readonly signal?: AbortSignal;
};

export class LlmService {
  constructor(readonly routes: LlmRouteRegistry, private readonly credentials: CredentialResolver) {}

  register(route: LlmRouteRegistration): LlmRouteRegistrationHandle { return this.routes.register({ ...route, retryPolicy: normalizeRetryPolicy(route.retryPolicy) }); }

  prepare(input: PrepareLlmRequest): PreparedLlmCall {
    const registration = this.routes.capture(input.routeId);
    if (!matchesModel(registration.modelPattern, input.model)) throw new Error(`Model ${input.model} is not available on route ${input.routeId}.`);
    const signal = input.signal ?? new AbortController().signal;
    const lease = registration.leaseOwner.acquire();
    try {
      const request: ResolvedLlmRequest = {
      requestId: input.requestId ?? randomUUID(),
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      routeId: input.routeId,
      model: input.model,
      messages: cloneMessages(input.messages),
      tools: cloneTools(input.tools ?? []),
      options: cloneOptions({ ...registration.defaults, ...input.options }),
      credentialRef: input.credentialRef ?? registration.credentialRef,
      contextWindow: null,
      };
      const prepared = registration.adapter.prepare?.({ request, signal } satisfies LlmAdapterPrepareInput);
      const resolvedRequest = prepared?.request ?? request;
      const fallbackFacts = prepared === undefined ? registration.adapter.resolveModelFacts?.(input.model) : undefined;
      const requestWithFacts = fallbackFacts === undefined || resolvedRequest.contextWindow !== null && resolvedRequest.contextWindow !== undefined
        ? resolvedRequest
        : { ...resolvedRequest, contextWindow: fallbackFacts.contextWindow };
      return new PreparedLlmCall(registration, requestWithFacts, this.credentials, signal, lease, prepared);
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  async prepareAsync(input: PrepareLlmRequest): Promise<PreparedLlmCall> {
    const registration = this.routes.capture(input.routeId);
    if (!matchesModel(registration.modelPattern, input.model)) throw new Error(`Model ${input.model} is not available on route ${input.routeId}.`);
    const signal = input.signal ?? new AbortController().signal;
    const lease = registration.leaseOwner.acquire();
    try {
      const request: ResolvedLlmRequest = {
        requestId: input.requestId ?? randomUUID(),
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        routeId: input.routeId,
        model: input.model,
        messages: cloneMessages(input.messages),
        tools: cloneTools(input.tools ?? []),
        options: cloneOptions({ ...registration.defaults, ...input.options }),
        credentialRef: input.credentialRef ?? registration.credentialRef,
        contextWindow: null,
      };
      const prepared = registration.adapter.prepareAsync
        ? await registration.adapter.prepareAsync({ request, signal })
        : registration.adapter.prepare?.({ request, signal });
      const resolvedRequest = prepared?.request ?? request;
      const fallbackFacts = prepared === undefined ? registration.adapter.resolveModelFacts?.(input.model) : undefined;
      const requestWithFacts = fallbackFacts === undefined || resolvedRequest.contextWindow !== null && resolvedRequest.contextWindow !== undefined
        ? resolvedRequest
        : { ...resolvedRequest, contextWindow: fallbackFacts.contextWindow };
      return new PreparedLlmCall(registration, requestWithFacts, this.credentials, signal, lease, prepared);
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  prepareCaptured(registration: LlmRouteRegistration & { readonly registrationId: string; readonly leaseOwner: import("./activation-lease.js").LlmActivationLeaseOwner }, request: ResolvedLlmRequest, signal?: PrepareLlmRequest["signal"], previous?: LlmPreparedAdapterCall): PreparedLlmCall {
    const actualSignal = signal ?? new AbortController().signal;
    const lease = registration.leaseOwner.acquire(true);
    try {
      const prepared = previous?.forAttempt?.(request) ?? registration.adapter.prepare?.({ request, signal: actualSignal } satisfies LlmAdapterPrepareInput);
      const resolvedRequest = prepared?.request ?? request;
      return new PreparedLlmCall(registration, resolvedRequest, this.credentials, actualSignal, lease, prepared);
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  async prepareCapturedAsync(registration: LlmRouteRegistration & { readonly registrationId: string; readonly leaseOwner: import("./activation-lease.js").LlmActivationLeaseOwner }, request: ResolvedLlmRequest, signal?: PrepareLlmRequest["signal"], previous?: LlmPreparedAdapterCall): Promise<PreparedLlmCall> {
    const actualSignal = signal ?? new AbortController().signal;
    const lease = registration.leaseOwner.acquire(true);
    try {
      const prepared = previous?.forAttempt?.(request)
        ?? (registration.adapter.prepareAsync ? await registration.adapter.prepareAsync({ request, signal: actualSignal }) : registration.adapter.prepare?.({ request, signal: actualSignal }));
      return new PreparedLlmCall(registration, prepared?.request ?? request, this.credentials, actualSignal, lease, prepared);
    } catch (error) {
      lease.release();
      throw error;
    }
  }
}

function cloneMessages(messages: readonly LlmMessage[]): readonly LlmMessage[] {
  return Object.freeze(messages.map((message) => Object.freeze({
    ...message,
    content: typeof message.content === "string" ? message.content : Object.freeze(message.content.map((block) => Object.freeze({
      ...block,
      ...(block.type === "reasoning" && block.replay !== undefined ? { replay: Object.freeze({ ...block.replay, payload: cloneJson(block.replay.payload) }) } : {}),
    }))),
  })));
}

function cloneTools(tools: readonly LlmToolDefinition[]): readonly LlmToolDefinition[] {
  return Object.freeze(tools.map((tool) => Object.freeze({ ...tool, inputSchema: cloneJson(tool.inputSchema) })));
}

function cloneOptions(options: LlmRequestOptions): LlmRequestOptions {
  return Object.freeze({ ...options, ...(options.responseFormat === undefined ? {} : { responseFormat: cloneJson(options.responseFormat) }) });
}

function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => cloneJson(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneJson(item)]))) as T;
}

/** Cordis owner for the LLM route registry and its captured provider leases. */
export class LlmRuntimeService extends Service {
  static inject = Object.freeze(["actspace.host.llm"]);
  static Config = {
    "~standard": {
      version: 1,
      vendor: "actspace",
      validate(value: unknown) {
        if (value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value))) return { value: value ?? {} };
        return { issues: [{ message: "LLM runtime config must be an object." }] };
      },
    },
  };

  readonly runtime: LlmService;
  readonly routes: LlmRouteRegistry;
  readonly registrations: readonly LlmRouteRegistrationHandle[];

  constructor(ctx: CordisServiceContext, _config: Record<string, unknown> = {}) {
    super(ctx, "llm.service");
    const host = ctx.get("actspace.host.llm") as LlmHostPort | undefined;
    if (host === undefined) throw new Error("LLM Runtime Service requires actspace.host.llm.");
    this.routes = new LlmRouteRegistry();
    this.runtime = new LlmService(this.routes, host.credentials);
    const registrations = host.routes.map((route) => this.runtime.register(route));
    if (registrations.length === 0) throw new Error("LLM Runtime Service requires at least one route.");
    this.registrations = Object.freeze(registrations);
    ctx.effect(() => async () => {
      const results = await Promise.allSettled([...registrations].reverse().map((registration) => registration.dispose()));
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason), "LLM route cleanup failed.");
    }, "llm.runtime.routes");
  }

  register(route: LlmRouteRegistration): LlmRouteRegistrationHandle { return this.runtime.register(route); }
  prepare(input: PrepareLlmRequest): PreparedLlmCall { return this.runtime.prepare(input); }
  prepareAsync(input: PrepareLlmRequest): Promise<PreparedLlmCall> { return this.runtime.prepareAsync(input); }
  prepareCaptured(...args: Parameters<LlmService["prepareCaptured"]>): PreparedLlmCall { return this.runtime.prepareCaptured(...args); }
  prepareCapturedAsync(...args: Parameters<LlmService["prepareCapturedAsync"]>): Promise<PreparedLlmCall> { return this.runtime.prepareCapturedAsync(...args); }
}
