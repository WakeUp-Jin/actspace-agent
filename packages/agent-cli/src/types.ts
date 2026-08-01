import type { Message, PermissionMode } from "@actspace/agent-core";
import type { RuntimeStreamEvent, SessionEvent } from "@actspace/shared";
export type { PermissionMode } from "@actspace/agent-core";

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
}

export interface ChatCommandOptions {
  workspace?: string;
  permissionMode: PermissionMode;
  mock: boolean;
  model?: string;
  dataDir?: string;
}

export interface CliArtifactResult {
  schemaVersion: 1;
  ok: boolean;
  status: "completed" | "failed" | "aborted" | "approval_required";
  exitCode: CliExitCode;
  sessionId: string;
  agentRunId: string;
  finalText: string;
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
}

export type SerializableTraceEvent =
  | { timestamp: string; source: "runtime"; event: RuntimeStreamEvent }
  | { timestamp: string; source: "harness"; event: SessionEvent };

export interface ContextSnapshotArtifact {
  id: string;
  kind: "pre-llm" | "post-compaction" | "final";
  turnIndex?: number;
  callId?: string;
  messageCount: number;
  tokenEstimate: number;
  compacted: boolean;
  toolCallIds: string[];
  messages: Message[];
}
