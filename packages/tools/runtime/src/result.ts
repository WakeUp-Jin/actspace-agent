import type { ToolArtifactRef, ToolDetailBlock, ToolModelOutputBlock, ToolRendererCandidate } from "./executor.js";
import type { ToolFailure } from "./errors.js";

export type ToolTerminalStatus = "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";

export type ToolExecutionResult = {
  readonly status: ToolTerminalStatus;
  readonly callId: string;
  readonly pluginId: string;
  readonly name: string;
  readonly registrationId: string;
  readonly definitionVersion: number;
  readonly definitionDigest: string;
  readonly summary: string;
  readonly modelOutput: readonly ToolModelOutputBlock[];
  readonly detail: readonly ToolDetailBlock[];
  readonly artifacts: readonly ToolArtifactRef[];
  readonly renderer?: ToolRendererCandidate;
  readonly failure?: ToolFailure;
  readonly finalizerFailures: readonly ToolFailure[];
  readonly dispatched: boolean;
};
