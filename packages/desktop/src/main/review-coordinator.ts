import type {
  ReviewApplyMutationInput,
  ReviewChangeNotification,
  ReviewDiffQueryOptions,
  ReviewDiffRequest,
  ReviewFileContentsOutcome,
  ReviewFileDiffOutcome,
  ReviewGetFileContentsInput,
  ReviewGetFileContentsResult,
  ReviewGetFileDiffInput,
  ReviewGetFileDiffsInput,
  ReviewGetFileDiffsResult,
  ReviewGetFileDiffResult,
  ReviewGetSnapshotInput,
  ReviewGetSnapshotResult,
  ReviewMutationResult,
  ReviewSelection,
  ReviewSetFileViewedInput,
  ReviewSetFileViewedResult,
  ReviewSnapshot,
  ReviewWorkspaceInput,
} from "@actspace/shared";
import { reviewSelectionKey, type ReviewViewStateService } from "./review-view-state-service";

export type ResolvedReviewWorkspace = {
  workspaceId: string;
  workspaceRoot: string;
};

export type ReviewWorkspaceResolver = (input: ReviewWorkspaceInput) => Promise<
  | { ok: true; workspace: ResolvedReviewWorkspace }
  | { ok: false; message: string }
>;

export interface ReviewQueryProvider {
  getSnapshot(input: ResolvedReviewWorkspace & { selection: ReviewSelection; generation: number; options: ReviewDiffQueryOptions; signal: AbortSignal }): Promise<ReviewSnapshot>;
  getFileDiffs(input: ResolvedReviewWorkspace & {
    snapshot: ReviewSnapshot;
    requests: ReviewDiffRequest[];
    generation: number;
    signal: AbortSignal;
  }): Promise<ReviewGetFileDiffsResult>;
  getFileContents(input: ResolvedReviewWorkspace & {
    snapshot: ReviewSnapshot;
    fileIds: string[];
    generation: number;
    signal: AbortSignal;
  }): Promise<ReviewGetFileContentsResult>;
  invalidateWorkspace?(workspaceId: string): void;
  dispose?(): void;
}

export interface ReviewMutationProvider {
  applyMutation(input: ResolvedReviewWorkspace & ReviewApplyMutationInput): Promise<ReviewMutationResult>;
}

export type ReviewCoordinatorOptions = {
  resolveWorkspace: ReviewWorkspaceResolver;
  queryProvider: ReviewQueryProvider;
  mutationProvider?: ReviewMutationProvider;
  viewState?: ReviewViewStateService;
  debounceMs?: number;
};

type WorkspaceReviewState = {
  generation: number;
  snapshots: Map<string, Promise<ReviewSnapshot>>;
  snapshotsById: Map<string, ReviewSnapshot>;
  fileDiffs: Map<string, Promise<ReviewFileDiffOutcome>>;
  fileContents: Map<string, Promise<ReviewFileContentsOutcome>>;
  abortController: AbortController;
  debounceTimer?: ReturnType<typeof setTimeout>;
  debounceReason?: ReviewChangeNotification["reason"];
};

export class ReviewCoordinator {
  private readonly states = new Map<string, WorkspaceReviewState>();
  private readonly listeners = new Set<(notification: ReviewChangeNotification) => void>();
  private readonly debounceMs: number;

  constructor(private readonly options: ReviewCoordinatorOptions) {
    this.debounceMs = Math.max(0, options.debounceMs ?? 150);
  }

  async getSnapshot(input: ReviewGetSnapshotInput): Promise<ReviewGetSnapshotResult> {
    const resolved = await this.options.resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false, code: "invalid_workspace", message: resolved.message };
    const state = this.stateFor(resolved.workspace.workspaceId);
    const options = normalizeQueryOptions(input.options);
    const key = `${state.generation}:${reviewSelectionKey(input.selection)}:${options.ignoreWhitespaceChanges ? "ignore-space" : "show-space"}`;
    let pending = state.snapshots.get(key);
    if (!pending) {
      pending = this.loadSnapshot(resolved.workspace, input.selection, options, state.generation, state.abortController.signal);
      state.snapshots.set(key, pending);
    }
    try {
      const snapshot = await pending;
      state.snapshotsById.set(snapshot.id, snapshot);
      return { ok: true, snapshot };
    } catch (error) {
      state.snapshots.delete(key);
      return { ok: false, code: "command_failed", message: errorMessage(error) };
    }
  }

  async refreshSnapshot(input: ReviewGetSnapshotInput): Promise<ReviewGetSnapshotResult> {
    const resolved = await this.options.resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false, code: "invalid_workspace", message: resolved.message };
    this.invalidateResolved(resolved.workspace.workspaceId, "refresh");
    return this.getSnapshot({ ...input, workspaceId: resolved.workspace.workspaceId, workspaceRoot: undefined });
  }

  async getFileDiff(input: ReviewGetFileDiffInput): Promise<ReviewGetFileDiffResult> {
    const result = await this.getFileDiffs({
      ...input,
      requests: [{ fileId: input.fileId, contextLines: input.contextLines }],
    });
    if (result.ok === false) return result;
    const outcome = result.outcomes[0];
    if (!outcome) return { ok: false, code: "file_not_found", message: "Review file diff is unavailable." };
    if (outcome.status === "failed") return { ok: false, code: outcome.code, message: outcome.message };
    return { ok: true, diff: outcome.diff };
  }

  async getFileDiffs(input: ReviewGetFileDiffsInput): Promise<ReviewGetFileDiffsResult> {
    const resolved = await this.options.resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false, code: "invalid_workspace", message: resolved.message };
    const state = this.stateFor(resolved.workspace.workspaceId);
    if (input.expectedGeneration !== state.generation) return staleBatch(state.generation);
    const snapshot = state.snapshotsById.get(input.snapshotId);
    if (!snapshot || snapshot.generation !== state.generation) {
      return { ok: false, code: "snapshot_not_found", message: "Review snapshot is no longer available." };
    }
    const knownIds = new Set(snapshot.files.map((file) => file.id));
    const requests = dedupeDiffRequests(input.requests).slice(0, 256);
    if (requests.some((request) => !knownIds.has(request.fileId))) {
      return { ok: false, code: "file_not_found", message: "A Review file is not part of the snapshot." };
    }
    if (requests.length === 0) return { ok: true, outcomes: [] };

    const missing = requests.filter((request) => !state.fileDiffs.has(diffCacheKey(snapshot.id, state.generation, request)));
    if (missing.length > 0) {
      const batch = this.options.queryProvider.getFileDiffs({
        ...resolved.workspace,
        snapshot,
        requests: missing,
        generation: state.generation,
        signal: state.abortController.signal,
      });
      for (const request of missing) {
        const key = diffCacheKey(snapshot.id, state.generation, request);
        const pending = batch.then((result): ReviewFileDiffOutcome => {
          if (result.ok === false) return { fileId: request.fileId, status: "failed", code: result.code, message: result.message };
          return result.outcomes.find((outcome) => outcome.fileId === request.fileId)
            ?? { fileId: request.fileId, status: "failed", code: "file_not_found", message: "Review provider omitted the requested file." };
        });
        state.fileDiffs.set(key, pending);
        void pending.then((outcome) => {
          if (outcome.status === "failed" && state.fileDiffs.get(key) === pending) state.fileDiffs.delete(key);
        }, () => {
          if (state.fileDiffs.get(key) === pending) state.fileDiffs.delete(key);
        });
      }
    }

    const outcomes = await Promise.all(requests.map((request) => state.fileDiffs.get(diffCacheKey(snapshot.id, state.generation, request))!));
    return { ok: true, outcomes };
  }

  async getFileContents(input: ReviewGetFileContentsInput): Promise<ReviewGetFileContentsResult> {
    const resolved = await this.options.resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false, code: "invalid_workspace", message: resolved.message };
    const state = this.stateFor(resolved.workspace.workspaceId);
    if (input.expectedGeneration !== state.generation) return staleContents(state.generation);
    const snapshot = state.snapshotsById.get(input.snapshotId);
    if (!snapshot || snapshot.generation !== state.generation) {
      return { ok: false, code: "snapshot_not_found", message: "Review snapshot is no longer available." };
    }
    const knownIds = new Set(snapshot.files.map((file) => file.id));
    const fileIds = [...new Set(input.fileIds)].slice(0, 8);
    if (fileIds.some((fileId) => !knownIds.has(fileId))) {
      return { ok: false, code: "file_not_found", message: "A Review file is not part of the snapshot." };
    }
    if (fileIds.length === 0) return { ok: true, outcomes: [] };

    const missing = fileIds.filter((fileId) => !state.fileContents.has(contentCacheKey(snapshot.id, state.generation, fileId)));
    if (missing.length > 0) {
      const batch = this.options.queryProvider.getFileContents({
        ...resolved.workspace,
        snapshot,
        fileIds: missing,
        generation: state.generation,
        signal: state.abortController.signal,
      });
      for (const fileId of missing) {
        const key = contentCacheKey(snapshot.id, state.generation, fileId);
        const pending = batch.then((result): ReviewFileContentsOutcome => {
          if (result.ok === false) return { fileId, status: "failed", code: result.code, message: result.message };
          return result.outcomes.find((outcome) => outcome.fileId === fileId)
            ?? { fileId, status: "failed", code: "file_not_found", message: "Review provider omitted the requested file content." };
        });
        state.fileContents.set(key, pending);
        void pending.then((outcome) => {
          if (outcome.status === "failed" && state.fileContents.get(key) === pending) state.fileContents.delete(key);
        }, () => {
          if (state.fileContents.get(key) === pending) state.fileContents.delete(key);
        });
      }
    }
    const outcomes = await Promise.all(fileIds.map((fileId) => state.fileContents.get(contentCacheKey(snapshot.id, state.generation, fileId))!));
    return { ok: true, outcomes };
  }

  async applyMutation(input: ReviewApplyMutationInput): Promise<ReviewMutationResult> {
    const resolved = await this.options.resolveWorkspace(input);
    if (resolved.ok === false) return failedMutation(0, resolved.message);
    const state = this.stateFor(resolved.workspace.workspaceId);
    if (input.mutation.expectedGeneration !== state.generation) {
      return {
        status: "stale",
        generation: state.generation,
        completedSteps: [],
        failedSteps: [],
        message: "Review snapshot changed. Refresh before applying this action.",
      };
    }
    if (!this.options.mutationProvider) return failedMutation(state.generation, "Review mutations are unavailable.");
    const result = await this.options.mutationProvider.applyMutation({ ...resolved.workspace, ...input });
    if (result.status === "success" || result.status === "partialSuccess") {
      return { ...result, generation: this.invalidateResolved(resolved.workspace.workspaceId, "mutation") };
    }
    return { ...result, generation: state.generation };
  }

  async setFileViewed(input: ReviewSetFileViewedInput): Promise<ReviewSetFileViewedResult> {
    if (!this.options.viewState) return { ok: false, code: "command_failed", message: "Viewed state is unavailable." };
    const resolved = await this.options.resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false, code: "invalid_workspace", message: resolved.message };
    const state = this.stateFor(resolved.workspace.workspaceId);
    if (input.expectedGeneration !== state.generation) return stale(state.generation);
    const snapshot = state.snapshotsById.get(input.snapshotId);
    const file = snapshot?.files.find((candidate) => candidate.id === input.fileId);
    if (!snapshot || !file) return { ok: false, code: "file_not_found", message: "Review file is no longer available." };
    await this.options.viewState.setViewed({
      workspaceId: resolved.workspace.workspaceId,
      selection: snapshot.selection,
      path: file.path,
      fileFingerprint: file.fingerprint,
    }, input.viewed);
    file.viewed = input.viewed;
    return { ok: true, viewed: input.viewed };
  }

  async getLoadedSnapshot(input: ReviewWorkspaceInput & { snapshotId: string; expectedGeneration: number }): Promise<
    | { ok: true; workspace: ResolvedReviewWorkspace; snapshot: ReviewSnapshot }
    | { ok: false; code: "invalid_workspace" | "stale_generation" | "snapshot_not_found"; message: string; currentGeneration?: number }
  > {
    const resolved = await this.options.resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false, code: "invalid_workspace", message: resolved.message };
    const state = this.stateFor(resolved.workspace.workspaceId);
    if (input.expectedGeneration !== state.generation) return { ok: false, code: "stale_generation", message: "Review snapshot changed.", currentGeneration: state.generation };
    const snapshot = state.snapshotsById.get(input.snapshotId);
    if (!snapshot) return { ok: false, code: "snapshot_not_found", message: "Review snapshot is no longer available." };
    return { ok: true, workspace: resolved.workspace, snapshot };
  }

  invalidate(workspaceId: string, reason: ReviewChangeNotification["reason"]): number {
    return this.invalidateResolved(workspaceId, reason);
  }

  scheduleInvalidation(workspaceId: string, reason: ReviewChangeNotification["reason"] = "watch"): void {
    const state = this.stateFor(workspaceId);
    state.debounceReason = reason;
    if (state.debounceTimer) return;
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = undefined;
      const nextReason = state.debounceReason ?? reason;
      state.debounceReason = undefined;
      this.invalidateResolved(workspaceId, nextReason);
    }, this.debounceMs);
  }

  subscribe(listener: (notification: ReviewChangeNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    for (const state of this.states.values()) {
      if (state.debounceTimer) clearTimeout(state.debounceTimer);
      state.abortController.abort();
    }
    this.states.clear();
    this.listeners.clear();
    this.options.queryProvider.dispose?.();
  }

  private async loadSnapshot(
    workspace: ResolvedReviewWorkspace,
    selection: ReviewSelection,
    options: ReviewDiffQueryOptions,
    generation: number,
    signal: AbortSignal,
  ): Promise<ReviewSnapshot> {
    const provided = await this.options.queryProvider.getSnapshot({ ...workspace, selection, options, generation, signal });
    const snapshot: ReviewSnapshot = {
      ...provided,
      generation,
      workspaceId: workspace.workspaceId,
      workspaceRoot: workspace.workspaceRoot,
      selection: { ...selection },
      files: provided.files.map((file) => ({ ...file, viewed: false })),
    };
    if (this.options.viewState) {
      await Promise.all(snapshot.files.map(async (file) => {
        file.viewed = await this.options.viewState?.isViewed({
          workspaceId: workspace.workspaceId,
          selection,
          path: file.path,
          fileFingerprint: file.fingerprint,
        }) ?? false;
      }));
    }
    return snapshot;
  }

  private stateFor(workspaceId: string): WorkspaceReviewState {
    let state = this.states.get(workspaceId);
    if (!state) {
      state = { generation: 1, snapshots: new Map(), snapshotsById: new Map(), fileDiffs: new Map(), fileContents: new Map(), abortController: new AbortController() };
      this.states.set(workspaceId, state);
    }
    return state;
  }

  private invalidateResolved(workspaceId: string, reason: ReviewChangeNotification["reason"]): number {
    const state = this.stateFor(workspaceId);
    state.abortController.abort();
    state.abortController = new AbortController();
    state.generation += 1;
    state.snapshots.clear();
    state.snapshotsById.clear();
    state.fileDiffs.clear();
    state.fileContents.clear();
    this.options.queryProvider.invalidateWorkspace?.(workspaceId);
    const notification = { workspaceId, generation: state.generation, reason } satisfies ReviewChangeNotification;
    for (const listener of this.listeners) listener(notification);
    return state.generation;
  }
}

function stale(currentGeneration: number): ReviewGetFileDiffResult & ReviewSetFileViewedResult {
  return {
    ok: false,
    code: "stale_generation",
    message: "Review snapshot changed. Refresh before continuing.",
    currentGeneration,
  };
}

function staleBatch(currentGeneration: number): ReviewGetFileDiffsResult {
  return {
    ok: false,
    code: "stale_generation",
    message: "Review snapshot changed. Refresh before continuing.",
    currentGeneration,
  };
}

function staleContents(currentGeneration: number): ReviewGetFileContentsResult {
  return {
    ok: false,
    code: "stale_generation",
    message: "Review snapshot changed. Refresh before continuing.",
    currentGeneration,
  };
}

function normalizeQueryOptions(options?: Partial<ReviewDiffQueryOptions>): ReviewDiffQueryOptions {
  return { ignoreWhitespaceChanges: options?.ignoreWhitespaceChanges === true };
}

function dedupeDiffRequests(requests: ReviewDiffRequest[]): ReviewDiffRequest[] {
  const deduped = new Map<string, ReviewDiffRequest>();
  for (const request of requests) {
    const contextLines = Math.max(0, Math.min(200, Math.floor(request.contextLines ?? 3)));
    deduped.set(`${request.fileId}:${contextLines}`, { fileId: request.fileId, contextLines });
  }
  return [...deduped.values()];
}

function diffCacheKey(snapshotId: string, generation: number, request: ReviewDiffRequest): string {
  return `${snapshotId}:${generation}:${request.fileId}:${request.contextLines ?? 3}`;
}

function contentCacheKey(snapshotId: string, generation: number, fileId: string): string {
  return `${snapshotId}:${generation}:${fileId}`;
}

function failedMutation(generation: number, message: string): ReviewMutationResult {
  return { status: "failed", generation, completedSteps: [], failedSteps: [], message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
