import type { RuntimeV2ArtifactRef } from "@actspace/shared/runtime-v2";
import type { LlmUsage } from "@actspace/llm-service";

export type SubagentTerminalStatus = "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
export type SubagentTerminalResult = {
  readonly invocationId: string;
  readonly childAgentId: string;
  readonly childSessionId: string;
  readonly presetId: string;
  readonly status: SubagentTerminalStatus;
  readonly text: string;
  readonly usage: LlmUsage | null;
  readonly toolUseCount: number;
  readonly durationMs: number;
  readonly artifacts: readonly RuntimeV2ArtifactRef[];
  readonly failure: { readonly code: string; readonly message: string; readonly retryable: boolean } | null;
};
