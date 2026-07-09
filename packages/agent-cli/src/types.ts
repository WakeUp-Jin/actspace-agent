import type { AgentEvent, AgentLoopResult, Message } from "@actspace/agent-core";

export type PermissionMode = "default" | "trusted" | "yolo";

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
  kind: "final";
  messageCount: number;
  messages: Message[];
}
