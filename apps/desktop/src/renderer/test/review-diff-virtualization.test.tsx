import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewCapabilities, ReviewFileDiff, ReviewFileSummary, ReviewLine } from "@actspace/shared";
import { ReviewDiffCanvas } from "../components/review/ReviewDiffCanvas";

describe("Review diff virtualization", () => {
  it("keeps a 9,000-line diff inside the live DOM budget", async () => {
    const file = fileSummary();
    const lines: ReviewLine[] = Array.from({ length: 9_000 }, (_, index) => ({
      id: `line-${index}`,
      kind: index % 2 === 0 ? "deletion" : "addition",
      ...(index % 2 === 0 ? { oldLine: index / 2 + 1 } : { newLine: (index + 1) / 2 }),
      text: `changed line ${index}`,
    }));
    const diff: ReviewFileDiff = {
      snapshotId: "snapshot",
      generation: 1,
      fileId: file.id,
      path: file.path,
      hunks: [{ id: "hunk", header: "@@ -1,4500 +1,4500 @@", oldStart: 1, oldLines: 4_500, newStart: 1, newLines: 4_500, lines, patchFingerprint: "hunk" }],
      oldContentAvailable: true,
      newContentAvailable: true,
      partial: false,
      patchFingerprint: "patch",
    };
    const { container } = render(
      <ReviewDiffCanvas
        files={[file]}
        diffs={new Map([[file.id, diff]])}
        fileRequests={new Map([[file.id, { status: "ready" }]])}
        fileContents={new Map()}
        capabilities={capabilities()}
        expandedFileIds={new Set([file.id])}
        selectedFileId={file.id}
        mode="unified"
        wrap={false}
        wordDiff={false}
        richPreview={false}
        loadFullFiles={false}
        singleFileMode={false}
        onToggleFile={vi.fn()}
        onSelectFile={vi.fn()}
        onExpandContext={vi.fn()}
        onRetryDiff={vi.fn()}
        onVisibleFiles={vi.fn()}
        onViewed={vi.fn()}
        onMutation={vi.fn()}
      />,
    );

    await waitFor(() => expect(Number(container.querySelector("[data-review-total-row-count]")?.getAttribute("data-review-total-row-count"))).toBe(9_002));
    const virtualRowCount = Number(container.querySelector("[data-review-virtual-row-count]")?.getAttribute("data-review-virtual-row-count"));
    expect(virtualRowCount).toBeGreaterThan(0);
    expect(virtualRowCount).toBeLessThan(1_000);
    expect(container.querySelectorAll("[data-review-row]").length).toBe(virtualRowCount);
  });

  it("keeps horizontal scrolling on the canvas instead of individual code lines", async () => {
    const file = fileSummary();
    const diff = singleLineDiff(file, `const integrity = "${"sha512-long-value".repeat(12)}";`);
    const { container } = renderCanvas(file, diff, false);

    const canvas = container.querySelector<HTMLElement>("[data-review-horizontal-scroll='canvas']");
    const content = container.querySelector<HTMLElement>("[data-review-content-width]");
    const code = await waitFor(() => {
      const element = container.querySelector("code");
      expect(element).not.toBeNull();
      return element!;
    });

    expect(canvas).toHaveClass("overflow-auto");
    expect(content?.dataset.reviewContentWidth).toMatch(/^max\(100%, \d+ch\)$/);
    expect(code).toHaveClass("whitespace-pre");
    expect(code).not.toHaveClass("overflow-x-auto");
    expect(container.querySelectorAll("code.overflow-x-auto")).toHaveLength(0);
  });

  it("collapses the canvas width and wraps code when word wrap is enabled", async () => {
    const file = fileSummary();
    const diff = singleLineDiff(file, "a long line that should wrap with the Review viewport");
    const { container } = renderCanvas(file, diff, true);

    const content = container.querySelector<HTMLElement>("[data-review-content-width]");
    const code = await waitFor(() => {
      const element = container.querySelector("code");
      expect(element).not.toBeNull();
      return element!;
    });

    expect(content?.dataset.reviewContentWidth).toBe("100%");
    expect(code).toHaveClass("whitespace-pre-wrap", "break-all");
    expect(code).not.toHaveClass("overflow-x-auto");
  });
});

function renderCanvas(file: ReviewFileSummary, diff: ReviewFileDiff, wrap: boolean) {
  return render(
    <ReviewDiffCanvas
      files={[file]}
      diffs={new Map([[file.id, diff]])}
      fileRequests={new Map([[file.id, { status: "ready" }]])}
      fileContents={new Map()}
      capabilities={capabilities()}
      expandedFileIds={new Set([file.id])}
      selectedFileId={file.id}
      mode="unified"
      wrap={wrap}
      wordDiff={false}
      richPreview={false}
      loadFullFiles={false}
      singleFileMode={false}
      onToggleFile={vi.fn()}
      onSelectFile={vi.fn()}
      onExpandContext={vi.fn()}
      onRetryDiff={vi.fn()}
      onVisibleFiles={vi.fn()}
      onViewed={vi.fn()}
      onMutation={vi.fn()}
    />,
  );
}

function singleLineDiff(file: ReviewFileSummary, text: string): ReviewFileDiff {
  return {
    snapshotId: "snapshot",
    generation: 1,
    fileId: file.id,
    path: file.path,
    hunks: [{
      id: "hunk",
      header: "@@ -1 +1 @@",
      oldStart: 1,
      oldLines: 0,
      newStart: 1,
      newLines: 1,
      lines: [{ id: "line", kind: "addition", newLine: 1, text }],
      patchFingerprint: "hunk",
    }],
    oldContentAvailable: true,
    newContentAvailable: true,
    partial: false,
    patchFingerprint: "patch",
  };
}

function fileSummary(): ReviewFileSummary {
  return {
    id: "large-file",
    path: "src/large.ts",
    status: "modified",
    additions: 4_500,
    deletions: 4_500,
    binary: false,
    renderKind: "text",
    source: "workingTree",
    diffLoadStatus: "ready",
    viewed: false,
    fingerprint: "file",
  };
}

function capabilities(): ReviewCapabilities {
  return {
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
  };
}
