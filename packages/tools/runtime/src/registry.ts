import { randomUUID } from "node:crypto";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { ToolRegistrationLeaseOwner } from "./activation-lease.js";
import { normalizeToolDefinition, type NormalizedToolDefinition, type ToolDefinition } from "./definition.js";
import type { ToolExecutor, ToolMiddleware } from "./executor.js";
import { ToolRuntimeError } from "./errors.js";
import type { ToolPolicy } from "./policy.js";

export type ToolExecutorRegistration = {
  readonly definition: ToolDefinition;
  readonly executor: ToolExecutor;
  readonly policies?: readonly ToolPolicy[];
  readonly middleware?: readonly ToolMiddleware[];
  readonly resolveResourcePaths?: (args: Readonly<Record<string, RuntimeV2JsonValue>>) => readonly string[];
};

export type CapturedToolRegistration = {
  readonly registrationId: string;
  readonly definition: NormalizedToolDefinition;
  readonly executor: ToolExecutor;
  readonly policies: readonly ToolPolicy[];
  readonly middleware: readonly ToolMiddleware[];
  readonly resolveResourcePaths: (args: Readonly<Record<string, RuntimeV2JsonValue>>) => readonly string[];
  readonly leaseOwner: ToolRegistrationLeaseOwner;
};

export class ToolRegistrationHandle {
  constructor(
    readonly registration: CapturedToolRegistration,
    private readonly unregister: () => void,
  ) {}

  beginDrain(): void {
    this.registration.leaseOwner.beginDrain();
    this.unregister();
  }

  async dispose(timeoutMs?: number): Promise<void> {
    this.beginDrain();
    await this.registration.leaseOwner.dispose(timeoutMs);
  }
}

export class ToolRegistry {
  readonly #byName = new Map<string, CapturedToolRegistration>();
  readonly #digestByVersion = new Map<string, string>();

  register(input: ToolExecutorRegistration): ToolRegistrationHandle {
    const definition = normalizeToolDefinition(input.definition);
    const versionKey = `${definition.name}@${definition.definitionVersion}`;
    const priorDigest = this.#digestByVersion.get(versionKey);
    if (priorDigest !== undefined && priorDigest !== definition.definitionDigest) {
      throw conflict(`Tool ${versionKey} was published with two definition digests.`);
    }
    if (this.#byName.has(definition.name)) throw conflict(`Duplicate tool name ${definition.name}.`);
    const registrationId = randomUUID();
    const registration: CapturedToolRegistration = Object.freeze({
      registrationId,
      definition,
      executor: input.executor,
      policies: Object.freeze([...(input.policies ?? [])]),
      middleware: Object.freeze([...(input.middleware ?? [])]),
      resolveResourcePaths: input.resolveResourcePaths ?? (() => []),
      leaseOwner: new ToolRegistrationLeaseOwner(registrationId),
    });
    this.#byName.set(definition.name, registration);
    this.#digestByVersion.set(versionKey, definition.definitionDigest);
    let registered = true;
    return new ToolRegistrationHandle(registration, () => {
      if (!registered) return;
      registered = false;
      if (this.#byName.get(definition.name) === registration) this.#byName.delete(definition.name);
    });
  }

  capture(name: string): CapturedToolRegistration {
    const registration = this.#byName.get(name);
    if (registration === undefined || registration.leaseOwner.state !== "active") {
      throw new ToolRuntimeError({ code: "TOOL_NOT_FOUND", message: `Tool ${name} is not active.`, retryable: false, phase: "prepare" });
    }
    return registration;
  }

  listDefinitions(): readonly NormalizedToolDefinition[] {
    return Object.freeze([...this.#byName.values()].map((item) => item.definition).sort((left, right) => left.name.localeCompare(right.name)));
  }
}

function conflict(message: string): ToolRuntimeError {
  return new ToolRuntimeError({ code: "TOOL_REGISTRATION_CONFLICT", message, retryable: false, phase: "prepare" });
}
