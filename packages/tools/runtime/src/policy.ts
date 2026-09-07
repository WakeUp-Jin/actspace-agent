import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { NormalizedToolDefinition } from "./definition.js";

export type ToolRisk = "low" | "medium" | "high";

export type ToolPolicyDecision =
  | { readonly kind: "continue" }
  | { readonly kind: "require-approval"; readonly reason: string; readonly risk: ToolRisk }
  | { readonly kind: "deny"; readonly code: string; readonly reason: string };

export type ToolPolicyContext = {
  readonly definition: NormalizedToolDefinition;
  readonly callId: string;
  readonly args: Readonly<Record<string, RuntimeV2JsonValue>>;
  readonly hostCapabilities: readonly string[];
  readonly workspaceRoot: string;
};

export type ToolPolicy = {
  readonly id: string;
  readonly layer: number;
  readonly order: number;
  evaluate(context: ToolPolicyContext): ToolPolicyDecision | Promise<ToolPolicyDecision>;
};

export function sortToolContributions<T extends { readonly id: string; readonly layer: number; readonly order: number }>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values].sort((left, right) => left.layer - right.layer || left.order - right.order || left.id.localeCompare(right.id)));
}

export async function evaluateToolPolicies(policies: readonly ToolPolicy[], context: ToolPolicyContext): Promise<ToolPolicyDecision> {
  let result: ToolPolicyDecision = { kind: "continue" };
  for (const policy of sortToolContributions(policies)) {
    const decision = await policy.evaluate(context);
    if (decision.kind === "deny") return decision;
    if (decision.kind === "require-approval" && result.kind === "continue") result = decision;
  }
  return result;
}
