import type { ContextState, ContextUsageSnapshot } from "@actspace/shared";
import { selectComposer, selectRequestContextEstimate, type ClientSessionCell } from "@actspace/client/sessions";
import { contextEstimateToSnapshot } from "../../session/projection-display";
import { jsonEqual } from "../../json-equal";

/**
 * 工作台（WorkbenchLayout / ConversationView）从会话投影里要的那一小块。
 * 流式时 cell 每帧换一次，但这几个派生值几乎不变：用 `useProjectionSelect(selectSessionView, sameSessionView)`
 * 订阅，外壳只在它们真的变了才重渲染。
 */
export type SessionProjectionView = {
  /** Durable Surface 消息条数；0 表示还没有。 */
  readonly surfaceMessageCount: number;
  readonly composerPhase: "blank" | "engaging" | "active" | undefined;
  /** 请求上下文估算对应的 ContextState / 用量快照（没有估算时为空）。 */
  readonly contextState: ContextState | undefined;
  readonly contextSnapshot: ContextUsageSnapshot | null;
  readonly status: ClientSessionCell["status"];
  readonly error: string | null;
  readonly permissionMode: NonNullable<NonNullable<ClientSessionCell["snapshot"]>["permissionMode"]> | "default";
  /** 上下文读取的刷新键：最近一条非 chunk 的 Journal 事件序号。chunk 只追加正文，不改上下文，不该每帧触发刷新。 */
  readonly contextRevision: number | undefined;
};

/** 窗口末尾最近一条不是 `assistant/chunk` 的事件序号；窗口里全是 chunk 或没有窗口时退回快照的 throughJournalSeq。 */
export function contextRevisionOf(cell: ClientSessionCell): number | undefined {
  const events = cell.window?.events;
  if (events) {
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (event.type !== "assistant/chunk") return event.seq;
    }
  }
  return cell.snapshot?.throughJournalSeq;
}

export function selectSessionView(cell: ClientSessionCell | null): SessionProjectionView | null {
  if (!cell) return null;
  const estimate = selectRequestContextEstimate(cell);
  return {
    surfaceMessageCount: cell.snapshot?.messages.length ?? 0,
    composerPhase: selectComposer(cell)?.phase,
    contextState: estimate?.contextState,
    contextSnapshot: estimate ? contextEstimateToSnapshot(estimate) : null,
    status: cell.status,
    error: cell.error,
    permissionMode: cell.snapshot?.permissionMode ?? "default",
    contextRevision: contextRevisionOf(cell),
  };
}

export function sameSessionView(left: SessionProjectionView | null, right: SessionProjectionView | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.surfaceMessageCount === right.surfaceMessageCount && left.composerPhase === right.composerPhase
    && left.contextState === right.contextState && left.status === right.status && left.error === right.error
    && left.permissionMode === right.permissionMode && left.contextRevision === right.contextRevision
    && jsonEqual(left.contextSnapshot, right.contextSnapshot);
}
