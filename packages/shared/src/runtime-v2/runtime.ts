import type { RuntimeV2HostCapability, RuntimeV2HostKind, RuntimeV2JsonValue } from "./host-dto";
import type { RuntimeV2DiagnosticsSnapshot, RuntimeV2SessionSnapshot } from "./projection";

export type RuntimeV2State = "booting" | "ready" | "quiescing" | "disposed";
export type MainAgentForm = "agent" | "chat";
export type MainAgentPresetId = "actspace.main" | "actspace.chat";
export type RuntimeV2AgentMode = "plan" | "agent";

export function mainAgentFormFromPresetId(presetId?: string): MainAgentForm {
  if (presetId === undefined || presetId === "actspace.main") return "agent";
  if (presetId === "actspace.chat") return "chat";
  throw new Error(`Unsupported main Agent preset ${presetId}.`);
}

export function mainAgentPresetId(form: MainAgentForm): MainAgentPresetId {
  return form === "chat" ? "actspace.chat" : "actspace.main";
}

export type RuntimeV2BootEntry = { readonly entryId: string; readonly pluginId: string; readonly version: string; readonly required: boolean; readonly state: "active" | "skipped" | "failed"; readonly capabilities: readonly RuntimeV2HostCapability[] };
export type RuntimeV2BootManifest = { readonly schemaVersion: 1; readonly runtimeContract: "actspace.runtime.v2"; readonly profileId: string; readonly hostKind: RuntimeV2HostKind; readonly manifestDigest: string; readonly configRevision: string; readonly capabilities: readonly RuntimeV2HostCapability[]; readonly entries: readonly RuntimeV2BootEntry[]; readonly config: RuntimeV2JsonValue };
export type RuntimeV2RestartState = { readonly required: boolean; readonly reasons: readonly string[]; readonly changedSources: readonly string[]; readonly candidateDigest: string | null };
export type RuntimeV2RuntimeState = { readonly state: RuntimeV2State; readonly runtimeInstanceId: string; readonly acceptingWork: boolean; readonly activeSessionIds: readonly string[]; readonly restart: RuntimeV2RestartState };
export type RuntimeV2SessionListItem = { readonly sessionId: string; readonly createdAt: string; readonly updatedAt: string; readonly workspaceRoot: string | null; readonly profileId: string; readonly agentForm: MainAgentForm; readonly completedTurnCount?: number; readonly accessState: RuntimeV2SessionSnapshot["accessState"]; readonly metadata: RuntimeV2SessionSnapshot["metadata"]; readonly lineage: RuntimeV2JsonValue | null };
export type RuntimeV2RunTurnRequest = { readonly sessionId: string; readonly content: RuntimeV2JsonValue; readonly messageId?: string; readonly agentRunId?: string; readonly model?: string; readonly mode?: RuntimeV2AgentMode; readonly thinkingEnabled?: boolean; readonly reasoningEffort?: import("../model-config").ModelReasoningEffort; readonly keepPendingOnAbort?: boolean; readonly selectedSkillIds?: readonly string[] };
export type RuntimeV2RunTurnResponse = { readonly sessionId: string; readonly agentRunId: string; readonly turnId: string; readonly reason: "completed" | "aborted" | "failed" | "step-limit" | "concludes-turn"; readonly steps: number; readonly finalText: string; readonly snapshot: RuntimeV2SessionSnapshot };
export type RuntimeV2ShutdownResult = { readonly disposed: boolean; readonly blockers: readonly string[]; readonly diagnostics: RuntimeV2DiagnosticsSnapshot };

export type RuntimeV2BrowseList = { items: readonly RuntimeV2SessionListItem[]; indexing: boolean; failed: number };
