import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewChangeNotification, ReviewFileDiff, ReviewSnapshot } from "@actspace/shared";
import { ReviewRenderView } from "../components/right-panel/ReviewRenderView";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TestWorkbenchLayout } from "./helpers/workbench";
import { setupBridge } from "./helpers/bridge";

afterEach(() => {
  localStorage.removeItem("actspace.review.display.v2");
  vi.restoreAllMocks();
});

describe("Review workbench", () => {
  it("renders six real scopes, an on-demand file list, and a structured diff", async () => {
    const user = userEvent.setup();
    const bridge = reviewBridge(dirtySnapshot());
    setupBridge(bridge);
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" sessionId="session-1" refreshKey={1} />);

    expect(await screen.findByText("apps/desktop/src/renderer/App.tsx")).toBeInTheDocument();
    expect(screen.getAllByText("+2").every((element) => element.classList.contains("text-success"))).toBe(true);
    expect(screen.getAllByText("-1").every((element) => element.classList.contains("text-danger"))).toBe(true);
    await waitFor(() => expect(bridge["review.getFileDiffs"]).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("return value.name;")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "审查范围" }));
    const menu = await screen.findByRole("menu", { name: "审查范围选项" });
    expect(menu.closest("[data-review-toolbar-scroll]")).toBeNull();
    for (const label of ["最近一轮", "未提交", "未暂存", "已暂存", "已提交", "分支"]) {
      expect(within(menu).getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "显示文件列表" }));
    const fileList = screen.getByRole("complementary", { name: "已变更文件" });
    expect(fileList).toBeInTheDocument();
    expect(fileList.closest('[data-review-files-layout="docked"]')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close Review overlay" })).not.toBeInTheDocument();
    await user.click(within(fileList).getByRole("button", { name: "隐藏文件列表" }));
    expect(screen.queryByRole("button", { name: "Run AI Review" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "审查选项" }));
    expect(await screen.findByRole("menuitem", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "自动换行" }).querySelector(".lucide-arrow-right-from-line")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "不加载完整文件" }).querySelector("svg")).toHaveClass("lucide-file");
    expect(screen.getByRole("menuitemcheckbox", { name: "启用富预览" }).querySelector(".lucide-image")).not.toBeNull();
    expect(screen.getByRole("menuitemcheckbox", { name: "显示词级差异" }).querySelector(".lucide-file-diff")).not.toBeNull();
    expect(screen.getByRole("menuitemcheckbox", { name: "隐藏空白差异" }).querySelector(".lucide-eye")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "复制 git apply 命令" }).querySelector("svg")).toHaveClass("lucide-clipboard");
    expect(screen.getByRole("button", { name: "显示文件列表" }).querySelector("svg")).toHaveClass("lucide-folder");
  });

  it("refreshes through the coordinator bridge when refreshKey changes", async () => {
    const bridge = reviewBridge(emptySnapshot());
    setupBridge(bridge);
    const { rerender } = render(<ReviewRenderView workspaceRoot="/tmp/workspace" refreshKey={1} />);
    expect(await screen.findByText("暂无变更")).toBeInTheDocument();
    expect(screen.queryByText("+0")).not.toBeInTheDocument();
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开全部差异" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "跳转到文件" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "跳转到文件" }));
    expect(screen.queryByPlaceholderText("跳转到文件…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "显示文件列表" })).toHaveAttribute("aria-disabled", "true");
    expect(bridge["review.getSnapshot"]).toHaveBeenCalledTimes(1);
    rerender(<ReviewRenderView workspaceRoot="/tmp/workspace" refreshKey={2} />);
    await waitFor(() => expect(bridge["review.refreshSnapshot"]).toHaveBeenCalledTimes(1));
  });

  it("refreshes an open Review when a workspace Git mutation invalidates its snapshot", async () => {
    let notifyReviewChanged: ((notification: ReviewChangeNotification) => void) | undefined;
    const bridge = reviewBridge(dirtySnapshot());
    bridge["review.getSnapshot"]
      .mockResolvedValueOnce({ ok: true as const, snapshot: dirtySnapshot() })
      .mockResolvedValueOnce({ ok: true as const, snapshot: emptySnapshot() });
    bridge["events.reviewChanged"].mockImplementation((callback) => {
      notifyReviewChanged = callback;
      return () => undefined;
    });
    setupBridge(bridge);
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);

    expect(await screen.findByText("apps/desktop/src/renderer/App.tsx")).toBeInTheDocument();
    await act(async () => {
      notifyReviewChanged?.({ workspaceId: "ws", generation: 2, reason: "git" });
    });

    expect(await screen.findByText("暂无变更")).toBeInTheDocument();
    expect(screen.queryByText("+2")).not.toBeInTheDocument();
  });

  it("shows recent Git log entries under Committed and opens the selected commit diff", async () => {
    const user = userEvent.setup();
    const bridge = reviewBridge(dirtySnapshot());
    bridge["review.listCommits"].mockResolvedValue({
      ok: true as const,
      commits: [
        { sha: "a".repeat(40), subject: "fix: keep commit history read-only", authoredAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString() },
        { sha: "b".repeat(40), subject: "feat: add Review scopes", authoredAt: new Date(Date.now() - 24 * 60 * 60_000).toISOString() },
      ],
    });
    setupBridge(bridge);
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" sessionId="session-1" />);

    expect(await screen.findByText("apps/desktop/src/renderer/App.tsx")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "审查范围" }));
    await user.click(within(await screen.findByRole("menu", { name: "审查范围选项" })).getByRole("menuitem", { name: "已提交" }));

    const commits = await screen.findByRole("menu", { name: "最近提交" });
    expect(bridge["review.listCommits"]).toHaveBeenCalledWith({ workspaceRoot: "/tmp/workspace", sessionId: "session-1" });
    expect(within(commits).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(within(commits).getByRole("menuitem", { name: /fix: keep commit history read-only/ }));
    expect(screen.queryByRole("menu", { name: "最近提交" })).not.toBeInTheDocument();
    await waitFor(() => expect(bridge["review.getSnapshot"]).toHaveBeenCalledWith(expect.objectContaining({
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
    setupBridge(reviewBridge(dirtySnapshot()));
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);

    expect(await screen.findByText("apps/desktop/src/renderer/App.tsx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换为并排差异" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("button", { name: "显示文件列表" }));
    expect(screen.getByRole("complementary", { name: "已变更文件" }).closest('[data-review-files-layout="compact"]')).toBeInTheDocument();
    expect(screen.queryByRole("main", { name: "变更差异视图" })).not.toBeInTheDocument();
  });

  it("opens Review from the object menu inside the right panel and keeps chat visible", async () => {
    const user = userEvent.setup();
    setupBridge(reviewBridge(emptySnapshot()));
    render(<RightPanelProvider initialOpen><TestWorkbenchLayout sessions={[{ id: "session-review", title: "Review menu", updatedAt: new Date().toISOString(), agentRunCount: 0, workspaceRoot: "/tmp/workspace" }]} activeSessionId="session-review" title="Review menu" messages={[]} contextSnapshot={null} selectedWorkspaceRoot="/tmp/workspace" /></RightPanelProvider>);
    await user.click(screen.getByRole("button", { name: "新建右侧面板对象" }));
    await user.click(screen.getByRole("menuitem", { name: "Review" }));
    expect(await screen.findByRole("region", { name: "工作区变更审查" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("conversation-shell");
    await user.click(screen.getByRole("button", { name: "关闭 Review" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "工作区变更审查" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "新建右侧面板对象" })).toBeInTheDocument();
  });

  it("opens Review from the right panel launcher", async () => {
    const user = userEvent.setup();
    setupBridge(reviewBridge(emptySnapshot()));
    render(<RightPanelProvider initialOpen><TestWorkbenchLayout sessions={[{ id: "session-launcher", title: "Review launcher", updatedAt: new Date().toISOString(), agentRunCount: 0, workspaceRoot: "/tmp/workspace" }]} activeSessionId="session-launcher" title="Review launcher" messages={[]} contextSnapshot={null} selectedWorkspaceRoot="/tmp/workspace" /></RightPanelProvider>);
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("region", { name: "工作区变更审查" })).toBeInTheDocument();
  });

  it("hides workspace controls and development objects on a remote run target", async () => {
    // 15 T6：WorkbenchLayout 按 capabilities.review / terminal 判断，不再看有没有 hostId。
    const user = userEvent.setup();
    setupBridge(reviewBridge(emptySnapshot()));
    const props = { sessions: [], activeSessionId: null, title: "Remote", messages: [], contextSnapshot: null, selectedWorkspaceRoot: "/tmp/workspace" };
    const { unmount } = render(<RightPanelProvider initialOpen><TestWorkbenchLayout {...props} /></RightPanelProvider>);
    expect(screen.getByRole("button", { name: "查看工作区环境" })).toBeInTheDocument();
    unmount();
    render(<RightPanelProvider initialOpen><TestWorkbenchLayout {...props} runTarget={{ kind: "remote", hostId: "server", hostName: "Cloud" }} /></RightPanelProvider>);
    expect(screen.queryByRole("button", { name: "查看工作区环境" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建右侧面板对象" }));
    expect(screen.queryByRole("menuitem", { name: "工作区文件" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Review" })).not.toBeInTheDocument();
  });

  it("reloads an open Review against the currently selected workspace", async () => {
    const user = userEvent.setup();
    const bridge = reviewBridge(emptySnapshot());
    setupBridge(bridge);
    const props = {
      sessions: [{ id: "session-workspace", title: "Workspace review", updatedAt: new Date().toISOString(), agentRunCount: 0, workspaceRoot: "/tmp/workspace-a" }],
      activeSessionId: "session-workspace",
      title: "Workspace review",
      messages: [],
      contextSnapshot: null,
    };
    const { rerender } = render(<RightPanelProvider initialOpen><TestWorkbenchLayout {...props} selectedWorkspaceRoot="/tmp/workspace-a" /></RightPanelProvider>);
    await user.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(bridge["review.getSnapshot"]).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "/tmp/workspace-a" })));

    rerender(<RightPanelProvider initialOpen><TestWorkbenchLayout {...props} selectedWorkspaceRoot="/tmp/workspace-b" /></RightPanelProvider>);
    await waitFor(() => expect(bridge["review.getSnapshot"]).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "/tmp/workspace-b" })));
    expect(screen.getAllByRole("tab", { name: "Review" })).toHaveLength(1);
  });

  it("keeps capped Review requests scoped to the selected file", async () => {
    const user = userEvent.setup();
    const bridge = reviewBridge(cappedSnapshot());
    setupBridge(bridge);
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);

    await waitFor(() => expect(bridge["review.getFileDiffs"]).toHaveBeenCalledTimes(1));
    expect(bridge["review.getFileDiffs"].mock.calls[0]?.[0].requests).toEqual([{ fileId: "app", contextLines: 3 }]);
    expect(await screen.findByText("变更较多，每次显示一个文件")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "显示文件列表" }));
    const tree = screen.getByRole("complementary", { name: "已变更文件" });
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(2);
    await user.click(within(tree).getByTitle("src/second.ts"));
    await waitFor(() => expect(bridge["review.getFileDiffs"]).toHaveBeenCalledTimes(2));
    expect(bridge["review.getFileDiffs"].mock.calls[1]?.[0].requests).toEqual([{ fileId: "second", contextLines: 3 }]);

    await user.click(screen.getByRole("button", { name: "收起当前差异" }));
    await user.click(screen.getByRole("button", { name: "展开当前差异" }));
    expect(bridge["review.getFileDiffs"]).toHaveBeenCalledTimes(2);
  });

  it("does not load full content while disabled and loads visible files when enabled", async () => {
    localStorage.setItem("actspace.review.display.v2", JSON.stringify({ loadFullFiles: false }));
    const user = userEvent.setup();
    const bridge = reviewBridge(dirtySnapshot());
    setupBridge(bridge);
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);

    expect(await screen.findByText("return value.name;")).toBeInTheDocument();
    expect(bridge["review.getFileContents"]).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "审查选项" }));
    await user.click(await screen.findByRole("menuitem", { name: "加载完整文件" }));
    expect(screen.getByRole("menuitem", { name: "不加载完整文件" })).toBeInTheDocument();
    await waitFor(() => expect(bridge["review.getFileContents"]).toHaveBeenCalledTimes(1));
    expect(bridge["review.getFileContents"].mock.calls[0]?.[0].fileIds).toEqual(["app"]);
  });

  it("keeps the options menu open while toggling display settings and switches between toolbar popovers", async () => {
    const user = userEvent.setup();
    setupBridge(reviewBridge(dirtySnapshot()));
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);
    expect(await screen.findByText("return value.name;")).toBeInTheDocument();

    const options = screen.getByRole("button", { name: "审查选项" });
    await user.click(options);
    const wrap = await screen.findByRole("menuitemcheckbox", { name: "自动换行" });
    const before = wrap.getAttribute("aria-checked");
    await user.click(wrap);
    expect(screen.getByRole("menuitemcheckbox", { name: "自动换行" })).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(options).toHaveFocus());

    // 范围弹层开着时点「跳转到文件」：范围关闭，跳转弹层打开并聚焦搜索框。
    await user.click(screen.getByRole("button", { name: "审查范围" }));
    expect(await screen.findByRole("menu", { name: "审查范围选项" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "跳转到文件" }));
    await waitFor(() => expect(screen.queryByRole("menu", { name: "审查范围选项" })).not.toBeInTheDocument());
    const search = screen.getByPlaceholderText("跳转到文件…");
    expect(search).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("跳转到文件…")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "跳转到文件" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "跳转到文件" }));
    const jump = screen.getByPlaceholderText("跳转到文件…").closest<HTMLElement>("[data-radix-popper-content-wrapper]")!;
    await user.click(within(jump).getByRole("button", { name: "apps/desktop/src/renderer/App.tsx" }));
    expect(screen.queryByPlaceholderText("跳转到文件…")).not.toBeInTheDocument();
  });

  it("disables copying the git apply command until a snapshot has loaded", async () => {
    const user = userEvent.setup();
    setupBridge({ ...reviewBridge(dirtySnapshot()), "review.getSnapshot": vi.fn(() => new Promise<never>(() => {})) });
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);
    await user.click(screen.getByRole("button", { name: "审查选项" }));
    expect(await screen.findByRole("menuitem", { name: "复制 git apply 命令" })).toHaveAttribute("aria-disabled", "true");
  });

  it("opens the commit and PR dialogs as modals that keep Tab inside and close on Escape", async () => {
    const user = userEvent.setup();
    setupBridge({ ...reviewBridge(dirtySnapshot()), "review.getPullRequestCapability": vi.fn(async () => ({ ok: true as const, capability: { enabled: true, baseBranch: "main" } })) });
    render(<ReviewRenderView workspaceRoot="/tmp/workspace" />);
    expect(await screen.findByText("return value.name;")).toBeInTheDocument();

    const [gitButton] = screen.getAllByRole("button", { name: "提交或推送" });
    await user.click(gitButton!);
    await user.click(await screen.findByRole("menuitem", { name: "提交或推送" }));
    const gitDialog = screen.getByRole("dialog", { name: "提交或推送" });
    expect(within(gitDialog).getByRole("textbox", { name: "提交说明" })).toHaveFocus();
    await user.tab();
    expect(within(gitDialog).getByRole("button", { name: "取消" })).toHaveFocus();
    await user.tab();
    expect(within(gitDialog).getByRole("textbox", { name: "提交说明" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // 打开对话框的菜单项已经卸载，焦点回到「提交或推送」按钮。
    await waitFor(() => expect(gitButton).toHaveFocus());

    await user.click(gitButton!);
    await user.click(await screen.findByRole("menuitem", { name: "创建 PR" }));
    const prDialog = screen.getByRole("dialog", { name: "创建拉取请求" });
    expect(within(prDialog).getByRole("textbox", { name: "标题" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(prDialog).toContainElement(document.activeElement as HTMLElement);
    await user.click(within(prDialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(gitButton).toHaveFocus());
  });
});

function capabilities() {
  return { canStageFile: true, canStageHunk: true, canUnstageFile: false, canUnstageHunk: false, canRevertFile: true, canRevertHunk: true, canLoadFullFile: true, canOpenFile: true, canCommit: true, canPush: true, canCreatePullRequest: true, disabledReasons: {} };
}

function emptySnapshot(): ReviewSnapshot {
  return { id: "empty", generation: 1, workspaceId: "ws", workspaceRoot: "/tmp/workspace", selection: { kind: "uncommitted" }, baseline: { kind: "git-ref", label: "HEAD" }, target: { label: "Working tree" }, status: "empty", files: [], totals: { files: 0, additions: 0, deletions: 0, changedLines: 0, estimatedChangedBytes: 0 }, capabilities: capabilities(), loadPolicy: { mode: "all-files" }, queryOptions: { ignoreWhitespaceChanges: false }, generatedAt: new Date().toISOString() };
}

function dirtySnapshot(): ReviewSnapshot {
  return { ...emptySnapshot(), id: "dirty", status: "ready", files: [{ id: "app", path: "apps/desktop/src/renderer/App.tsx", status: "modified", additions: 2, deletions: 1, binary: false, renderKind: "text", source: "workingTree", diffLoadStatus: "idle", viewed: false, fingerprint: "fp" }], totals: { files: 1, additions: 2, deletions: 1, changedLines: 3, estimatedChangedBytes: 256 } };
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

function fileDiff(fileId = "app", path = "apps/desktop/src/renderer/App.tsx", snapshotId = "dirty"): ReviewFileDiff {
  return { snapshotId, generation: 1, fileId, path, hunks: [{ id: `hunk-${fileId}`, header: "@@ -1,2 +1,3 @@", oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, patchFingerprint: `hp-${fileId}`, lines: [{ id: `context-${fileId}`, kind: "context", oldLine: 1, newLine: 1, text: "const value = maybe();" }, { id: `old-${fileId}`, kind: "deletion", oldLine: 2, text: "return value?.name;" }, { id: `new-${fileId}`, kind: "addition", newLine: 2, text: "return value.name;" }, { id: `new2-${fileId}`, kind: "addition", newLine: 3, text: "// reviewed" }] }], oldContentAvailable: true, newContentAvailable: true, partial: false, patchFingerprint: `patch-${fileId}` };
}

function reviewBridge(snapshot: ReviewSnapshot) {
  return {
    "review.getSnapshot": vi.fn(async () => ({ ok: true as const, snapshot })),
    "review.refreshSnapshot": vi.fn(async () => ({ ok: true as const, snapshot })),
    "review.getFileDiffs": vi.fn(async (input: { requests: Array<{ fileId: string }> }) => ({ ok: true as const, outcomes: input.requests.map((request) => {
      const file = snapshot.files.find((candidate) => candidate.id === request.fileId);
      return { fileId: request.fileId, status: "ready" as const, diff: fileDiff(request.fileId, file?.path, snapshot.id) };
    }) })),
    "review.getFileContents": vi.fn(async (_input: { fileIds: string[] }) => ({ ok: true as const, outcomes: [] })),
    "review.setFileViewed": vi.fn(async (_input: unknown) => ({ ok: true as const, viewed: true })),
    "review.applyMutation": vi.fn(),
    "review.listBranches": vi.fn(async () => ({ ok: true as const, branches: [] })),
    "review.listCommits": vi.fn(async () => ({ ok: true as const, commits: [] })),
    "review.copyGitApplyCommand": vi.fn(),
    "events.reviewChanged": vi.fn((_callback: (notification: ReviewChangeNotification) => void) => () => undefined),
  };
}
