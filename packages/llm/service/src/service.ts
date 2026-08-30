import { randomUUID } from "node:crypto";
import type { LlmMessage, LlmRequestOptions, LlmToolDefinition } from "./message.js";
import { PreparedLlmCall } from "./prepared-call.js";
import { LlmRouteRegistry, type LlmRouteRegistrationHandle } from "./route-registry.js";
import type { CredentialResolver } from "./credential-port.js";
import { matchesModel, type LlmRouteRegistration, type ResolvedLlmRequest } from "./adapter.js";
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
    return this.prepareCaptured(registration, {
      requestId: input.requestId ?? randomUUID(),
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      routeId: input.routeId,
      model: input.model,
      messages: Object.freeze([...input.messages]),
      tools: Object.freeze([...(input.tools ?? [])]),
      options: Object.freeze({ ...registration.defaults, ...input.options }),
      credentialRef: input.credentialRef ?? registration.credentialRef,
    }, input.signal ?? new AbortController().signal);
  }

  prepareCaptured(registration: LlmRouteRegistration & { readonly registrationId: string; readonly leaseOwner: import("./activation-lease.js").LlmActivationLeaseOwner }, request: ResolvedLlmRequest, signal?: PrepareLlmRequest["signal"]): PreparedLlmCall {
    return new PreparedLlmCall(registration, request, this.credentials, signal ?? new AbortController().signal);
  }
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
  prepareCaptured(...args: Parameters<LlmService["prepareCaptured"]>): PreparedLlmCall { return this.runtime.prepareCaptured(...args); }
}
