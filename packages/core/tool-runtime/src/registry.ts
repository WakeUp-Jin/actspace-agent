import { randomUUID } from "node:crypto";

import { ToolRegistrationLeaseOwner } from "./activation-lease.js";
import { normalizeToolDefinition, type NormalizedToolDefinition, type ToolDefinition } from "./definition.js";
import type { ToolExecutor } from "./executor.js";
import { ToolRuntimeError } from "./errors.js";
import type { ToolPermissionContract } from "./permission/types.js";

export type ToolExecutorRegistration = {
  readonly definition: ToolDefinition;
  readonly executor: ToolExecutor;
  readonly permission?: ToolPermissionContract;
  /** Synchronous and O(1). `false`, or a throw, hides the tool from `listDefinitions()`; `capture()` is unaffected. */
  readonly visible?: () => boolean;
};

export type CapturedToolRegistration = {
  readonly registrationId: string;
  readonly definition: NormalizedToolDefinition;
  readonly executor: ToolExecutor;
  readonly permission: ToolPermissionContract;
  readonly leaseOwner: ToolRegistrationLeaseOwner;
  readonly visible?: () => boolean;
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
      permission: input.permission ?? ALLOW_ALL_PERMISSION,
      leaseOwner: new ToolRegistrationLeaseOwner(registrationId),
      ...(input.visible === undefined ? {} : { visible: input.visible }),
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
    const definitions: NormalizedToolDefinition[] = [];
    for (const item of this.#byName.values()) if (isVisible(item)) definitions.push(item.definition);
    return Object.freeze(definitions.sort((left, right) => left.name.localeCompare(right.name)));
  }
}

function isVisible(registration: CapturedToolRegistration): boolean {
  if (registration.visible === undefined) return true;
  try { return registration.visible() === true; } catch { return false; }
}

const ALLOW_ALL_PERMISSION: ToolPermissionContract = Object.freeze({
  extractResources: () => [],
  evaluate: () => ({ kind: "allow" as const }),
});

function conflict(message: string): ToolRuntimeError {
  return new ToolRuntimeError({ code: "TOOL_REGISTRATION_CONFLICT", message, retryable: false, phase: "prepare" });
}
