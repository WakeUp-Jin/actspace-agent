import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewGetWorkspaceChangesResult } from "@actspace/shared";
import { ReviewRenderView } from "../components/right-panel/ReviewRenderView";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { WorkbenchLayout } from "../components/WorkbenchLayout";

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

function dirtyReview(): ReviewGetWorkspaceChangesResult {
  return {
    provider: "git",
    status: "changes",
    changeSet: {
      id: "review-dirty",
      source: "git",
      scope: "uncommitted",
      workspaceRoot: "/tmp/workspace",
      baseline: { kind: "git-ref", label: "HEAD" },
      files: [
        {
          path: "packages/desktop/src/renderer/App.tsx",
          status: "modified",
          additions: 117,
          deletions: 7,
          chunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 2,
              unifiedText: "@@ -1 +1,2 @@\n-old\n+new\n+line",
            },
          ],
        },
      ],
      totalAdditions: 117,
      totalDeletions: 7,
      generatedAt: new Date().toISOString(),
    },
  };
}

describe("ReviewRenderView", () => {
  it("renders a lightweight Uncommitted scope menu with colored totals", async () => {
    const user = userEvent.setup();
    (window as unknown as { actspace: Partial<NonNullable<typeof window.actspace>> }).actspace = {
      getWorkspaceReview: vi.fn(async () => dirtyReview()),
    };

    render(<ReviewRenderView workspaceRoot="/tmp/workspace" refreshKey={1} />);

    const scope = await screen.findByRole("button", { name: "Review scope" });
    expect(scope).toHaveTextContent("1 Uncommitted Changes");
    expect(scope.querySelector("svg")).toBeInTheDocument();
    expect(scope).toHaveClass("border-0");
    expect(scope).not.toHaveClass("border-line-strong");

    await user.click(scope);

    const menu = await screen.findByRole("menu", { name: "Review scope options" });
    expect(within(menu).getByRole("menuitem", { name: "Uncommitted 1" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Unstaged 1" })).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).getByRole("menuitem", { name: "Staged" })).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).getByRole("menuitem", { name: "All Branch Changes" })).toHaveAttribute("aria-disabled", "true");

    const totals = await screen.findByLabelText("Review totals +117 -7");
    expect(within(totals).getByText("+117")).toHaveClass("text-success");
    expect(within(totals).getByText("-7")).toHaveClass("text-danger");
  });

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

  it("opens Review from the right panel object menu", async () => {
    const user = userEvent.setup();
    const getWorkspaceReview = vi.fn(async () => emptyReview());
    (window as unknown as { actspace: Partial<NonNullable<typeof window.actspace>> }).actspace = {
      getWorkspaceReview,
    };

    render(
      <RightPanelProvider initialOpen>
        <WorkbenchLayout
          sessions={[
            {
              id: "session-review-menu",
              title: "Review menu",
              updatedAt: new Date().toISOString(),
              agentRunCount: 0,
              workspaceRoot: "/tmp/workspace",
            },
          ]}
          activeSessionId="session-review-menu"
          title="Review menu"
          messages={[]}
          contextSnapshot={null}
          selectedWorkspaceRoot="/tmp/workspace"
        />
      </RightPanelProvider>,
    );

    await user.click(screen.getByRole("button", { name: "New right panel object" }));
    await user.click(screen.getByRole("menuitem", { name: "Review" }));

    expect(await screen.findByRole("tab", { name: "Review" })).toBeInTheDocument();
    expect(await screen.findByText("No Changes")).toBeInTheDocument();
    expect(getWorkspaceReview).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/workspace",
      scope: "uncommitted",
    });
  });

  it("opens Review from the right panel launcher", async () => {
    const user = userEvent.setup();
    const getWorkspaceReview = vi.fn(async () => emptyReview());
    (window as unknown as { actspace: Partial<NonNullable<typeof window.actspace>> }).actspace = {
      getWorkspaceReview,
    };

    render(
      <RightPanelProvider initialOpen>
        <WorkbenchLayout
          sessions={[
            {
              id: "session-review-launcher",
              title: "Review launcher",
              updatedAt: new Date().toISOString(),
              agentRunCount: 0,
              workspaceRoot: "/tmp/workspace",
            },
          ]}
          activeSessionId="session-review-launcher"
          title="Review launcher"
          messages={[]}
          contextSnapshot={null}
          selectedWorkspaceRoot="/tmp/workspace"
        />
      </RightPanelProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Review" }));

    expect(await screen.findByRole("tab", { name: "Review" })).toBeInTheDocument();
    expect(await screen.findByText("No Changes")).toBeInTheDocument();
    expect(getWorkspaceReview).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/workspace",
      scope: "uncommitted",
    });
  });
});
