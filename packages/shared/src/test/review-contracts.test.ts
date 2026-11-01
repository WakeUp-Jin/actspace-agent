import { describe, expect, it } from "vitest";
import type { ReviewSelection, ReviewSnapshot } from "../review";

const selections = [
  { kind: "uncommitted" },
  { kind: "unstaged" },
  { kind: "staged" },
  { kind: "commit", sha: "abc123" },
  { kind: "branch", branch: "main" },
] satisfies ReviewSelection[];

describe("review contracts", () => {
  it("keeps all five selections as a discriminated union", () => {
    expect(selections.map((selection) => selection.kind)).toEqual([
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
        fingerprint: "file-fingerprint",
      }],
      totals: { files: 1, additions: 2, deletions: 1, changedLines: 3, estimatedChangedBytes: 256 },
      capabilities: { canLoadFullFile: true },
      loadPolicy: { mode: "all-files" },
      queryOptions: { ignoreWhitespaceChanges: false },
      generatedAt: "2026-07-30T00:00:00.000Z",
    };

    expect(snapshot.generation).toBe(4);
    expect(snapshot.files[0]?.fingerprint).toBe("file-fingerprint");
  });
});
