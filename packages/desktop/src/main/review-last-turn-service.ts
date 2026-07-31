import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createSessionDiffSummary, REVIEW_LOAD_LIMITS, type ReviewCapabilities, type ReviewFileDiff, type ReviewFileSummary, type ReviewGetFileDiffResult, type ReviewSnapshot, type SessionEvent } from "@actspace/shared";
import { createSessionStorePaths, readSessionRecord } from "@actspace/agent-core";
import type { ResolvedReviewWorkspace } from "./review-coordinator";
import { parseReviewPatchHunks } from "./review-git-engine";
import { reviewSelectionKey } from "./review-view-state-service";

export class ReviewLastTurnService {
  private readonly diffs = new Map<string, Map<string, ReviewFileDiff>>();

  constructor(private readonly sessionRoot: string) {}

  async getSnapshot(input: ResolvedReviewWorkspace & {
    selection: { kind: "lastTurn"; sessionId: string; turnId?: string };
    generation: number;
  }): Promise<ReviewSnapshot> {
    if (!isSafeSegment(input.selection.sessionId)) {
      return unavailable(input, "Last Turn session id is invalid.");
    }
    const record = await readSessionRecord(createSessionStorePaths(resolve(this.sessionRoot, input.selection.sessionId)));
    if (!record) return unavailable(input, "Last Turn session is unavailable.");
    const turnId = input.selection.turnId ?? latestTurnId(record.events);
    if (!turnId) return unavailable(input, "This session has no completed turn to review.");
    const events = record.events.filter((event) => event.turnId === turnId);
    const summary = createSessionDiffSummary(input.selection.sessionId, events);
    const warnings: NonNullable<ReviewSnapshot["warnings"]> = [];
    const diffMap = new Map<string, ReviewFileDiff>();
    const files: ReviewFileSummary[] = [];

    for (const item of summary.files) {
      const normalizedPath = normalizeWorkspacePath(input.workspaceRoot, item.filePath);
      if (!normalizedPath) {
        warnings.push({ kind: "ignored_path", filePath: item.filePath, message: "A Last Turn preview outside the workspace was ignored." });
        continue;
      }
      const fingerprint = hash(reviewSelectionKey(input.selection), turnId, normalizedPath, item.diff);
      const fileId = hash(normalizedPath);
      const hunks = parseReviewPatchHunks(item.diff, fingerprint);
      const status = inferStatus(item.diff, item.additions, item.deletions);
      const file: ReviewFileSummary = {
        id: fileId,
        path: normalizedPath,
        status,
        additions: item.additions,
        deletions: item.deletions,
        binary: false,
        renderKind: "text",
        source: "turn",
        diffLoadStatus: "ready",
        viewed: false,
        fingerprint,
      };
      files.push(file);
      diffMap.set(fileId, {
        snapshotId: "",
        generation: input.generation,
        fileId,
        path: normalizedPath,
        hunks,
        oldContentAvailable: status !== "added",
        newContentAvailable: status !== "deleted",
        partial: false,
        patchFingerprint: fingerprint,
      });
    }

    files.sort((left, right) => left.path.localeCompare(right.path));
    const additions = files.reduce((total, file) => total + file.additions, 0);
    const deletions = files.reduce((total, file) => total + file.deletions, 0);
    const estimatedChangedBytes = summary.files.reduce((total, file) => total + Buffer.byteLength(file.diff, "utf8"), 0);
    const loadPolicy = files.length > REVIEW_LOAD_LIMITS.fileCount
      ? { mode: "single-file" as const, reason: "file-count" as const }
      : additions + deletions > REVIEW_LOAD_LIMITS.changedLines
        ? { mode: "single-file" as const, reason: "changed-lines" as const }
        : estimatedChangedBytes > REVIEW_LOAD_LIMITS.changedBytes
          ? { mode: "single-file" as const, reason: "changed-bytes" as const }
          : { mode: "all-files" as const };
    if (loadPolicy.mode === "single-file") warnings.push({ kind: "capped", message: "This diff is large, showing one file at a time." });
    const snapshotId = hash(input.workspaceId, reviewSelectionKey(input.selection), turnId, String(input.generation));
    for (const diff of diffMap.values()) diff.snapshotId = snapshotId;
    this.diffs.set(snapshotId, diffMap);

    return {
      id: snapshotId,
      generation: input.generation,
      workspaceId: input.workspaceId,
      workspaceRoot: input.workspaceRoot,
      selection: { kind: "lastTurn", sessionId: input.selection.sessionId, turnId },
      baseline: { kind: "session-preview", label: `Before turn ${turnId}` },
      target: { label: `After turn ${turnId}` },
      status: files.length === 0 ? (warnings.length ? "partial" : "empty") : (warnings.length ? "partial" : "ready"),
      files,
      totals: { files: files.length, additions, deletions, changedLines: additions + deletions, estimatedChangedBytes },
      capabilities: lastTurnCapabilities(),
      loadPolicy,
      queryOptions: { ignoreWhitespaceChanges: false },
      generatedAt: new Date().toISOString(),
      ...(warnings.length ? { warnings } : {}),
    };
  }

  async getFileDiff(input: { snapshot: ReviewSnapshot; fileId: string }): Promise<ReviewGetFileDiffResult> {
    const diff = this.diffs.get(input.snapshot.id)?.get(input.fileId);
    return diff
      ? { ok: true, diff }
      : { ok: false, code: "file_not_found", message: "Last Turn file preview is unavailable." };
  }
}

function latestTurnId(events: SessionEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].turnId) return events[index].turnId;
  }
  return undefined;
}

function normalizeWorkspacePath(workspaceRoot: string, filePath: string): string | undefined {
  const absolutePath = resolve(workspaceRoot, filePath);
  const relativePath = relative(resolve(workspaceRoot), isAbsolute(filePath) ? resolve(filePath) : absolutePath);
  if (!relativePath || relativePath === "." || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return undefined;
  }
  return relativePath.split(sep).join("/");
}

function inferStatus(diff: string, additions: number, deletions: number): ReviewFileSummary["status"] {
  if (/^--- \/dev\/null$/m.test(diff)) return "added";
  if (/^\+\+\+ \/dev\/null$/m.test(diff)) return "deleted";
  if (deletions === 0 && additions > 0) return "added";
  if (additions === 0 && deletions > 0) return "deleted";
  return "modified";
}

function lastTurnCapabilities(): ReviewCapabilities {
  const disabledReasons = {
    stageFile: "Last Turn is a historical session preview.",
    stageHunk: "Last Turn is a historical session preview.",
    unstageFile: "Last Turn is a historical session preview.",
    unstageHunk: "Last Turn is a historical session preview.",
    revertFile: "Last Turn cannot safely restore repository state.",
    revertHunk: "Last Turn cannot safely restore repository state.",
  } as ReviewCapabilities["disabledReasons"];
  return {
    canStageFile: false,
    canStageHunk: false,
    canUnstageFile: false,
    canUnstageHunk: false,
    canRevertFile: false,
    canRevertHunk: false,
    canLoadFullFile: true,
    canOpenFile: true,
    canCommit: false,
    canPush: false,
    canCreatePullRequest: false,
    disabledReasons,
  };
}

function unavailable(input: ResolvedReviewWorkspace & { selection: { kind: "lastTurn"; sessionId: string; turnId?: string }; generation: number }, message: string): ReviewSnapshot {
  return {
    id: hash(input.workspaceId, reviewSelectionKey(input.selection), String(input.generation)),
    generation: input.generation,
    workspaceId: input.workspaceId,
    workspaceRoot: input.workspaceRoot,
    selection: { ...input.selection },
    status: "notAvailable",
    files: [],
    totals: { files: 0, additions: 0, deletions: 0, changedLines: 0, estimatedChangedBytes: 0 },
    capabilities: lastTurnCapabilities(),
    loadPolicy: { mode: "all-files" },
    queryOptions: { ignoreWhitespaceChanges: false },
    generatedAt: new Date().toISOString(),
    warnings: [{ kind: "provider_failed", message }],
  };
}

function isSafeSegment(value: string): boolean {
  return value.length > 0 && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\");
}

function hash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 24);
}
