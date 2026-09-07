import type { RuntimeV2PermissionMode } from "./runtime-v2/types";
import type { RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
export type PermissionMode = RuntimeV2PermissionMode;

export type CliOutputFormat = "text" | "json" | "jsonl";
export type CliExitCode = 0 | 1 | 2 | 3 | 4 | 130;

export interface RunCommandOptions {
  input?: string;
  inputFile?: string;
  workspace?: string;
  permissionMode: PermissionMode;
  outputFormat: CliOutputFormat;
  out?: string;
  mock: boolean;
  model?: string;
  dataDir?: string;
  persist?: boolean;
  resume?: string;
}

export interface CliArtifactResult {
  schemaVersion: 1;
  ok: boolean;
  status: "completed" | "failed" | "aborted" | "approval_required";
  exitCode: CliExitCode;
  sessionId: string;
  agentRunId: string;
  turnId?: string;
  reason?: "completed" | "aborted" | "failed" | "step-limit" | "concludes-turn";
  steps?: number;
  finalText: string;
  snapshot?: RuntimeV2SessionSnapshot;
  model?: string;
  provider?: string;
  stopReason?: string;
  totalUsage?: unknown;
  messageCount: number;
  eventCount: number;
  permissionMode: PermissionMode;
  workspace: string;
  startedAt: string;
  endedAt: string;
  error?: { code: string; message: string };
  persistent?: boolean;
}

export type SerializableTraceEvent = never;

export interface ContextSnapshotArtifact {
  readonly id: string;
  readonly kind: "pre-llm" | "post-compaction" | "final";
}
