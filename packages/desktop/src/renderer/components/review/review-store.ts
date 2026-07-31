import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ReviewFileContents,
  ReviewFileDiff,
  ReviewMutation,
  ReviewMutationResult,
  ReviewSelection,
  ReviewSnapshot,
} from "@actspace/shared";

export type ReviewDiffMode = "unified" | "split";
export type ReviewFileRequestState = { status: "idle" | "loading" | "ready" | "partial" | "failed"; error?: string };

export type ReviewWorkspaceState = {
  selection: ReviewSelection;
  snapshot: ReviewSnapshot | null;
  diffs: Map<string, ReviewFileDiff>;
  fileRequests: Map<string, ReviewFileRequestState>;
  fileContents: Map<string, ReviewFileContents>;
  loading: boolean;
  error: string | null;
  selectedFileId: string | null;
  expandedFileIds: Set<string>;
  fileFilter: string;
  filesVisible: boolean;
  diffMode: ReviewDiffMode;
  wrap: boolean;
  ignoreWhitespaceChanges: boolean;
  wordDiff: boolean;
  loadFullFiles: boolean;
  richPreview: boolean;
  contextLinesByFile: Map<string, number>;
  feedback: string | null;
};

const PREFS_KEY = "actspace.review.display.v2";

export function useReviewWorkspaceStore(input: {
  workspaceRoot?: string;
  sessionId?: string | null;
  initialSelection?: ReviewSelection;
}) {
  const [state, setState] = useState<ReviewWorkspaceState>(() => ({
    selection: input.initialSelection ?? { kind: "uncommitted" },
    snapshot: null,
    diffs: new Map(),
    fileRequests: new Map(),
    fileContents: new Map(),
    loading: true,
    error: null,
    selectedFileId: null,
    expandedFileIds: new Set(),
    fileFilter: "",
    filesVisible: false,
    ...loadDisplayPreferences(),
    contextLinesByFile: new Map(),
    feedback: null,
  }));
  const snapshotRequestId = useRef(0);
  const inFlightDiffs = useRef(new Set<string>());
  const inFlightContents = useRef(new Set<string>());
  const staleRefreshGeneration = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadSnapshot = useCallback(async (
    selection: ReviewSelection,
    refresh = false,
    ignoreWhitespaceChanges = stateRef.current.ignoreWhitespaceChanges,
  ) => {
    if (!input.workspaceRoot && !input.sessionId) {
      setState((current) => ({ ...current, selection, loading: false, error: null, snapshot: null, diffs: new Map(), fileRequests: new Map(), fileContents: new Map() }));
      return;
    }
    const api = refresh ? window.actspace?.refreshReviewSnapshot : window.actspace?.getReviewSnapshot;
    const currentRequest = ++snapshotRequestId.current;
    inFlightDiffs.current.clear();
    inFlightContents.current.clear();
    if (!api) {
      setState((current) => ({ ...current, loading: false, error: "Review bridge is not available." }));
      return;
    }
    setState((current) => ({ ...current, selection, loading: true, error: null, feedback: null }));
    try {
      const result = await api({
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId ?? undefined,
        selection,
        options: { ignoreWhitespaceChanges },
      });
      if (snapshotRequestId.current !== currentRequest) return;
      if (result.ok === false) {
        setState((current) => ({ ...current, loading: false, error: result.message, snapshot: null, diffs: new Map(), fileRequests: new Map(), fileContents: new Map() }));
        return;
      }
      staleRefreshGeneration.current = null;
      const selectedFileId = result.snapshot.files[0]?.id ?? null;
      const displayedIds = result.snapshot.loadPolicy.mode === "all-files"
        ? result.snapshot.files.map((file) => file.id)
        : selectedFileId ? [selectedFileId] : [];
      setState((current) => ({
        ...current,
        selection: result.snapshot.selection,
        snapshot: result.snapshot,
        diffs: new Map(),
        fileRequests: new Map(),
        fileContents: new Map(),
        loading: false,
        error: null,
        selectedFileId,
        expandedFileIds: new Set(displayedIds),
      }));
    } catch (error) {
      if (snapshotRequestId.current !== currentRequest) return;
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Failed to load Review." }));
    }
  }, [input.sessionId, input.workspaceRoot]);

  const loadDiffs = useCallback(async (fileIds: string[], contextOverride?: number) => {
    const snapshot = stateRef.current.snapshot;
    const api = window.actspace?.getReviewFileDiffs;
    if (!snapshot || !api) return;
    const requestIds = [...new Set(fileIds)].filter((fileId) => {
      const file = snapshot.files.find((candidate) => candidate.id === fileId);
      return file?.renderKind === "text" && !inFlightDiffs.current.has(fileId);
    });
    if (requestIds.length === 0) return;
    for (const fileId of requestIds) inFlightDiffs.current.add(fileId);
    setState((current) => {
      if (current.snapshot?.id !== snapshot.id) return current;
      const fileRequests = new Map(current.fileRequests);
      for (const fileId of requestIds) fileRequests.set(fileId, { status: "loading" });
      return { ...current, fileRequests };
    });
    try {
      const result = await api({
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId ?? undefined,
        snapshotId: snapshot.id,
        expectedGeneration: snapshot.generation,
        requests: requestIds.map((fileId) => ({
          fileId,
          contextLines: contextOverride ?? stateRef.current.contextLinesByFile.get(fileId) ?? 3,
        })),
      });
      if (result.ok === false) {
        if (result.code === "stale_generation" && staleRefreshGeneration.current !== snapshot.generation) {
          staleRefreshGeneration.current = snapshot.generation;
          void loadSnapshot(stateRef.current.selection, true);
          return;
        }
        setState((current) => {
          if (current.snapshot?.id !== snapshot.id) return current;
          const fileRequests = new Map(current.fileRequests);
          for (const fileId of requestIds) fileRequests.set(fileId, { status: "failed", error: result.message });
          return { ...current, fileRequests, feedback: result.message };
        });
        return;
      }
      setState((current) => {
        if (current.snapshot?.id !== snapshot.id) return current;
        const diffs = new Map(current.diffs);
        const fileRequests = new Map(current.fileRequests);
        for (const outcome of result.outcomes) {
          if (outcome.status === "failed") fileRequests.set(outcome.fileId, { status: "failed", error: outcome.message });
          else {
            diffs.set(outcome.fileId, outcome.diff);
            fileRequests.set(outcome.fileId, { status: outcome.status });
          }
        }
        return { ...current, diffs, fileRequests };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load Review diff.";
      setState((current) => {
        if (current.snapshot?.id !== snapshot.id) return current;
        const fileRequests = new Map(current.fileRequests);
        for (const fileId of requestIds) fileRequests.set(fileId, { status: "failed", error: message });
        return { ...current, fileRequests, feedback: message };
      });
    } finally {
      for (const fileId of requestIds) inFlightDiffs.current.delete(fileId);
    }
  }, [input.sessionId, input.workspaceRoot, loadSnapshot]);

  const loadFileContents = useCallback(async (fileIds: string[]) => {
    const snapshot = stateRef.current.snapshot;
    const api = window.actspace?.getReviewFileContents;
    if (!snapshot || !api || !stateRef.current.loadFullFiles) return;
    const requested = [...new Set(fileIds)].filter((fileId) => {
      const file = snapshot.files.find((candidate) => candidate.id === fileId);
      return file?.renderKind === "text" && !stateRef.current.fileContents.has(fileId) && !inFlightContents.current.has(fileId);
    }).slice(0, 4);
    if (requested.length === 0) return;
    for (const fileId of requested) inFlightContents.current.add(fileId);
    try {
      const result = await api({
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId ?? undefined,
        snapshotId: snapshot.id,
        expectedGeneration: snapshot.generation,
        fileIds: requested,
      });
      if (!result.ok) return;
      setState((current) => {
        if (current.snapshot?.id !== snapshot.id) return current;
        const fileContents = new Map(current.fileContents);
        for (const outcome of result.outcomes) {
          if (outcome.status !== "failed") fileContents.set(outcome.fileId, outcome.contents);
        }
        return { ...current, fileContents };
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        feedback: error instanceof Error ? error.message : "Failed to load full file contents.",
      }));
    } finally {
      for (const fileId of requested) inFlightContents.current.delete(fileId);
    }
  }, [input.sessionId, input.workspaceRoot]);

  useEffect(() => {
    void loadSnapshot(stateRef.current.selection);
  }, [input.workspaceRoot, input.sessionId, loadSnapshot]);

  useEffect(() => {
    const subscribe = window.actspace?.onReviewChanged;
    if (!subscribe) return;
    return subscribe((notification) => {
      if (notification.workspaceId !== stateRef.current.snapshot?.workspaceId) return;
      setState((current) => ({ ...current, feedback: "Changes updated. Refreshing Review…", diffs: new Map(), fileRequests: new Map(), fileContents: new Map() }));
      void loadSnapshot(stateRef.current.selection);
    });
  }, [loadSnapshot]);

  useEffect(() => {
    const snapshot = state.snapshot;
    if (!snapshot) return;
    const requestIds = snapshot.loadPolicy.mode === "single-file"
      ? state.selectedFileId ? [state.selectedFileId] : []
      : snapshot.files.map((file) => file.id);
    void loadDiffs(requestIds);
  }, [loadDiffs, state.selectedFileId, state.snapshot?.id]);

  const setSelection = useCallback((selection: ReviewSelection) => void loadSnapshot(selection), [loadSnapshot]);
  const refresh = useCallback(() => void loadSnapshot(stateRef.current.selection, true), [loadSnapshot]);

  const selectFile = useCallback((fileId: string) => {
    setState((current) => {
      const single = current.snapshot?.loadPolicy.mode === "single-file";
      const expandedFileIds = single ? new Set([fileId]) : new Set(current.expandedFileIds).add(fileId);
      return { ...current, selectedFileId: fileId, expandedFileIds };
    });
  }, []);

  const toggleFile = useCallback((fileId: string) => {
    setState((current) => {
      const expandedFileIds = new Set(current.expandedFileIds);
      if (expandedFileIds.has(fileId)) expandedFileIds.delete(fileId);
      else expandedFileIds.add(fileId);
      return { ...current, selectedFileId: fileId, expandedFileIds };
    });
  }, []);

  const setAllExpanded = useCallback((expanded: boolean) => {
    setState((current) => {
      const ids = current.snapshot?.loadPolicy.mode === "single-file"
        ? current.selectedFileId ? [current.selectedFileId] : []
        : current.snapshot?.files.map((file) => file.id) ?? [];
      return { ...current, expandedFileIds: expanded ? new Set(ids) : new Set() };
    });
  }, []);

  const retryDiff = useCallback((fileId: string) => {
    setState((current) => {
      const fileRequests = new Map(current.fileRequests);
      fileRequests.set(fileId, { status: "idle" });
      return { ...current, fileRequests };
    });
    void loadDiffs([fileId]);
  }, [loadDiffs]);

  const expandContext = useCallback((fileId: string) => {
    const next = Math.min(200, (stateRef.current.contextLinesByFile.get(fileId) ?? 3) + 20);
    setState((current) => {
      const contextLinesByFile = new Map(current.contextLinesByFile);
      contextLinesByFile.set(fileId, next);
      const diffs = new Map(current.diffs);
      diffs.delete(fileId);
      return { ...current, contextLinesByFile, diffs };
    });
    void loadDiffs([fileId], next);
  }, [loadDiffs]);

  const toggleWhitespace = useCallback(() => {
    const next = !stateRef.current.ignoreWhitespaceChanges;
    setState((current) => ({ ...current, ignoreWhitespaceChanges: next }));
    saveDisplayPreference({ ignoreWhitespaceChanges: next });
    void loadSnapshot(stateRef.current.selection, true, next);
  }, [loadSnapshot]);

  const setViewed = useCallback(async (fileId: string, viewed: boolean) => {
    const snapshot = stateRef.current.snapshot;
    if (!snapshot || !window.actspace?.setReviewFileViewed) return;
    setState((current) => ({ ...current, snapshot: current.snapshot ? { ...current.snapshot, files: current.snapshot.files.map((file) => file.id === fileId ? { ...file, viewed } : file) } : null }));
    const result = await window.actspace.setReviewFileViewed({ workspaceRoot: input.workspaceRoot, sessionId: input.sessionId ?? undefined, snapshotId: snapshot.id, expectedGeneration: snapshot.generation, fileId, viewed });
    if (result.ok === false) setState((current) => ({ ...current, feedback: result.message }));
  }, [input.sessionId, input.workspaceRoot]);

  const applyMutation = useCallback(async (mutation: Omit<ReviewMutation, "snapshotId" | "expectedGeneration">): Promise<ReviewMutationResult | null> => {
    const snapshot = stateRef.current.snapshot;
    if (!snapshot || !window.actspace?.applyReviewMutation) return null;
    const result = await window.actspace.applyReviewMutation({ workspaceRoot: input.workspaceRoot, sessionId: input.sessionId ?? undefined, mutation: { ...mutation, snapshotId: snapshot.id, expectedGeneration: snapshot.generation } });
    setState((current) => ({ ...current, feedback: mutationFeedback(result) }));
    if (result.status === "success" || result.status === "partialSuccess" || result.status === "stale") void loadSnapshot(stateRef.current.selection);
    return result;
  }, [input.sessionId, input.workspaceRoot, loadSnapshot]);

  const patchState = useCallback((patch: Partial<ReviewWorkspaceState>) => {
    setState((current) => ({ ...current, ...patch }));
    const preferencePatch = displayPreferencePatch(patch);
    if (Object.keys(preferencePatch).length > 0) saveDisplayPreference(preferencePatch);
  }, []);

  return { state, setSelection, refresh, selectFile, toggleFile, setAllExpanded, retryDiff, expandContext, loadFileContents, toggleWhitespace, setViewed, applyMutation, patchState };
}

function loadDisplayPreferences(): Pick<ReviewWorkspaceState, "diffMode" | "wrap" | "ignoreWhitespaceChanges" | "wordDiff" | "loadFullFiles" | "richPreview"> {
  const defaults = { diffMode: "unified" as const, wrap: false, ignoreWhitespaceChanges: false, wordDiff: false, loadFullFiles: true, richPreview: false };
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Pick<ReviewWorkspaceState, "diffMode" | "wrap" | "ignoreWhitespaceChanges" | "wordDiff" | "loadFullFiles" | "richPreview">>;
    return { ...defaults, ...stored, diffMode: stored.diffMode === "split" ? "split" : "unified" };
  } catch {
    return defaults;
  }
}

function saveDisplayPreference(patch: Record<string, unknown>): void {
  try {
    const current = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Preferences remain in memory when storage is unavailable.
  }
}

function displayPreferencePatch(patch: Partial<ReviewWorkspaceState>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ["diffMode", "wrap", "ignoreWhitespaceChanges", "wordDiff", "loadFullFiles", "richPreview"] as const) {
    if (key in patch) result[key] = patch[key];
  }
  return result;
}

function mutationFeedback(result: ReviewMutationResult): string {
  if (result.status === "success") return "Review action completed.";
  if (result.status === "partialSuccess") return "Some Review actions completed; check the remaining failures.";
  if (result.status === "stale") return result.message ?? "Review changed before the action could run.";
  return result.message ?? result.failedSteps[0]?.message ?? "Review action failed.";
}
