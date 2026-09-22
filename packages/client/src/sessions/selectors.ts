import type { RuntimeV2ComposerProjection, RuntimeV2ProviderUsageProjection, RuntimeV2RequestContextEstimateProjection, RuntimeV2SessionMessage, RuntimeV2SessionSnapshot, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import type { ContextState } from "@actspace/shared";
import type { ClientLiveOverlay } from "./live-overlay.js";
import type { ClientSessionCell } from "./session-snapshot.js";
import { projectTrajectoryWindow } from "./trajectory.js";
import { projectChatWindow } from "./chat.js";

export function selectChatSession(cell: ClientSessionCell, workspaceRoot = ""): import("@actspace/shared").SessionRecord | null {
  if (!cell.snapshot || !cell.window || !cell.projectionValues.requestContext) return null;
  return projectChatWindow({ kind: "session-projection", schemaVersion: 1, sessionId: cell.sessionId, throughJournalSeq: cell.snapshot.throughJournalSeq, snapshot: cell.snapshot, values: cell.projectionValues, window: cell.window, activeMessageIds: cell.snapshot.messages.map(message => message.messageId), deferredToolCalls: cell.deferredToolCalls }, workspaceRoot);
}

export function selectToolViews(cell: ClientSessionCell): readonly import("@actspace/shared/runtime-v2").RuntimeV2ToolView[] {
  return cell.snapshot?.tools ?? [];
}

export function selectSessionSnapshot(cell: ClientSessionCell): RuntimeV2SessionSnapshot | null { return cell.snapshot; }
export function selectSurfaceMessages(cell: ClientSessionCell): readonly RuntimeV2SessionMessage[] { return cell.snapshot?.messages ?? []; }
export function selectLiveOverlay(overlay: ClientLiveOverlay | null): ClientLiveOverlay | null { return overlay; }
const trajectories = new WeakMap<object, RuntimeV2TrajectorySnapshot>();
export function selectTrajectory(cell: ClientSessionCell): RuntimeV2TrajectorySnapshot | null {
  if (!cell.window) return null;
  let value = trajectories.get(cell.window);
  if (!value) { value = projectTrajectoryWindow(cell.sessionId, cell.window); trajectories.set(cell.window, value); }
  return value;
}
export function selectComposer(cell: ClientSessionCell): RuntimeV2ComposerProjection | null {
  const snapshot = cell.snapshot;
  return snapshot ? { kind: "composer", schemaVersion: 1, sessionId: cell.sessionId, throughJournalSeq: snapshot.throughJournalSeq,
    phase: snapshot.activity.activeTurnId || snapshot.pendingInbox.length || snapshot.messages.length ? "active" : "blank" } : null;
}
export function selectProviderUsage(cell: ClientSessionCell): RuntimeV2ProviderUsageProjection | null {
  return cell.snapshot ? { kind: "provider-usage", schemaVersion: 1, sessionId: cell.sessionId, throughJournalSeq: cell.snapshot.throughJournalSeq, estimator: { name: "durable-provider-usage", version: "1" }, usage: cell.snapshot.usage } : null;
}
export function selectRequestContextEstimate(cell: ClientSessionCell): RuntimeV2RequestContextEstimateProjection | null {
  const contextState = cell.projectionValues.requestContext as unknown as ContextState | undefined;
  if (!contextState || !cell.snapshot) return null;
  return { kind: "request-context-estimate", schemaVersion: 1, sessionId: cell.sessionId, throughJournalSeq: cell.projectionRevisions.requestContext ?? -1,
    contextState, requestId: contextState.requestId ?? null, estimator: { name: "runtime-v2-request-snapshot", version: contextState.estimator.version },
    totalEstimatedTokens: contextState.totalEstimatedTokens, maxTokens: contextState.maxTokens, percentUsed: contextState.percentUsed,
    cumulativeTokens: cell.snapshot.usage.totalTokens, cumulativeUsage: cell.snapshot.usage };
}
