import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";

export type LogicalRequestCandidate = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly messages: readonly RuntimeJsonValue[];
  readonly systemSections: readonly RuntimeJsonValue[];
  readonly facts: readonly RuntimeJsonValue[];
  readonly modelFacts: readonly RuntimeJsonValue[];
  readonly renderedSystemPrompt: string;
  readonly tools: readonly RuntimeJsonValue[];
  readonly contributorProvenance: readonly RuntimeJsonValue[];
  readonly requestOptions: RuntimeJsonValue;
};

export type PreparedRequestMetadata = {
  readonly route: string;
  readonly model: string;
  readonly registrationId: string;
  readonly adapterVersion: string;
  readonly defaults: RuntimeJsonValue;
  readonly retryPolicy: RuntimeJsonValue;
  /** Model context capacity resolved at request preparation time; null means unknown. */
  readonly contextWindow?: number | null;
};

export type LogicalRequestSnapshot = LogicalRequestCandidate & {
  readonly schemaVersion: 2;
  readonly compositionDigest: string;
  readonly hostCapabilityDigest: string;
  readonly prepared: PreparedRequestMetadata;
};

export { freezeRequest } from "@actspace/context-engine";
