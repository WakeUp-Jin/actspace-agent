import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { AgentScope } from "@actspace/core-scope";

export type ContributorLayer = "core" | "profile" | "host" | "agent" | "plugin";
export type ContributorKind = "prompt-section" | "request-fact";
export type ContributorCriticality = "required" | "optional";

export type AssemblyInput = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly scope: AgentScope;
  readonly surface: readonly RuntimeV2JsonValue[];
  readonly hostFacts: RuntimeV2JsonValue;
  readonly selectedSkillIds: readonly string[];
};

export type ContributorOutput = {
  readonly value: RuntimeV2JsonValue;
  readonly provenance?: RuntimeV2JsonValue;
};

export type PromptContributor = {
  readonly id: string;
  readonly ownerPluginId: string;
  readonly scopeId: string;
  readonly kind: ContributorKind;
  readonly layer: ContributorLayer;
  readonly order: number;
  readonly criticality: ContributorCriticality;
  readonly resolve: (input: AssemblyInput) => ContributorOutput | Promise<ContributorOutput>;
};
