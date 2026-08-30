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
    listWorkspaceOpenTools: vi.fn(async () => ({
      tools: [
        { id: "vscode" as const, label: "VS Code", available: true, iconDataUrl: "data:image/png;base64,AA==" },
        { id: "cursor" as const, label: "Cursor", available: false },
        { id: "finder" as const, label: "Finder", available: true, iconDataUrl: "data:image/png;base64,AQ==" },
        { id: "terminal" as const, label: "Terminal", available: true },
        { id: "iterm2" as const, label: "iTerm2", available: true },
      ],
    })),
    openWorkspaceInTool: vi.fn(async (input) => ({ ok: true as const, workspaceRoot: "/tmp/workspace", toolId: input.toolId })),
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

    const environmentButton = screen.getByRole("button", { name: "Show workspace environment" });
    expect(environmentButton.querySelector("svg")).toHaveClass("lucide-bookmark");
    await user.click(environmentButton);
    const popover = await screen.findByRole("dialog", { name: "Workspace environment" });

    expect(within(popover).getByText("Worktree")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Show workspace environment" }));
    await user.click(await screen.findByRole("button", { name: "main" }));
    const menu = await screen.findByRole("menu", { name: "Branches" });
    expect(within(menu).getByRole("menuitemradio", { name: /feature\/occupied/ })).toBeDisabled();

    await user.type(within(menu).getByRole("searchbox", { name: "Search branches" }), "codex");
    expect(within(menu).queryByRole("menuitemradio", { name: "main" })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitemradio", { name: "codex/add-branch-selector" }));

    expect(bridge.switchWorkspaceBranch).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/workspace",
      branchName: "codex/add-branch-selector",
    });
    expect(await screen.findByText("Switched to codex/add-branch-selector.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "codex/add-branch-selector" })).toBeInTheDocument();
  });

  it("opens create and checkout from the branch list footer", async () => {
    installBridge();
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "Show workspace environment" }));
    await user.click(await screen.findByRole("button", { name: "main" }));
    const menu = await screen.findByRole("menu", { name: "Branches" });
    await user.click(within(menu).getByRole("menuitem", { name: "Create and checkout new branch..." }));

    const dialog = await screen.findByRole("dialog", { name: "Create and checkout branch" });
    expect(within(dialog).getByRole("textbox", { name: "Branch name" })).toHaveValue("actspace/environment-controls");
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Create and checkout" })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Show workspace environment" }));
    await user.click(await screen.findByRole("button", { name: "main" }));

    const menu = await screen.findByRole("menu", { name: "Branches" });
    expect(within(menu).getByRole("menuitemradio", { name: "main" })).toBeChecked();
    expect(within(menu).getByRole("menuitem", { name: "Create and checkout new branch..." })).toBeInTheDocument();
  });

  it("lists local apps, disables unavailable apps, and remembers a selection", async () => {
    const bridge = installBridge();
    const user = userEvent.setup();
    renderControls();

    const chooser = screen.getByRole("button", { name: "Choose workspace app" });
    expect(chooser).not.toHaveClass("border-l");
    await user.click(chooser);
    const menu = await screen.findByRole("menu", { name: "Workspace apps" });
    expect(menu.querySelectorAll("img")).toHaveLength(2);
    expect(within(menu).getByRole("menuitem", { name: /Cursor/ })).toBeDisabled();

    await user.click(within(menu).getByRole("menuitem", { name: "VS Code" }));

    expect(bridge.openWorkspaceInTool).toHaveBeenCalledWith({ workspaceRoot: "/tmp/workspace", toolId: "vscode" });
    expect(window.localStorage.getItem("actspace.workspace.open-tool.v1")).toBe("vscode");
    expect(screen.getByRole("button", { name: "Open workspace in VS Code" })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Show workspace environment" }));
    await user.click(await screen.findByRole("button", { name: "Create branch" }));
    const dialog = await screen.findByRole("dialog", { name: "Create and checkout branch" });
    const input = within(dialog).getByRole("textbox", { name: "Branch name" });
    expect(input).toHaveValue("actspace/environment-controls");
    await user.clear(input);
    await user.type(input, "actspace/new-branch");
    await user.click(within(dialog).getByRole("button", { name: "Create and checkout" }));

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

    await user.click(screen.getByRole("button", { name: "Show workspace environment" }));
    await user.click(await screen.findByRole("button", { name: "Commit or push" }));
    const dialog = await screen.findByRole("dialog", { name: "Commit or push" });
    expect(within(dialog).getByRole("button", { name: /New branch/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Branch name" })).toHaveValue("actspace/environment-controls");

    await user.click(within(dialog).getByRole("button", { name: "Commit" }));
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

    await user.click(screen.getByRole("button", { name: "Show workspace environment" }));
    await user.click(await screen.findByRole("button", { name: "Commit or push" }));
    const dialog = await screen.findByRole("dialog", { name: "Commit or push" });
    expect(within(dialog).getByRole("checkbox", { name: "Include unstaged changes" })).toBeChecked();
    await user.type(within(dialog).getByRole("textbox", { name: "Commit message" }), "ship environment controls");
    await user.click(within(dialog).getByRole("button", { name: "Commit" }));

    expect(bridge.commitWorkspaceChanges).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/workspace",
      message: "ship environment controls",
      includeUnstagedChanges: true,
      branchName: undefined,
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Commit or push" })).not.toBeInTheDocument());
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

    await user.click(screen.getByRole("button", { name: "Show workspace environment" }));
    await user.click(await screen.findByRole("button", { name: "Commit or push" }));
    const commitDialog = await screen.findByRole("dialog", { name: "Commit or push" });
    await user.type(within(commitDialog).getByRole("textbox", { name: "Commit message" }), "push this");
    await user.click(within(commitDialog).getByRole("button", { name: "Commit and push" }));

    const remoteDialog = await screen.findByRole("dialog", { name: "Choose remote" });
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

    await user.click(screen.getByRole("button", { name: "Show workspace environment" }));
    await user.click(await screen.findByRole("button", { name: "Commit or push" }));
    const dialog = await screen.findByRole("dialog", { name: "Commit or push" });
    await user.type(within(dialog).getByRole("textbox", { name: "Commit message" }), "partial push");
    await user.click(within(dialog).getByRole("button", { name: "Commit and push" }));

    expect(await screen.findByText("Commit partial1 was created. Remote rejected the push.")).toBeInTheDocument();
  });
});
