import type { RuntimePermissionMode } from "./runtime-v2/types";
import type { RuntimeSessionSnapshot } from "@actspace/shared/runtime-v2";
export type PermissionMode = RuntimePermissionMode;

export type CliOutputFormat = "text" | "json" | "jsonl";
export type CliExitCode = 0 | 1 | 2 | 3 | 4 | 130 | 143;

export interface RunCommandOptions {
  input?: string;
  inputFile?: string;
  workspace?: string;
  permissionMode: PermissionMode;
  permissionModeExplicit?: boolean;
  outputFormat: CliOutputFormat;
  out?: string;
  mock: boolean;
  model?: string;
  dataDir?: string;
  persist?: boolean;
  resume?: string;
  /** Only the evaluation sandbox's launcher passes this: the CLI already runs inside an outer sandbox. */
  sandboxInherited?: boolean;
  /** Selection file: boot this Harness instead of the built-in one. */
  harness?: string;
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
  snapshot?: RuntimeSessionSnapshot;
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

