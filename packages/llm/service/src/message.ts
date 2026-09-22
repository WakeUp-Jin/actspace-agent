import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";

export type LlmMessage = {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string | readonly LlmContentBlock[];
  readonly callId?: string;
};

export type LlmReplayEnvelope = {
  readonly schemaVersion: 1;
  readonly adapterFamily: string;
  readonly providerId: string;
  readonly protocol: string;
  readonly modelId: string;
  readonly payload: RuntimeV2JsonValue;
};

export type LlmContentBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "reasoning"; readonly text: string; readonly signature?: string; readonly replay?: LlmReplayEnvelope }
  | { readonly type: "image"; readonly artifactId: string; readonly mimeType: string; readonly alt?: string }
  | { readonly type: "tool-call"; readonly callId: string; readonly name: string; readonly arguments: string }
  | { readonly type: "tool-result"; readonly callId: string; readonly content: string };

export type LlmToolDefinition = {
  readonly name: string;
  readonly definitionVersion: number;
  readonly definitionDigest: string;
  readonly description: string;
  readonly inputSchema: RuntimeV2JsonValue;
};

export type LlmRequestOptions = {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly reasoning?: boolean;
  readonly reasoningEffort?: import("@actspace/shared").ModelReasoningEffort;
  readonly responseFormat?: RuntimeV2JsonValue;
};
