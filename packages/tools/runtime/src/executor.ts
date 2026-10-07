import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ApprovalBroker } from "@actspace/tools-approval";
import type { ToolFailure } from "./errors.js";

import type { ToolResource } from "./permission/types.js";
import type { PermissionMode } from "@actspace/shared/runtime-v2";

export type ToolArtifactRef = {
  readonly artifactId: string;
  readonly mediaType: string;
  readonly size: number;
  readonly sha256: string;
};

export type SessionArtifactResolver = (sessionId: string, artifactId: string) => Promise<{ readonly path: string; readonly mediaType: string }>;

export type ToolArtifactOwner = {
  readonly sessionId: string;
  readonly callId: string;
  readonly pluginId: string;
  readonly name: string;
};

export type ToolModelOutputBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "json"; readonly value: RuntimeV2JsonValue }
  | { readonly type: "artifact"; readonly artifact: ToolArtifactRef; readonly label?: string };

export type ToolDetailBlock = {
  readonly label: string;
  readonly value: RuntimeV2JsonValue;
};

export type ToolRendererCandidate = {
  readonly id: string;
  readonly schemaVersion: number;
  readonly props: RuntimeV2JsonValue;
};

export type ToolBodyResult = {
  readonly status: "completed" | "failed";
  readonly modelOutput: readonly ToolModelOutputBlock[];
  readonly summary: string;
  readonly detail?: readonly ToolDetailBlock[];
  readonly artifacts?: readonly ToolArtifactRef[];
  readonly renderer?: ToolRendererCandidate;
  readonly failure?: Omit<ToolFailure, "phase">;
};

export interface ToolCapabilitySet {
  readonly ids: readonly string[];
  has(capabilityId: string): boolean;
  get<T>(capabilityId: string): T;
}

export type ToolProgressUpdate = {
  readonly message: string;
  readonly completed?: number;
  readonly total?: number;
  /** Optional live file-change counters used by write/edit previews. */
  readonly additions?: number;
  readonly deletions?: number;
};

export type ToolExecutionContext = {
  readonly pluginId: string;
  readonly name: string;
  readonly callId: string;
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly contextGeneration?: number;
  readonly permissionMode?: PermissionMode;
  readonly admittedResources?: readonly ToolResource[];
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly signal: AbortSignal;
  readonly capabilities: ToolCapabilitySet;
  readonly reportProgress: (update: ToolProgressUpdate) => void;
  /** Nested management approvals use the same Run budget pause as normal tool approvals. */
  readonly requestApproval?: ApprovalBroker["requestApproval"];
  readonly notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>;
  readonly createArtifact: (input: { readonly bytes: Uint8Array; readonly mediaType: string }) => Promise<ToolArtifactRef>;
  readonly defer: (finalizer: () => Promise<void>) => void;
};

export type ToolExecutor = {
  readonly concurrencySafe?: boolean;
  execute(args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext): Promise<ToolBodyResult>;
};
