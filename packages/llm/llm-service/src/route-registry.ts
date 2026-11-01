import { randomUUID } from "node:crypto";
import { LlmActivationLeaseOwner } from "./activation-lease.js";
import type { LlmRouteRegistration } from "./adapter.js";
import { normalizeRetryPolicy } from "./retry-policy.js";

export type CapturedLlmRoute = LlmRouteRegistration & { readonly registrationId: string; readonly leaseOwner: LlmActivationLeaseOwner };

export class LlmRouteRegistrationHandle {
  constructor(readonly registration: CapturedLlmRoute, private readonly unregister: () => void) {}
  beginDrain(): void { this.registration.leaseOwner.beginDrain(); this.unregister(); }
  async dispose(timeoutMs?: number): Promise<void> {
    this.beginDrain();
    await this.registration.leaseOwner.dispose(timeoutMs);
    await this.registration.adapter.dispose?.();
  }
}

export class LlmRouteRegistry {
  readonly #routes = new Map<string, CapturedLlmRoute>();

  register(input: LlmRouteRegistration): LlmRouteRegistrationHandle {
    if (this.#routes.has(input.routeId)) throw new Error(`Duplicate LLM route ${input.routeId}.`);
    const registrationId = randomUUID();
    const registration = Object.freeze({ ...input, retryPolicy: normalizeRetryPolicy(input.retryPolicy), registrationId, leaseOwner: new LlmActivationLeaseOwner(registrationId) });
    this.#routes.set(input.routeId, registration);
    let active = true;
    return new LlmRouteRegistrationHandle(registration, () => { if (!active) return; active = false; if (this.#routes.get(input.routeId) === registration) this.#routes.delete(input.routeId); });
  }

  capture(routeId: string): CapturedLlmRoute {
    const registration = this.#routes.get(routeId);
    if (registration === undefined || registration.leaseOwner.state !== "active") throw new Error(`LLM route ${routeId} is unavailable.`);
    return registration;
  }

  list(): readonly CapturedLlmRoute[] { return Object.freeze([...this.#routes.values()].sort((left, right) => left.routeId.localeCompare(right.routeId))); }
}
