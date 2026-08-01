import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewChangeNotification, ReviewFileDiff, ReviewSnapshot } from "@actspace/shared";
import { ReviewRenderView } from "../components/right-panel/ReviewRenderView";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { WorkbenchLayout } from "../components/WorkbenchLayout";

const originalActspace = (window as { actspace?: unknown }).actspace;
afterEach(() => {
  (window as { actspace?: unknown }).actspace = originalActspace;
  localStorage.removeItem("actspace.review.display.v2");
  vi.restoreAllMocks();
});

describe("Review workbench", () => {
  it("renders six real scopes, an on-demand file list, and a structured diff", async () => {
    const user = userEvent.setup();
    const bridge = reviewBridge(dirtySnapshot());
    window.actspace = bridge as unknown as Window["actspace"];
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" sessionId="session-1" refreshKey={1} />);

    expect(await screen.findByText("packages/desktop/src/renderer/App.tsx")).toBeInTheDocument();
    expect(screen.getAllByText("+2").every((element) => element.classList.contains("text-success"))).toBe(true);
    expect(screen.getAllByText("-1").every((element) => element.classList.contains("text-danger"))).toBe(true);
    await waitFor(() => expect(bridge.getReviewFileDiffs).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("return value.name;")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review scope" }));
    const menu = await screen.findByRole("menu", { name: "Review scope options" });
    expect(menu.closest("[data-review-toolbar-scroll]")).toBeNull();
    for (const label of ["Last Turn", "Uncommitted", "Unstaged", "Staged", "Committed", "Branch"]) {
      expect(within(menu).getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Show files" }));
    const fileList = screen.getByRole("complementary", { name: "Changed files" });
    expect(fileList).toBeInTheDocument();
    expect(fileList.closest('[data-review-files-layout="docked"]')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Review overlay" })).not.toBeInTheDocument();
    await user.click(within(fileList).getByRole("button", { name: "Hide files" }));
    expect(screen.queryByRole("button", { name: "Run AI Review" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review options" }));
    expect(await screen.findByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Enable word wrap" }).querySelector("svg")).toHaveClass("lucide-arrow-right-from-line");
    expect(screen.getByRole("button", { name: "Don't load full files" }).querySelector("svg")).toHaveClass("lucide-file");
    expect(screen.getByRole("menuitemcheckbox", { name: "Enable rich preview" }).querySelector("svg")).toHaveClass("lucide-image");
    expect(screen.getByRole("menuitemcheckbox", { name: "Enable word diffs" }).querySelector("svg")).toHaveClass("lucide-file-diff");
    expect(screen.getByRole("menuitemcheckbox", { name: "Hide white space" }).querySelector("svg")).toHaveClass("lucide-eye");
    expect(screen.getByRole("button", { name: "Copy git apply command" }).querySelector("svg")).toHaveClass("lucide-clipboard");
    expect(screen.getByRole("button", { name: "Show files" }).querySelector("svg")).toHaveClass("lucide-folder");
  });

  it("refreshes through the coordinator bridge when refreshKey changes", async () => {
    const bridge = reviewBridge(emptySnapshot());
    window.actspace = bridge as unknown as Window["actspace"];
    const { rerender } = render(<ReviewRenderView workspaceRoot="/tmp/workspace" refreshKey={1} />);
    expect(await screen.findByText("No changes")).toBeInTheDocument();
    expect(screen.queryByText("+0")).not.toBeInTheDocument();
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all diffs" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Jump to file" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Show files" })).toHaveAttribute("aria-disabled", "true");
    expect(bridge.getReviewSnapshot).toHaveBeenCalledTimes(1);
    rerender(<ReviewRenderView workspaceRoot="/tmp/workspace" refreshKey={2} />);
    await waitFor(() => expect(bridge.refreshReviewSnapshot).toHaveBeenCalledTimes(1));
  });

  it("refreshes an open Review when a workspace Git mutation invalidates its snapshot", async () => {
    let notifyReviewChanged: ((notification: ReviewChangeNotification) => void) | undefined;
    const bridge = reviewBridge(dirtySnapshot());
    bridge.getReviewSnapshot
      .mockResolvedValueOnce({ ok: true as const, snapshot: dirtySnapshot() })
      .mockResolvedValueOnce({ ok: true as const, snapshot: emptySnapshot() });
    bridge.onReviewChanged.mockImplementation((callback) => {
      notifyReviewChanged = callback;
      return () => undefined;
    });
    window.actspace = bridge as unknown as Window["actspace"];
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);

    expect(await screen.findByText("packages/desktop/src/renderer/App.tsx")).toBeInTheDocument();
    await act(async () => {
      notifyReviewChanged?.({ workspaceId: "ws", generation: 2, reason: "git" });
    });

    expect(await screen.findByText("No changes")).toBeInTheDocument();
    expect(screen.queryByText("+2")).not.toBeInTheDocument();
  });

  it("shows recent Git log entries under Committed and opens the selected commit diff", async () => {
    const user = userEvent.setup();
    const bridge = reviewBridge(dirtySnapshot());
    bridge.listReviewCommits.mockResolvedValue({
      ok: true as const,
      commits: [
        { sha: "a".repeat(40), subject: "fix: keep commit history read-only", authoredAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString() },
        { sha: "b".repeat(40), subject: "feat: add Review scopes", authoredAt: new Date(Date.now() - 24 * 60 * 60_000).toISOString() },
      ],
    });
    window.actspace = bridge as unknown as Window["actspace"];
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" sessionId="session-1" />);

    expect(await screen.findByText("packages/desktop/src/renderer/App.tsx")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review scope" }));
    await user.click(within(await screen.findByRole("menu", { name: "Review scope options" })).getByRole("menuitem", { name: "Committed" }));

    const commits = await screen.findByRole("menu", { name: "Recent commits" });
    expect(bridge.listReviewCommits).toHaveBeenCalledWith({ workspaceRoot: "/tmp/workspace", sessionId: "session-1" });
    expect(within(commits).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(within(commits).getByRole("menuitem", { name: /fix: keep commit history read-only/ }));
    await waitFor(() => expect(bridge.getReviewSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      selection: { kind: "commit", sha: "a".repeat(40) },
    })));
  });

  it("uses a dedicated file-list view and keeps split diff disabled in a narrow Review panel", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 390,
      height: 700,
      top: 0,
      right: 390,
      bottom: 700,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const user = userEvent.setup();
    window.actspace = reviewBridge(dirtySnapshot()) as unknown as Window["actspace"];
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);

    expect(await screen.findByText("packages/desktop/src/renderer/App.tsx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to split diff" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("button", { name: "Show files" }));
    expect(screen.getByRole("complementary", { name: "Changed files" }).closest('[data-review-files-layout="compact"]')).toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "Review diff canvas" })).not.toBeInTheDocument();
  });

  it("opens Review from the object menu inside the right panel and keeps chat visible", async () => {
    const user = userEvent.setup();
    window.actspace = reviewBridge(emptySnapshot()) as unknown as Window["actspace"];
    render(<RightPanelProvider initialOpen><WorkbenchLayout sessions={[{ id: "session-review", title: "Review menu", updatedAt: new Date().toISOString(), agentRunCount: 0, workspaceRoot: "/tmp/workspace" }]} activeSessionId="session-review" title="Review menu" messages={[]} contextSnapshot={null} selectedWorkspaceRoot="/tmp/workspace" /></RightPanelProvider>);
    await user.click(screen.getByRole("button", { name: "New right panel object" }));
    await user.click(screen.getByRole("menuitem", { name: "Review" }));
    expect(await screen.findByRole("region", { name: "Review workspace" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("conversation-shell");
    await user.click(screen.getByRole("button", { name: "关闭 Review" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Review workspace" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "New right panel object" })).toBeInTheDocument();
  });

  it("opens Review from the right panel launcher", async () => {
    const user = userEvent.setup();
    window.actspace = reviewBridge(emptySnapshot()) as unknown as Window["actspace"];
    render(<RightPanelProvider initialOpen><WorkbenchLayout sessions={[{ id: "session-launcher", title: "Review launcher", updatedAt: new Date().toISOString(), agentRunCount: 0, workspaceRoot: "/tmp/workspace" }]} activeSessionId="session-launcher" title="Review launcher" messages={[]} contextSnapshot={null} selectedWorkspaceRoot="/tmp/workspace" /></RightPanelProvider>);
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("region", { name: "Review workspace" })).toBeInTheDocument();
  });

  it("reloads an open Review against the currently selected workspace", async () => {
    const user = userEvent.setup();
    const bridge = reviewBridge(emptySnapshot());
    window.actspace = bridge as unknown as Window["actspace"];
    const props = {
      sessions: [{ id: "session-workspace", title: "Workspace review", updatedAt: new Date().toISOString(), agentRunCount: 0, workspaceRoot: "/tmp/workspace-a" }],
      activeSessionId: "session-workspace",
      title: "Workspace review",
      messages: [],
      contextSnapshot: null,
    };
    const { rerender } = render(<RightPanelProvider initialOpen><WorkbenchLayout {...props} selectedWorkspaceRoot="/tmp/workspace-a" /></RightPanelProvider>);
    await user.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(bridge.getReviewSnapshot).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "/tmp/workspace-a" })));

    rerender(<RightPanelProvider initialOpen><WorkbenchLayout {...props} selectedWorkspaceRoot="/tmp/workspace-b" /></RightPanelProvider>);
    await waitFor(() => expect(bridge.getReviewSnapshot).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "/tmp/workspace-b" })));
    expect(screen.getAllByRole("tab", { name: "Review" })).toHaveLength(1);
  });

  it("keeps capped Review requests scoped to the selected file", async () => {
    const user = userEvent.setup();
    const bridge = reviewBridge(cappedSnapshot());
    window.actspace = bridge as unknown as Window["actspace"];
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);

    await waitFor(() => expect(bridge.getReviewFileDiffs).toHaveBeenCalledTimes(1));
    expect(bridge.getReviewFileDiffs.mock.calls[0]?.[0].requests).toEqual([{ fileId: "app", contextLines: 3 }]);
    expect(await screen.findByText("This diff is large, showing one file at a time")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show files" }));
    const tree = screen.getByRole("complementary", { name: "Changed files" });
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(2);
    await user.click(within(tree).getByTitle("src/second.ts"));
    await waitFor(() => expect(bridge.getReviewFileDiffs).toHaveBeenCalledTimes(2));
    expect(bridge.getReviewFileDiffs.mock.calls[1]?.[0].requests).toEqual([{ fileId: "second", contextLines: 3 }]);

    await user.click(screen.getByRole("button", { name: "Collapse current diff" }));
    await user.click(screen.getByRole("button", { name: "Expand current diff" }));
    expect(bridge.getReviewFileDiffs).toHaveBeenCalledTimes(2);
  });

  it("does not load full content while disabled and loads visible files when enabled", async () => {
    localStorage.setItem("actspace.review.display.v2", JSON.stringify({ loadFullFiles: false }));
    const user = userEvent.setup();
    const bridge = reviewBridge(dirtySnapshot());
    window.actspace = bridge as unknown as Window["actspace"];
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);

    expect(await screen.findByText("return value.name;")).toBeInTheDocument();
    expect(bridge.getReviewFileContents).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Review options" }));
    await user.click(await screen.findByRole("button", { name: "Load full files" }));
    await waitFor(() => expect(bridge.getReviewFileContents).toHaveBeenCalledTimes(1));
    expect(bridge.getReviewFileContents.mock.calls[0]?.[0].fileIds).toEqual(["app"]);
  });
});

function capabilities() {
  return { canStageFile: true, canStageHunk: true, canUnstageFile: false, canUnstageHunk: false, canRevertFile: true, canRevertHunk: true, canLoadFullFile: true, canOpenFile: true, canCommit: true, canPush: true, canCreatePullRequest: true, disabledReasons: {} };
}

function emptySnapshot(): ReviewSnapshot {
  return { id: "empty", generation: 1, workspaceId: "ws", workspaceRoot: "/tmp/workspace", selection: { kind: "uncommitted" }, baseline: { kind: "git-ref", label: "HEAD" }, target: { label: "Working tree" }, status: "empty", files: [], totals: { files: 0, additions: 0, deletions: 0, changedLines: 0, estimatedChangedBytes: 0 }, capabilities: capabilities(), loadPolicy: { mode: "all-files" }, queryOptions: { ignoreWhitespaceChanges: false }, generatedAt: new Date().toISOString() };
}

function dirtySnapshot(): ReviewSnapshot {
  return { ...emptySnapshot(), id: "dirty", status: "ready", files: [{ id: "app", path: "packages/desktop/src/renderer/App.tsx", status: "modified", additions: 2, deletions: 1, binary: false, renderKind: "text", source: "workingTree", diffLoadStatus: "idle", viewed: false, fingerprint: "fp" }], totals: { files: 1, additions: 2, deletions: 1, changedLines: 3, estimatedChangedBytes: 256 } };
}

function cappedSnapshot(): ReviewSnapshot {
  const snapshot = dirtySnapshot();
  return {
    ...snapshot,
    id: "capped",
    files: [
      snapshot.files[0]!,
      { ...snapshot.files[0]!, id: "second", path: "src/second.ts", fingerprint: "second" },
    ],
    totals: { files: 2, additions: 4, deletions: 2, changedLines: 6, estimatedChangedBytes: 13 * 1024 * 1024 },
    loadPolicy: { mode: "single-file", reason: "changed-bytes" },
    warnings: [{ kind: "capped", message: "This diff is large, showing one file at a time." }],
  };
}

function fileDiff(fileId = "app", path = "packages/desktop/src/renderer/App.tsx", snapshotId = "dirty"): ReviewFileDiff {
  return { snapshotId, generation: 1, fileId, path, hunks: [{ id: `hunk-${fileId}`, header: "@@ -1,2 +1,3 @@", oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, patchFingerprint: `hp-${fileId}`, lines: [{ id: `context-${fileId}`, kind: "context", oldLine: 1, newLine: 1, text: "const value = maybe();" }, { id: `old-${fileId}`, kind: "deletion", oldLine: 2, text: "return value?.name;" }, { id: `new-${fileId}`, kind: "addition", newLine: 2, text: "return value.name;" }, { id: `new2-${fileId}`, kind: "addition", newLine: 3, text: "// reviewed" }] }], oldContentAvailable: true, newContentAvailable: true, partial: false, patchFingerprint: `patch-${fileId}` };
}

function reviewBridge(snapshot: ReviewSnapshot) {
  return {
    getReviewSnapshot: vi.fn(async () => ({ ok: true as const, snapshot })),
    refreshReviewSnapshot: vi.fn(async () => ({ ok: true as const, snapshot })),
    getReviewFileDiffs: vi.fn(async (input: { requests: Array<{ fileId: string }> }) => ({ ok: true as const, outcomes: input.requests.map((request) => {
      const file = snapshot.files.find((candidate) => candidate.id === request.fileId);
      return { fileId: request.fileId, status: "ready" as const, diff: fileDiff(request.fileId, file?.path, snapshot.id) };
    }) })),
    getReviewFileContents: vi.fn(async (_input: { fileIds: string[] }) => ({ ok: true as const, outcomes: [] })),
    setReviewFileViewed: vi.fn(async (_input: unknown) => ({ ok: true as const, viewed: true })),
    applyReviewMutation: vi.fn(),
    listReviewBranches: vi.fn(async () => ({ ok: true as const, branches: [] })),
    listReviewCommits: vi.fn(async () => ({ ok: true as const, commits: [] })),
    copyReviewGitApplyCommand: vi.fn(),
    onReviewChanged: vi.fn((_callback: (notification: ReviewChangeNotification) => void) => () => undefined),
  };
}
