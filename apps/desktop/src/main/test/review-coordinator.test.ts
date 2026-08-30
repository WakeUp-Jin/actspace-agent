import { describe, expect, it, vi } from "vitest";
import type {
  ReviewFileDiff,
  ReviewMutationResult,
  ReviewSelection,
  ReviewSnapshot,
} from "@actspace/shared";
import {
  ReviewCoordinator,
  type ReviewMutationProvider,
  type ReviewQueryProvider,
} from "../review-coordinator";

function snapshot(selection: ReviewSelection, generation: number): ReviewSnapshot {
  return {
    id: `snapshot-${selection.kind}-${generation}`,
    generation,
    workspaceId: "workspace-1",
    workspaceRoot: "/workspace",
    repoRoot: "/workspace",
    selection,
    status: "ready",
    files: [{
      id: "file-1",
      path: "src/index.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      binary: false,
      renderKind: "text",
      source: "workingTree",
      diffLoadStatus: "idle",
      viewed: false,
      fingerprint: "file-fingerprint",
    }],
    totals: { files: 1, additions: 1, deletions: 1, changedLines: 2, estimatedChangedBytes: 128 },
    capabilities: {
      canStageFile: true,
      canStageHunk: true,
      canUnstageFile: false,
      canUnstageHunk: false,
      canRevertFile: true,
      canRevertHunk: true,
      canLoadFullFile: true,
      canOpenFile: true,
      canCommit: false,
      canPush: false,
      canCreatePullRequest: false,
      disabledReasons: {},
    },
    loadPolicy: { mode: "all-files" },
    queryOptions: { ignoreWhitespaceChanges: false },
    generatedAt: "2026-07-30T00:00:00.000Z",
  };
}

function fileDiff(snapshotId: string, generation: number): ReviewFileDiff {
  return {
    snapshotId,
    generation,
    fileId: "file-1",
    path: "src/index.ts",
    hunks: [],
    oldContentAvailable: true,
    newContentAvailable: true,
    partial: false,
    patchFingerprint: "patch-1",
  };
}

function setup(mutationResult?: ReviewMutationResult) {
  const getSnapshot = vi.fn<ReviewQueryProvider["getSnapshot"]>(async (input) => snapshot(input.selection, input.generation));
  const getFileDiffs = vi.fn<ReviewQueryProvider["getFileDiffs"]>(async (input) => ({
    ok: true,
    outcomes: input.requests.map((request) => ({ fileId: request.fileId, status: "ready" as const, diff: fileDiff(input.snapshot.id, input.generation) })),
  }));
  const getFileContents = vi.fn<ReviewQueryProvider["getFileContents"]>(async () => ({ ok: true, outcomes: [] }));
  const applyMutation = vi.fn<ReviewMutationProvider["applyMutation"]>(async () => mutationResult ?? ({
    status: "success",
    generation: 1,
    completedSteps: [{ id: "stage", status: "completed" }],
    failedSteps: [],
  }));
  const coordinator = new ReviewCoordinator({
    resolveWorkspace: async () => ({ ok: true, workspace: { workspaceId: "workspace-1", workspaceRoot: "/workspace" } }),
    queryProvider: { getSnapshot, getFileDiffs, getFileContents },
    mutationProvider: { applyMutation },
    debounceMs: 20,
  });
  return { coordinator, getSnapshot, getFileDiffs, getFileContents, applyMutation };
}

describe("ReviewCoordinator", () => {
  it("caches snapshots per selection and generation", async () => {
    const { coordinator, getSnapshot } = setup();
    await coordinator.getSnapshot({ workspaceId: "workspace-1", selection: { kind: "unstaged" } });
    await coordinator.getSnapshot({ workspaceId: "workspace-1", selection: { kind: "unstaged" } });
    await coordinator.getSnapshot({ workspaceId: "workspace-1", selection: { kind: "staged" } });

    expect(getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("rejects stale file diff before invoking the provider", async () => {
    const { coordinator, getFileDiffs } = setup();
    const loaded = await coordinator.getSnapshot({ workspaceId: "workspace-1", selection: { kind: "unstaged" } });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    coordinator.invalidate("workspace-1", "workspace");

    const result = await coordinator.getFileDiff({
      workspaceId: "workspace-1",
      snapshotId: loaded.snapshot.id,
      expectedGeneration: loaded.snapshot.generation,
      fileId: "file-1",
    });

    expect(result).toMatchObject({ ok: false, code: "stale_generation", currentGeneration: 2 });
    expect(getFileDiffs).not.toHaveBeenCalled();
  });

  it("rejects stale mutations and invalidates after success", async () => {
    const { coordinator, applyMutation } = setup();
    const stale = await coordinator.applyMutation({
      workspaceId: "workspace-1",
      mutation: {
        snapshotId: "snapshot-1",
        expectedGeneration: 0,
        action: "stage",
        scope: "file",
        source: "workingTree",
        path: "src/index.ts",
      },
    });
    expect(stale.status).toBe("stale");
    expect(applyMutation).not.toHaveBeenCalled();

    const success = await coordinator.applyMutation({
      workspaceId: "workspace-1",
      mutation: {
        snapshotId: "snapshot-1",
        expectedGeneration: 1,
        action: "stage",
        scope: "file",
        source: "workingTree",
        path: "src/index.ts",
      },
    });
    expect(success).toMatchObject({ status: "success", generation: 2 });
  });

  it("debounces workspace events into one generation", async () => {
    vi.useFakeTimers();
    const { coordinator } = setup();
    const notifications: number[] = [];
    coordinator.subscribe((notification) => notifications.push(notification.generation));
    coordinator.scheduleInvalidation("workspace-1", "watch");
    coordinator.scheduleInvalidation("workspace-1", "watch");
    coordinator.scheduleInvalidation("workspace-1", "watch");

    await vi.advanceTimersByTimeAsync(25);

    expect(notifications).toEqual([2]);
    coordinator.dispose();
    vi.useRealTimers();
  });

  it("deduplicates overlapping batch requests for the same file", async () => {
    const { coordinator, getFileDiffs } = setup();
    const loaded = await coordinator.getSnapshot({ workspaceId: "workspace-1", selection: { kind: "unstaged" } });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const pending = deferred<Awaited<ReturnType<ReviewQueryProvider["getFileDiffs"]>>>();
    getFileDiffs.mockImplementationOnce(() => pending.promise);
    const input = {
      workspaceId: "workspace-1",
      snapshotId: loaded.snapshot.id,
      expectedGeneration: loaded.snapshot.generation,
      requests: [{ fileId: "file-1", contextLines: 3 }],
    };
    const first = coordinator.getFileDiffs(input);
    await Promise.resolve();
    const second = coordinator.getFileDiffs(input);
    pending.resolve({ ok: true, outcomes: [{ fileId: "file-1", status: "ready", diff: fileDiff(loaded.snapshot.id, 1) }] });

    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(second).resolves.toMatchObject({ ok: true });
    expect(getFileDiffs).toHaveBeenCalledTimes(1);
  });

  it("removes failed file requests from cache so Retry can run again", async () => {
    const { coordinator, getFileDiffs } = setup();
    const loaded = await coordinator.getSnapshot({ workspaceId: "workspace-1", selection: { kind: "unstaged" } });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    getFileDiffs
      .mockResolvedValueOnce({ ok: true, outcomes: [{ fileId: "file-1", status: "failed", code: "command_failed", message: "temporary" }] })
      .mockResolvedValueOnce({ ok: true, outcomes: [{ fileId: "file-1", status: "ready", diff: fileDiff(loaded.snapshot.id, 1) }] });
    const input = { workspaceId: "workspace-1", snapshotId: loaded.snapshot.id, expectedGeneration: 1, requests: [{ fileId: "file-1" }] };

    await expect(coordinator.getFileDiffs(input)).resolves.toMatchObject({ ok: true, outcomes: [{ status: "failed" }] });
    await Promise.resolve();
    await expect(coordinator.getFileDiffs(input)).resolves.toMatchObject({ ok: true, outcomes: [{ status: "ready" }] });
    expect(getFileDiffs).toHaveBeenCalledTimes(2);
  });

  it("aborts the active generation when the workspace is invalidated", async () => {
    const { coordinator, getFileDiffs } = setup();
    const loaded = await coordinator.getSnapshot({ workspaceId: "workspace-1", selection: { kind: "unstaged" } });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    let providerSignal: AbortSignal | undefined;
    getFileDiffs.mockImplementationOnce((input) => new Promise((resolve) => {
      providerSignal = input.signal;
      input.signal.addEventListener("abort", () => resolve({ ok: false, code: "cancelled", message: "cancelled" }), { once: true });
    }));
    const pending = coordinator.getFileDiffs({ workspaceId: "workspace-1", snapshotId: loaded.snapshot.id, expectedGeneration: 1, requests: [{ fileId: "file-1" }] });
    await Promise.resolve();

    coordinator.invalidate("workspace-1", "refresh");

    expect(providerSignal?.aborted).toBe(true);
    await expect(pending).resolves.toMatchObject({ ok: true, outcomes: [{ status: "failed", code: "cancelled" }] });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
