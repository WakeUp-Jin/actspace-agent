import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { AgentScope } from "@actspace/scope";

export type ContributorLayer = "core" | "profile" | "host" | "agent" | "plugin";
export type ContributorKind = "prompt-section" | "model-fact" | "request-fact";
export type ContributorCriticality = "required" | "optional";

export type AssemblyInput = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly scope: AgentScope;
  readonly surface: readonly RuntimeJsonValue[];
  readonly hostFacts: RuntimeJsonValue;
  readonly selectedSkillIds: readonly string[];
};

export type ContributorOutput = {
  readonly value: RuntimeJsonValue;
  readonly provenance?: RuntimeJsonValue;
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
