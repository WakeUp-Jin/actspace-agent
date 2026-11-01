import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";

export type LogicalRequestCandidate = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly messages: readonly RuntimeV2JsonValue[];
  readonly systemSections: readonly RuntimeV2JsonValue[];
  readonly facts: readonly RuntimeV2JsonValue[];
  readonly modelFacts: readonly RuntimeV2JsonValue[];
  readonly renderedSystemPrompt: string;
  readonly tools: readonly RuntimeV2JsonValue[];
  readonly contributorProvenance: readonly RuntimeV2JsonValue[];
  readonly requestOptions: RuntimeV2JsonValue;
};

export type PreparedRequestMetadata = {
  readonly route: string;
  readonly model: string;
  readonly registrationId: string;
  readonly adapterVersion: string;
  readonly defaults: RuntimeV2JsonValue;
  readonly retryPolicy: RuntimeV2JsonValue;
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
