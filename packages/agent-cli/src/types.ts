import type { AgentEvent, AgentLoopResult, Message, PermissionMode } from "@actspace/agent-core";
export type { PermissionMode } from "@actspace/agent-core";

export interface RunCommandOptions {
  input?: string;
  inputFile?: string;
  workspace?: string;
  permissionMode: PermissionMode;
  json: boolean;
  out?: string;
  mock: boolean;
  model?: string;
}

export interface CliArtifactResult {
  ok: boolean;
  finalText: string;
  model?: string;
  provider?: string;
  stopReason?: string;
  totalUsage?: AgentLoopResult["totalUsage"];
  messageCount: number;
  eventCount: number;
  permissionMode: PermissionMode;
  workspace: string;
  startedAt: string;
  endedAt: string;
}

export interface SerializableAgentEvent {
  timestamp: string;
  event: AgentEvent;
}

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
