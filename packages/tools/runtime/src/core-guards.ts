import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { NormalizedToolDefinition } from "./definition.js";
import type { ToolActivationLease } from "./activation-lease.js";
import { ToolRuntimeError } from "./errors.js";

export type ToolGuardContext = {
  readonly definition: NormalizedToolDefinition;
  readonly args: Readonly<Record<string, RuntimeV2JsonValue>>;
  readonly hostCapabilities: ReadonlySet<string>;
  readonly lease: ToolActivationLease;
  readonly signal: AbortSignal;
  readonly executorConcurrencySafe: boolean;
};

export function enforceCoreToolGuards(context: ToolGuardContext): void {
  context.lease.assertUsable();
  if (context.signal.aborted) {
    throw new ToolRuntimeError({ code: "TOOL_ABORTED", message: "Tool call was aborted before dispatch.", retryable: true, phase: "guard" });
  }
  for (const effect of context.definition.effects) {
    if (!context.hostCapabilities.has(effect.capabilityId)) {
      throw new ToolRuntimeError({ code: "CAPABILITY_DENIED", message: `Host capability ${effect.capabilityId} is unavailable.`, retryable: false, phase: "guard" });
    }
  }
  if (context.definition.concurrency === "read-only" && context.definition.effects.some((effect) => effect.mode === "write" || effect.mode === "execute")) {
    throw new ToolRuntimeError({ code: "CAPABILITY_DENIED", message: "read-only concurrency requires read-only effects.", retryable: false, phase: "guard" });
  }
  if (context.definition.concurrency === "declared-safe" && !context.executorConcurrencySafe) {
    throw new ToolRuntimeError({ code: "CAPABILITY_DENIED", message: "declared-safe concurrency requires an executor declaration.", retryable: false, phase: "guard" });
  }
}
