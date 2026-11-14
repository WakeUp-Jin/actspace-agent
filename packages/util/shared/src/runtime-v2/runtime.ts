import type { RuntimeHostCapability, RuntimeHostKind, RuntimeJsonValue } from "./host-dto";
import type { RuntimeDiagnosticsSnapshot, RuntimeSessionSnapshot } from "./projection";

export type RuntimeState = "booting" | "ready" | "quiescing" | "disposed";
export type MainAgentForm = "agent" | "chat";
export type MainAgentPresetId = "actspace.main" | "actspace.chat";
export type RuntimeAgentMode = "chat" | "plan" | "agent";
export type AgentFormId = "actspace.main";

export function mainAgentFormFromPresetId(presetId?: string): MainAgentForm {
  if (presetId === undefined || presetId === "actspace.main") return "agent";
  if (presetId === "actspace.chat") return "chat";
  throw new Error(`Unsupported main Agent preset ${presetId}.`);
}

export function mainAgentPresetId(form: MainAgentForm): MainAgentPresetId {
  return form === "chat" ? "actspace.chat" : "actspace.main";
}

export type RuntimeBootEntry = { readonly entryId: string; readonly pluginId: string; readonly version: string; readonly required: boolean; readonly state: "active" | "skipped" | "failed"; readonly capabilities: readonly RuntimeHostCapability[] };
export type RuntimeBootManifest = { readonly schemaVersion: 1; readonly runtimeContract: "actspace.runtime.v2"; readonly profileId: string; readonly hostKind: RuntimeHostKind; readonly manifestDigest: string; readonly configRevision: string; readonly capabilities: readonly RuntimeHostCapability[]; readonly entries: readonly RuntimeBootEntry[]; readonly config: RuntimeJsonValue };
export type RuntimeRestartState = { readonly required: boolean; readonly reasons: readonly string[]; readonly changedSources: readonly string[]; readonly candidateDigest: string | null };
export type RuntimeStateView = { readonly state: RuntimeState; readonly runtimeInstanceId: string; readonly acceptingWork: boolean; readonly restart: RuntimeRestartState };
export type RuntimeSessionListItem = { readonly sessionId: string; readonly createdAt: string; readonly updatedAt: string; readonly workspaceRoot: string | null; readonly worktree?: import("../session").SessionWorktreeContext; readonly profileId: string; readonly agentForm: MainAgentForm; readonly agentFormId?: AgentFormId; readonly agentMode?: RuntimeAgentMode; readonly agentModeRevision?: number; readonly completedTurnCount?: number; readonly accessState: RuntimeSessionSnapshot["accessState"]; readonly metadata: RuntimeSessionSnapshot["metadata"]; readonly lineage: RuntimeJsonValue | null };
export type RuntimeRunTurnRequest = { readonly sessionId: string; readonly content: RuntimeJsonValue; readonly messageId?: string; readonly agentRunId?: string; readonly model?: string; readonly mode?: RuntimeAgentMode; readonly thinkingEnabled?: boolean; readonly reasoningEffort?: import("../model-config").ModelReasoningEffort; readonly selectedSkillIds?: readonly string[] };
/** Settled Host result. Harness-specific values never define Host lifecycle. */
export type RuntimeRunTurnResponse = {
  readonly sessionId: string;
  readonly taskId: string;
  readonly agentRunId: string | null;
  readonly outcome: import("./tasks").RunOutcome;
  readonly value: RuntimeJsonValue;
  readonly snapshot: RuntimeSessionSnapshot;
};
export type RuntimeShutdownResult = { readonly disposed: boolean; readonly blockers: readonly string[]; readonly diagnostics: RuntimeDiagnosticsSnapshot };

export type RuntimeBrowseList = { items: readonly RuntimeSessionListItem[]; indexing: boolean; failed: number };
