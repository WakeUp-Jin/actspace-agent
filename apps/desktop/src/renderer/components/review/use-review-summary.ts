import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewGetSnapshotResult } from "@actspace/shared";
import { eventsApi } from "../../api/events";
import { reviewApi } from "../../api/review";
import type { ComposerReviewSummary } from "../composer/composer-types";

export function reviewResultToSummary(result: ReviewGetSnapshotResult): ComposerReviewSummary {
  if (result.ok === false) {
    return {
      status: result.code === "not_a_repository" ? "notAvailable" : "failed",
      reason: result.code,
    };
  }
  return {
    status: result.snapshot.status === "ready" ? "changes" : result.snapshot.status,
    additions: result.snapshot.totals.additions,
    deletions: result.snapshot.totals.deletions,
  };
}

export function sameReviewSummary(a: ComposerReviewSummary, b: ComposerReviewSummary): boolean {
  return a.status === b.status && a.additions === b.additions && a.deletions === b.deletions && a.reason === b.reason;
}

type SummaryRun = {
  /** 当前目标最近一次成功快照的身份；工作树可能是 session-root，不能由路径推算。 */
  workspaceId: string | null;
  inFlight: boolean;
  pending: boolean;
};

/**
 * Composer 顶部的 Review 摘要。只响应当前目标工作区的变更通知；同一目标最多一个请求在途，
 * 期间的刷新合并成结束后的一次补查。切换目标时旧请求的结果直接丢弃。
 */
export function useReviewSummary(target: { workspaceRoot: string | null; sessionId: string | null }) {
  const [reviewSummary, setReviewSummary] = useState<ComposerReviewSummary | null>(null);
  const runRef = useRef<SummaryRun>({ workspaceId: null, inFlight: false, pending: false });
  const targetRef = useRef(target);
  targetRef.current = target;

  const load = useCallback(async () => {
    const run = runRef.current;
    if (run.inFlight) {
      run.pending = true;
      return;
    }
    run.inFlight = true;
    run.pending = false;
    let next: ComposerReviewSummary;
    try {
      const result = await reviewApi.getSnapshot({
        workspaceRoot: targetRef.current.workspaceRoot ?? undefined,
        sessionId: targetRef.current.sessionId ?? undefined,
        selection: { kind: "uncommitted" },
      });
      if (result.ok) run.workspaceId = result.snapshot.workspaceId;
      next = reviewResultToSummary(result);
    } catch (error) {
      console.error("Failed to refresh Review summary", error);
      next = { status: "failed", reason: "command_failed" };
    }
    run.inFlight = false;
    if (runRef.current !== run) return;
    // 内容没变就保留原引用，避免整个 App 跟着重渲染。
    setReviewSummary((current) => current && sameReviewSummary(current, next) ? current : next);
    if (run.pending) void load();
  }, []);

  const { workspaceRoot, sessionId } = target;
  useEffect(() => {
    runRef.current = { workspaceId: null, inFlight: false, pending: false };
    setReviewSummary({ status: "loading" });
    void load();
  }, [workspaceRoot, sessionId, load]);

  useEffect(() => eventsApi.reviewChanged((notification) => {
    const run = runRef.current;
    // 身份未知时只在首个请求在途期间记一次补查，不让其他工作区的通知反复触发查询。
    if (run.workspaceId === notification.workspaceId || (run.workspaceId === null && run.inFlight)) void load();
  }), [load]);

  const refreshReviewSummary = useCallback(() => load(), [load]);
  return { reviewSummary, refreshReviewSummary };
}
