import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock, WorkspaceEnvironmentSnapshot } from "@actspace/shared";
import { WorkspaceChromeControls } from "../components/workspace/WorkspaceChromeControls";

const originalActspace = (window as { actspace?: unknown }).actspace;

const environment: WorkspaceEnvironmentSnapshot = {
  workspaceRoot: "/tmp/workspace",
  workspaceLabel: "workspace",
  locationKind: "worktree",
  git: {
    available: true,
    repository: true,
    branch: "main",
    branches: [
      { name: "main", current: true },
      { name: "codex/add-branch-selector", current: false },
      { name: "feature/occupied", current: false, checkedOutPath: "/tmp/other-worktree" },
    ],
    detached: false,
    hasHead: true,
    remotes: ["origin"],
  },
};

const messages: MessageBlock[] = [
  {
    kind: "user",
    id: "message-1",
    renderKey: "message-1",
    content: "Use these sources",
    createdAt: new Date().toISOString(),
    attachments: [
      { id: "image-1", kind: "image", name: "reference.png", path: "/tmp/reference.png" },
      { id: "file-1", kind: "file", name: "notes.md", path: "/tmp/notes.md" },
      { id: "link-1", kind: "link", name: "README", path: "https://example.com/readme" },
      { id: "image-copy", kind: "image", name: "reference.png", path: "/tmp/reference.png" },
    ],
  },
];

function installBridge(overrides: Partial<NonNullable<typeof window.actspace>> = {}) {
  const bridge = {
    getWorkspaceEnvironment: vi.fn(async () => environment),
    createWorkspaceBranch: vi.fn(async (input) => ({
      ok: true as const,
      action: "create_branch" as const,
      phase: "branch" as const,
      workspaceRoot: "/tmp/workspace",
      branch: input.branchName,
    })),
    switchWorkspaceBranch: vi.fn(async (input) => ({
      ok: true as const,
      action: "switch_branch" as const,
      phase: "branch" as const,
      workspaceRoot: "/tmp/workspace",
      branch: input.branchName,
    })),
    commitWorkspaceChanges: vi.fn(async () => ({
      ok: true as const,
      action: "commit" as const,
      phase: "commit" as const,
      workspaceRoot: "/tmp/workspace",
      branch: "main",
      commitCreated: true,
      commitHash: "abc1234",
    })),
    pushWorkspaceBranch: vi.fn(async () => ({
      ok: true as const,
      action: "push" as const,
      phase: "push" as const,
      workspaceRoot: "/tmp/workspace",
      branch: "main",
      pushed: true,
      remote: "origin",
    })),
    commitAndPushWorkspaceChanges: vi.fn(async () => ({
      ok: true as const,
      action: "commit_and_push" as const,
      phase: "push" as const,
      workspaceRoot: "/tmp/workspace",
      branch: "main",
      commitCreated: true,
      commitHash: "def5678",
      pushed: true,
      remote: "origin",
    })),
    ...overrides,
  };
  (window as unknown as { actspace: Partial<NonNullable<typeof window.actspace>> }).actspace = bridge;
  return bridge;
}

function renderControls(overrides: Partial<Parameters<typeof WorkspaceChromeControls>[0]> = {}) {
  return render(
    <WorkspaceChromeControls
      workspaceRoot="/tmp/workspace"
      title="Environment controls"
      messages={messages}
      reviewSummary={{ status: "changes", additions: 5, deletions: 1 }}
      onOpenReview={vi.fn()}
      onWorkspaceChanged={vi.fn()}
      {...overrides}
    />,
  );
}

describe("WorkspaceChromeControls", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    (window as { actspace?: unknown }).actspace = originalActspace;
  });

  it("opens the Environment popover with worktree, branch, changes, and deduplicated sources", async () => {
    installBridge();
    const user = userEvent.setup();
    renderControls();

    const environmentButton = screen.getByRole("button", { name: "查看工作区环境" });
    expect(environmentButton.querySelector("svg")).toHaveClass("lucide-bookmark");
    expect(screen.queryByRole("button", { name: /Open workspace in/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose workspace app" })).not.toBeInTheDocument();
    await user.click(environmentButton);
    const popover = await screen.findByRole("dialog", { name: "工作区环境" });

    expect(within(popover).getByText("工作树")).toBeInTheDocument();
    expect(within(popover).getByText("main")).toBeInTheDocument();
    expect(within(popover).getByText("+5")).toHaveClass("text-success");
    expect(within(popover).getByText("-1")).toHaveClass("text-danger");
    expect(within(popover).getAllByText("reference.png")).toHaveLength(1);
    expect(within(popover).getByText("notes.md")).toBeInTheDocument();
  });

  it("searches local branches, disables occupied worktrees, and switches branches", async () => {
    const nextEnvironment: WorkspaceEnvironmentSnapshot = {
      ...environment,
      git: {
        ...environment.git,
        branch: "codex/add-branch-selector",
        branches: environment.git.branches.map((branch) => ({
          ...branch,
          current: branch.name === "codex/add-branch-selector",
        })),
      },
    };
    const getWorkspaceEnvironment = vi.fn()
      .mockResolvedValueOnce(environment)
      .mockResolvedValueOnce(nextEnvironment);
    const bridge = installBridge({ getWorkspaceEnvironment });
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "查看工作区环境" }));
    await user.click(await screen.findByRole("button", { name: "main" }));
    const menu = await screen.findByRole("menu", { name: "分支" });
    expect(within(menu).getByRole("menuitemradio", { name: /feature\/occupied/ })).toBeDisabled();

    await user.type(within(menu).getByRole("searchbox", { name: "搜索分支" }), "codex");
    expect(within(menu).queryByRole("menuitemradio", { name: "main" })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitemradio", { name: "codex/add-branch-selector" }));

    expect(bridge.switchWorkspaceBranch).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/workspace",
      branchName: "codex/add-branch-selector",
    });
    expect(await screen.findByText("已切换到 codex/add-branch-selector。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "codex/add-branch-selector" })).toBeInTheDocument();
  });

  it("opens create and checkout from the branch list footer", async () => {
    installBridge();
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "查看工作区环境" }));
    await user.click(await screen.findByRole("button", { name: "main" }));
    const menu = await screen.findByRole("menu", { name: "分支" });
    await user.click(within(menu).getByRole("menuitem", { name: "创建并切换到新分支…" }));

    const dialog = await screen.findByRole("dialog", { name: "创建并切换分支" });
    expect(within(dialog).getByRole("textbox", { name: "分支名称" })).toHaveValue("actspace/environment-controls");
    expect(within(dialog).getByRole("button", { name: "关闭" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "创建并切换" })).toBeInTheDocument();
  });

  it("keeps the branch menu usable during a dev IPC snapshot version mismatch", async () => {
    installBridge({
      getWorkspaceEnvironment: vi.fn(async () => ({
        ...environment,
        git: { ...environment.git, branches: undefined },
      } as unknown as WorkspaceEnvironmentSnapshot)),
    });
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "查看工作区环境" }));
    await user.click(await screen.findByRole("button", { name: "main" }));

    const menu = await screen.findByRole("menu", { name: "分支" });
    expect(within(menu).getByRole("menuitemradio", { name: "main" })).toBeChecked();
    expect(within(menu).getByRole("menuitem", { name: "创建并切换到新分支…" })).toBeInTheDocument();
  });

  it("creates a branch from detached HEAD", async () => {
    const bridge = installBridge({
      getWorkspaceEnvironment: vi.fn(async () => ({
        ...environment,
        git: { ...environment.git, branch: undefined, detached: true },
      })),
    });
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "查看工作区环境" }));
    await user.click(await screen.findByRole("button", { name: "创建分支" }));
    const dialog = await screen.findByRole("dialog", { name: "创建并切换分支" });
    const input = within(dialog).getByRole("textbox", { name: "分支名称" });
    expect(input).toHaveValue("actspace/environment-controls");
    await user.clear(input);
    await user.type(input, "actspace/new-branch");
    await user.click(within(dialog).getByRole("button", { name: "创建并切换" }));

    expect(bridge.createWorkspaceBranch).toHaveBeenCalledWith({ workspaceRoot: "/tmp/workspace", branchName: "actspace/new-branch" });
  });

  it("starts the unified Git panel on New branch for detached HEAD", async () => {
    const bridge = installBridge({
      getWorkspaceEnvironment: vi.fn(async () => ({
        ...environment,
        git: { ...environment.git, branch: undefined, detached: true },
      })),
    });
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "查看工作区环境" }));
    await user.click(await screen.findByRole("button", { name: "提交或推送" }));
    const dialog = await screen.findByRole("dialog", { name: "提交或推送" });
    expect(within(dialog).getByRole("button", { name: /新分支/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "分支名称" })).toHaveValue("actspace/environment-controls");

    await user.click(within(dialog).getByRole("button", { name: "提交" }));
    expect(bridge.commitWorkspaceChanges).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/workspace",
      message: undefined,
      includeUnstagedChanges: true,
      branchName: "actspace/environment-controls",
    });
  });

  it("opens the unified Git panel and commits with its selected options", async () => {
    const bridge = installBridge();
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "查看工作区环境" }));
    await user.click(await screen.findByRole("button", { name: "提交或推送" }));
    const dialog = await screen.findByRole("dialog", { name: "提交或推送" });
    expect(within(dialog).getByRole("checkbox", { name: "包含未暂存的变更" })).toBeChecked();
    await user.type(within(dialog).getByRole("textbox", { name: "提交说明" }), "ship environment controls");
    await user.click(within(dialog).getByRole("button", { name: "提交" }));

    expect(bridge.commitWorkspaceChanges).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/workspace",
      message: "ship environment controls",
      includeUnstagedChanges: true,
      branchName: undefined,
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "提交或推送" })).not.toBeInTheDocument());
  });

  it("asks for a remote before commit and push when multiple remotes exist", async () => {
    const commitAndPushWorkspaceChanges = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        action: "commit_and_push",
        phase: "push",
        workspaceRoot: "/tmp/workspace",
        error: "remote_required",
        remotes: ["origin", "backup"],
      })
      .mockResolvedValueOnce({
        ok: true,
        action: "commit_and_push",
        phase: "push",
        workspaceRoot: "/tmp/workspace",
        branch: "main",
        commitCreated: true,
        commitHash: "feed123",
        pushed: true,
        remote: "backup",
      });
    installBridge({ commitAndPushWorkspaceChanges });
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "查看工作区环境" }));
    await user.click(await screen.findByRole("button", { name: "提交或推送" }));
    const commitDialog = await screen.findByRole("dialog", { name: "提交或推送" });
    await user.type(within(commitDialog).getByRole("textbox", { name: "提交说明" }), "push this");
    await user.click(within(commitDialog).getByRole("button", { name: "提交并推送" }));

    const remoteDialog = await screen.findByRole("dialog", { name: "选择远程仓库" });
    await user.click(within(remoteDialog).getByRole("button", { name: "backup" }));

    const input = { workspaceRoot: "/tmp/workspace", message: "push this", includeUnstagedChanges: true, branchName: undefined };
    expect(commitAndPushWorkspaceChanges).toHaveBeenNthCalledWith(1, input);
    expect(commitAndPushWorkspaceChanges).toHaveBeenNthCalledWith(2, { ...input, remote: "backup" });
  });

  it("reports a partial commit-and-push result without hiding the created commit", async () => {
    installBridge({
      commitAndPushWorkspaceChanges: vi.fn(async () => ({
        ok: false as const,
        action: "commit_and_push" as const,
        phase: "push" as const,
        workspaceRoot: "/tmp/workspace",
        branch: "main",
        commitCreated: true,
        commitHash: "partial1",
        error: "command_failed" as const,
        message: "Remote rejected the push.",
      })),
    });
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "查看工作区环境" }));
    await user.click(await screen.findByRole("button", { name: "提交或推送" }));
    const dialog = await screen.findByRole("dialog", { name: "提交或推送" });
    await user.type(within(dialog).getByRole("textbox", { name: "提交说明" }), "partial push");
    await user.click(within(dialog).getByRole("button", { name: "提交并推送" }));

    expect(await screen.findByText("已创建提交 partial1。Remote rejected the push.")).toBeInTheDocument();
  });
});
