import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewGetWorkspaceChangesResult } from "@actspace/shared";
import { ReviewRenderView } from "../components/right-panel/ReviewRenderView";

const originalActspace = (window as { actspace?: unknown }).actspace;

afterEach(() => {
  (window as { actspace?: unknown }).actspace = originalActspace;
});

function emptyReview(): ReviewGetWorkspaceChangesResult {
  return {
    provider: "git",
    status: "empty",
    changeSet: {
      id: "review-empty",
      source: "git",
      scope: "uncommitted",
      workspaceRoot: "/tmp/workspace",
      baseline: { kind: "git-ref", label: "HEAD" },
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      generatedAt: new Date().toISOString(),
    },
  };
}

describe("ReviewRenderView", () => {
  it("reloads workspace review when refreshKey changes", async () => {
    const getWorkspaceReview = vi.fn(async () => emptyReview());
    (window as unknown as { actspace: Partial<NonNullable<typeof window.actspace>> }).actspace = {
      getWorkspaceReview,
    };

    const { rerender } = render(<ReviewRenderView workspaceRoot="/tmp/workspace" refreshKey={1} />);

    expect(await screen.findByText("No Changes")).toBeInTheDocument();
    await waitFor(() => {
      expect(getWorkspaceReview).toHaveBeenCalledTimes(1);
    });

    rerender(<ReviewRenderView workspaceRoot="/tmp/workspace" refreshKey={2} />);

    await waitFor(() => {
      expect(getWorkspaceReview).toHaveBeenCalledTimes(2);
    });
    expect(getWorkspaceReview).toHaveBeenLastCalledWith({
      workspaceRoot: "/tmp/workspace",
      scope: "uncommitted",
    });
  });
});
