import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewGetSnapshotResult } from "@actspace/shared";
import { useReviewSummary } from "../components/review/use-review-summary";
import { setupBridge } from "./helpers/bridge";

type Deferred = { resolve: (value: ReviewGetSnapshotResult) => void; reject: (error: Error) => void };

function snapshot(workspaceId: string, additions: number): ReviewGetSnapshotResult {
  return {
    ok: true,
    snapshot: {
      id: `${workspaceId}-${additions}`,
      generation: 1,
      workspaceId,
      workspaceRoot: `/tmp/${workspaceId}`,
      repoRoot: `/tmp/${workspaceId}`,
      selection: { kind: "uncommitted" },
      baseline: { kind: "git-ref", label: "HEAD" },
      target: { label: "Working tree" },
      status: additions > 0 ? "ready" : "empty",
      files: [],
      totals: { files: 0, additions, deletions: 0, changedLines: additions, estimatedChangedBytes: 0 },
      loadPolicy: { mode: "all-files" },
      warnings: [],
      capabilities: { canLoadFullFile: true },
    },
  } as unknown as ReviewGetSnapshotResult;
}

/** getSnapshot（读缓存）和 refreshSnapshot（强制刷新）都挂起，由用例决定何时、以什么结果完成。 */
function deferredBridge() {
  const calls: Deferred[] = [];
  const started = vi.fn((_input: unknown) => undefined);
  const pending = (input: unknown) => {
    started(input);
    return new Promise<ReviewGetSnapshotResult>((resolve, reject) => calls.push({ resolve, reject }));
  };
  const getSnapshot = vi.fn((input: unknown) => pending(input));
  const refreshSnapshot = vi.fn((input: unknown) => pending(input));
  const handle = setupBridge({ "review.getSnapshot": getSnapshot, "review.refreshSnapshot": refreshSnapshot });
  const notify = (workspaceId: string) => act(() => handle.emit("reviewChanged", { workspaceId, generation: 2, reason: "refresh" }));
  const settle = async (index: number, result: ReviewGetSnapshotResult) => {
    await act(async () => { calls[index]!.resolve(result); });
  };
  return { calls, started, getSnapshot, refreshSnapshot, notify, settle };
}

describe("useReviewSummary", () => {
  it("forces a refresh on the first load so a stale cache is never shown", async () => {
    const bridge = deferredBridge();
    renderHook(() => useReviewSummary({ workspaceRoot: "/tmp/current", sessionId: null }));
    expect(bridge.refreshSnapshot).toHaveBeenCalledTimes(1);
    expect(bridge.getSnapshot).not.toHaveBeenCalled();
  });

  it("ignores change notifications from other workspaces", async () => {
    const bridge = deferredBridge();
    const { result } = renderHook(() => useReviewSummary({ workspaceRoot: "/tmp/current", sessionId: null }));
    expect(result.current.reviewSummary).toEqual({ status: "loading" });
    await bridge.settle(0, snapshot("ws-current", 3));
    expect(result.current.reviewSummary).toMatchObject({ status: "changes", additions: 3 });

    for (let index = 0; index < 20; index += 1) bridge.notify("ws-other");
    expect(bridge.started).toHaveBeenCalledTimes(1);

    bridge.notify("ws-current");
    expect(bridge.started).toHaveBeenCalledTimes(2);
  });

  it("keeps one request in flight and coalesces later changes into a single follow-up", async () => {
    const bridge = deferredBridge();
    renderHook(() => useReviewSummary({ workspaceRoot: "/tmp/current", sessionId: null }));
    await bridge.settle(0, snapshot("ws-current", 1));

    bridge.notify("ws-current");
    for (let index = 0; index < 10; index += 1) bridge.notify("ws-current");
    expect(bridge.started).toHaveBeenCalledTimes(2);

    await bridge.settle(1, snapshot("ws-current", 2));
    expect(bridge.started).toHaveBeenCalledTimes(3);
    await bridge.settle(2, snapshot("ws-current", 3));
    expect(bridge.started).toHaveBeenCalledTimes(3);
  });

  it("does not lose a change that arrives before the first snapshot reveals the workspace identity", async () => {
    const bridge = deferredBridge();
    const { result } = renderHook(() => useReviewSummary({ workspaceRoot: "/tmp/current", sessionId: null }));
    bridge.notify("session-root:abc");
    bridge.notify("ws-unrelated");
    await bridge.settle(0, snapshot("session-root:abc", 1));
    expect(bridge.started).toHaveBeenCalledTimes(2);
    await bridge.settle(1, snapshot("session-root:abc", 4));
    expect(result.current.reviewSummary).toMatchObject({ additions: 4 });
  });

  it("keeps the existing summary while refreshing the same target and reuses it when nothing changed", async () => {
    const bridge = deferredBridge();
    const { result } = renderHook(() => useReviewSummary({ workspaceRoot: "/tmp/current", sessionId: null }));
    await bridge.settle(0, snapshot("ws-current", 5));
    const first = result.current.reviewSummary;

    bridge.notify("ws-current");
    expect(result.current.reviewSummary).toBe(first);
    await bridge.settle(1, snapshot("ws-current", 5));
    expect(result.current.reviewSummary).toBe(first);
  });

  it("drops a slow response from the previous target after switching", async () => {
    const bridge = deferredBridge();
    const { result, rerender } = renderHook(
      ({ root }) => useReviewSummary({ workspaceRoot: root, sessionId: null }),
      { initialProps: { root: "/tmp/a" } },
    );
    rerender({ root: "/tmp/b" });
    expect(result.current.reviewSummary).toEqual({ status: "loading" });
    expect(bridge.started).toHaveBeenCalledTimes(2);
    // 切换目标时强制刷新。
    expect(bridge.refreshSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceRoot: "/tmp/b" }));

    await bridge.settle(1, snapshot("ws-b", 2));
    await bridge.settle(0, snapshot("ws-a", 9));
    expect(result.current.reviewSummary).toMatchObject({ additions: 2 });

    bridge.notify("ws-a");
    expect(bridge.started).toHaveBeenCalledTimes(2);
  });

  it("refreshReviewSummary forces refreshSnapshot, and only reads the cache when asked", async () => {
    const bridge = deferredBridge();
    const { result } = renderHook(() => useReviewSummary({ workspaceRoot: "/tmp/current", sessionId: null }));
    await bridge.settle(0, snapshot("ws-current", 1));
    expect(bridge.refreshSnapshot).toHaveBeenCalledTimes(1);

    // 模拟 Agent 一轮结束：App 调用 refreshReviewSummary()。
    act(() => { void result.current.refreshReviewSummary(); });
    expect(bridge.refreshSnapshot).toHaveBeenCalledTimes(2);
    await bridge.settle(1, snapshot("ws-current", 2));

    act(() => { void result.current.refreshReviewSummary(false); });
    expect(bridge.getSnapshot).toHaveBeenCalledTimes(1);
    await bridge.settle(2, snapshot("ws-current", 2));
  });

  it("escalates a queued follow-up to a forced refresh when any queued request was forced", async () => {
    const bridge = deferredBridge();
    const { result } = renderHook(() => useReviewSummary({ workspaceRoot: "/tmp/current", sessionId: null }));
    await bridge.settle(0, snapshot("ws-current", 1));

    act(() => { void result.current.refreshReviewSummary(false); });
    act(() => { void result.current.refreshReviewSummary(); });
    expect(bridge.started).toHaveBeenCalledTimes(2);
    await bridge.settle(1, snapshot("ws-current", 2));
    expect(bridge.started).toHaveBeenCalledTimes(3);
    expect(bridge.refreshSnapshot).toHaveBeenCalledTimes(2);
    await bridge.settle(2, snapshot("ws-current", 3));
  });

  it("shows a failure and recovers on the next explicit refresh", async () => {
    const bridge = deferredBridge();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() => useReviewSummary({ workspaceRoot: "/tmp/current", sessionId: null }));
    await act(async () => { bridge.calls[0]!.reject(new Error("git failed")); });
    expect(result.current.reviewSummary).toEqual({ status: "failed", reason: "command_failed" });

    act(() => { void result.current.refreshReviewSummary(); });
    await bridge.settle(1, snapshot("ws-current", 1));
    await waitFor(() => expect(result.current.reviewSummary).toMatchObject({ status: "changes", additions: 1 }));
  });
});
