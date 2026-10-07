import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { App } from "../App";
import { setupBridge } from "./helpers/bridge";
import { createMockSession, sessionProjection } from "../mock/mock-db";
import type { SessionCreateInput } from "@actspace/shared";

it("defers local creation until first send and preserves the returned worktree cwd", async () => {
  const user = userEvent.setup();
  const create = vi.fn(async (input: SessionCreateInput) => {
    const session = createMockSession(bridge.db, { ...input, workspaceRoot: "/worktrees/isolated" });
    const projection = sessionProjection(session);
    return { ...projection, snapshot: { ...projection.snapshot, worktree: { kind: "worktree", workspaceRoot: "/worktrees/isolated", sourceWorkspaceRoot: bridge.db.bootstrap.workspaceRoot, branch: "codex/isolated", baseBranch: "main", baseCommit: "abc", createdAt: session.createdAt } } };
  });
  const setWorkspace = vi.fn(async () => ({ ok: true }));
  const bridge = setupBridge({
    "sessions.create": create,
    "sessions.setWorkspace": setWorkspace,
    "workspaces.getGitContext": async () => ({ status: "ready", workspaceRoot: bridge.db.bootstrap.workspaceRoot, repositoryRoot: bridge.db.bootstrap.workspaceRoot, currentBranch: "main", headCommit: "abc", branches: [{ name: "main", current: true }] }),
  });
  render(<App />);
  await user.click(screen.getByRole("button", { name: "新建会话" }));
  expect(create).not.toHaveBeenCalled();
  await user.click(await screen.findByRole("button", { name: "选择运行位置" }));
  const option = await screen.findByRole("menuitemradio", { name: /新建工作树/ });
  await waitFor(() => expect(option).not.toHaveAttribute("aria-disabled", "true"));
  await user.click(option);
  const input = screen.getByRole("textbox", { name: /消息|输入/ });
  await user.type(input, "Check the worktree");
  await user.click(screen.getByLabelText("发送消息"));
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ runLocation: "worktree", branch: "main", workspaceRoot: bridge.db.bootstrap.workspaceRoot })));
  expect(setWorkspace).not.toHaveBeenCalled();
});
