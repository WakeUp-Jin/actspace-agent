import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionSurfaceView } from "@actspace/session-journal";
import type { LlmMessage, LlmRequestOptions, LlmToolDefinition } from "@actspace/llm-service";

export type ContextRequest = {
  readonly sessionId: string;
  readonly turnId?: string;
  readonly stepId?: string;
  readonly requestId: string;
  readonly routeId: string;
  readonly model: string;
  readonly options: LlmRequestOptions;
};
export type SystemSection = { readonly id: string; readonly owner: string; readonly order: number; readonly content: RuntimeV2JsonValue };
export type SystemContext = { readonly sections: readonly SystemSection[]; readonly modelFacts: readonly RuntimeV2JsonValue[] };
export type ContextSupplement = { readonly id: string; readonly owner: string; readonly sourceEventSeq: number; readonly afterEventSeq: number; readonly text: string };
export type ContextPathState = {
  readonly id: string;
  readonly path: string;
  readonly description?: string;
  readonly owners: readonly string[];
  readonly visibility: "active" | "sleeping";
  readonly readsInCycle: number;
  readonly addedCycle: number;
  readonly lastReadAt?: string;
  readonly history?: { readonly sessionId: string; readonly sourceEventSeqs: readonly number[] };
};
export type ContextStatus = {
  readonly throughJournalSeq: number;
  readonly cycle: number;
  readonly paths: readonly ContextPathState[];
  readonly sleepingDirectory?: { readonly artifactId: string; readonly mediaType: string; readonly path: string };
  readonly facts: readonly RuntimeV2JsonValue[];
  readonly plugins: Readonly<Record<string, RuntimeV2JsonValue>>;
};
/** A request-scoped, immutable view. Conversation is the existing Session projection. */
export type Context = {
  readonly request: ContextRequest;
  readonly content: {
    readonly system: SystemContext;
    readonly conversation: SessionSurfaceView;
    readonly supplements: readonly ContextSupplement[];
    readonly tools: readonly LlmToolDefinition[];
  };
  readonly status: ContextStatus;
};
export type LlmInput = {
  readonly requestId: string;
  readonly sessionId: string;
  readonly routeId: string;
  readonly model: string;
  readonly messages: readonly LlmMessage[];
  readonly tools: readonly LlmToolDefinition[];
  readonly options: LlmRequestOptions;
};
export type ArtifactResolver = (sessionId: string, artifactId: string) => Promise<{ readonly path: string; readonly mediaType: string }>;
