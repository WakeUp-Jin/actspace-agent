import type {
  RuntimeComposerProjection,
  RuntimeProviderUsageProjection,
  RuntimeRequestContextEstimateProjection,
  RuntimeSessionMessage,
  RuntimeSessionSnapshot,
  RuntimeTrajectorySnapshot,
} from "@actspace/shared/runtime-v2";
import { contextEstimateState, contextEstimateUsage, type ContextEstimateView } from "@actspace/shared";
import type { ClientLiveOverlay } from "./live-overlay.js";
import type { ClientSessionCell } from "./session-snapshot.js";
import { projectTrajectoryWindow } from "./trajectory.js";
import { projectChatWindow } from "./chat.js";

export function selectChatSession(
  cell: ClientSessionCell,
  workspaceRoot = "",
): import("@actspace/shared").SessionRecord | null {
  if (!cell.snapshot || !cell.window) return null;
  return projectChatWindow(
    {
      kind: "session-projection",
      schemaVersion: 1,
      sessionId: cell.sessionId,
      throughJournalSeq: cell.snapshot.throughJournalSeq,
      snapshot: cell.snapshot,
      values: cell.projectionValues,
      window: cell.window,
      activeMessageIds: cell.snapshot.messages.map((message) => message.messageId),
      deferredToolCalls: cell.deferredToolCalls,
    },
    workspaceRoot,
  );
}

export function selectToolViews(
  cell: ClientSessionCell,
): readonly import("@actspace/shared/runtime-v2").RuntimeToolView[] {
  return cell.snapshot?.tools ?? [];
}

export function selectSessionSnapshot(cell: ClientSessionCell): RuntimeSessionSnapshot | null {
  return cell.snapshot;
}
export function selectSurfaceMessages(cell: ClientSessionCell): readonly RuntimeSessionMessage[] {
  return cell.snapshot?.messages ?? [];
}
export function selectLiveOverlay(overlay: ClientLiveOverlay | null): ClientLiveOverlay | null {
  return overlay;
}
const trajectories = new WeakMap<object, RuntimeTrajectorySnapshot>();
export function selectTrajectory(cell: ClientSessionCell): RuntimeTrajectorySnapshot | null {
  if (!cell.window) return null;
  let value = trajectories.get(cell.window);
  if (!value) {
    value = projectTrajectoryWindow(cell.sessionId, cell.window);
    trajectories.set(cell.window, value);
  }
  return value;
}
export function selectComposer(cell: ClientSessionCell): RuntimeComposerProjection | null {
  const snapshot = cell.snapshot;
  return snapshot
    ? {
        kind: "composer",
        schemaVersion: 1,
        sessionId: cell.sessionId,
        throughJournalSeq: snapshot.throughJournalSeq,
        phase:
          snapshot.activity.activeTurnId || snapshot.pendingInbox.length || snapshot.messages.length
            ? "active"
            : "blank",
      }
    : null;
}
export function selectProviderUsage(cell: ClientSessionCell): RuntimeProviderUsageProjection | null {
  return cell.snapshot
    ? {
        kind: "provider-usage",
        schemaVersion: 1,
        sessionId: cell.sessionId,
        throughJournalSeq: cell.snapshot.throughJournalSeq,
        estimator: { name: "durable-provider-usage", version: "1" },
        usage: cell.snapshot.usage,
      }
    : null;
}
/** 上下文估算（`contextEstimate` 投影，agent-spec-request-record.md §6.3）：圆环、弹窗、面板、Web 只读这一个来源。 */
// 投影值只在估算变化时换对象；按它缓存，流式时每帧换 cell 也返回同一个结果，订阅方不重渲染。
const estimates = new WeakMap<
  object,
  { readonly snapshot: object; readonly value: RuntimeRequestContextEstimateProjection }
>();
export function selectRequestContextEstimate(cell: ClientSessionCell): RuntimeRequestContextEstimateProjection | null {
  const view = cell.projectionValues.contextEstimate as unknown as ContextEstimateView | undefined;
  const snapshot = cell.snapshot;
  if (!view || !snapshot) return null;
  const cached = estimates.get(view);
  // 用量快照里的累计用量、压缩次数来自会话快照；它们变了才重建。
  if (
    cached &&
    (cached.snapshot === snapshot ||
      (cached.value.usage.cumulativeTokens === snapshot.usage.totalTokens &&
        cached.value.usage.compressionCount === snapshot.activity.compactionCount))
  )
    return cached.value;
  const value: RuntimeRequestContextEstimateProjection = {
    kind: "request-context-estimate",
    schemaVersion: 1,
    sessionId: cell.sessionId,
    throughJournalSeq: cell.projectionRevisions.contextEstimate ?? view.throughJournalSeq,
    estimate: view,
    contextState: cached?.value.contextState ?? contextEstimateState(view, cell.sessionId),
    usage: contextEstimateUsage(view, snapshot),
  };
  estimates.set(view, { snapshot, value });
  return value;
}
