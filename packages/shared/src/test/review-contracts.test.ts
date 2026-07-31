import { describe, expect, it } from "vitest";
import type { ReviewMutation, ReviewSelection, ReviewSnapshot } from "../review";

const selections = [
  { kind: "lastTurn", sessionId: "session-1", turnId: "turn-1" },
  { kind: "uncommitted" },
  { kind: "unstaged" },
  { kind: "staged" },
  { kind: "commit", sha: "abc123" },
  { kind: "branch", branch: "main" },
] satisfies ReviewSelection[];

describe("review contracts", () => {
  it("keeps all six selections as a discriminated union", () => {
    expect(selections.map((selection) => selection.kind)).toEqual([
      "lastTurn",
      "uncommitted",
      "unstaged",
      "staged",
      "commit",
      "branch",
    ]);
  });

  it("requires snapshot generation and file identity", () => {
    const snapshot: ReviewSnapshot = {
      id: "snapshot-1",
      generation: 4,
      workspaceId: "workspace-1",
      workspaceRoot: "/workspace",
      repoRoot: "/workspace",
      selection: { kind: "unstaged" },
      status: "ready",
      files: [{
        id: "file-1",
        path: "src/index.ts",
        status: "modified",
        additions: 2,
        deletions: 1,
        binary: false,
        renderKind: "text",
        source: "workingTree",
        diffLoadStatus: "idle",
        viewed: false,
        fingerprint: "file-fingerprint",
      }],
      totals: { files: 1, additions: 2, deletions: 1, changedLines: 3, estimatedChangedBytes: 256 },
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
        disabledReasons: { commit: "No staged changes." },
      },
      loadPolicy: { mode: "all-files" },
      queryOptions: { ignoreWhitespaceChanges: false },
      generatedAt: "2026-07-30T00:00:00.000Z",
    };

    expect(snapshot.generation).toBe(4);
    expect(snapshot.files[0]?.fingerprint).toBe("file-fingerprint");
  });

  it("binds mutations to stable snapshot and patch identities", () => {
    const mutation: ReviewMutation = {
      snapshotId: "snapshot-1",
      expectedGeneration: 4,
      action: "stage",
      scope: "hunk",
      source: "workingTree",
      path: "src/index.ts",
      hunkId: "hunk-1",
      patchFingerprint: "patch-1",
    };
    expect(mutation.expectedGeneration).toBe(4);
    expect(mutation.patchFingerprint).toBe("patch-1");
  });
});
