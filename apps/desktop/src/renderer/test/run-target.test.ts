import { describe, expect, it } from "vitest";
import { capabilitiesOf, localExecutionRoot, type RunTarget } from "../target/run-target";

const local: RunTarget = { kind: "local", workspaceRoot: "/repo", branch: "main" };
const worktree: RunTarget = { kind: "local", workspaceRoot: "/repo-wt", branch: "feature", worktree: { kind: "worktree", sourceWorkspaceRoot: "/repo", workspaceRoot: "/repo-wt", baseBranch: "main", branch: "feature", baseCommit: "abc", createdAt: "2026-10-06T00:00:00Z" } };
const remote: RunTarget = { kind: "remote", hostId: "server", hostName: "Cloud", workspaceId: "w1", workspaceName: "api" };

describe("capabilitiesOf", () => {
  it("uses the worktree execution root and never a local fallback for a remote target", () => {
    expect(localExecutionRoot({ ...worktree, workspaceRoot: "/repo" }, "/source")).toBe("/repo-wt");
    expect(localExecutionRoot(local, "/source")).toBe("/repo");
    expect(localExecutionRoot(remote, "/source")).toBeUndefined();
    expect(localExecutionRoot({ kind: "invalid", key: "broken" }, "/source")).toBeUndefined();
  });
  it("enables everything for a local Git workspace and keeps attachments to images", () => {
    const capabilities = capabilitiesOf(local, { gitStatus: "ready" });
    for (const key of ["newWorktree", "branchSwitch", "localFileOpen", "terminal", "review"] as const) expect(capabilities[key]).toEqual({ enabled: true });
    expect(capabilities.attachments).toEqual({ images: true, files: false });
  });

  it("disables Git-only actions with a reason when the local workspace is not a repository", () => {
    const capabilities = capabilitiesOf(local, { gitStatus: "not_repository" });
    expect(capabilities.newWorktree.enabled).toBe(false);
    expect(capabilities.newWorktree.reason).toBeTruthy();
    expect(capabilities.branchSwitch.enabled).toBe(false);
    expect(capabilities.terminal.enabled).toBe(true);
    expect(capabilitiesOf(local, { gitStatus: "no_head" }).branchSwitch.enabled).toBe(true);
    expect(capabilitiesOf(local, { gitStatus: "no_head" }).newWorktree).toEqual({ enabled: false, reason: "需要先创建提交" });
  });

  it("treats a worktree session like the local machine", () => {
    expect(capabilitiesOf(worktree, { gitStatus: "ready" })).toEqual(capabilitiesOf(local, { gitStatus: "ready" }));
  });

  it("disables local-only actions on a remote target and says why", () => {
    const capabilities = capabilitiesOf(remote, { gitStatus: "ready" });
    expect(capabilities.newWorktree).toEqual({ enabled: false, reason: "远端机器暂不支持" });
    for (const key of ["branchSwitch", "localFileOpen", "terminal", "review"] as const) expect(capabilities[key]).toEqual({ enabled: false, reason: "远端机器暂不支持" });
    expect(capabilities.attachments).toEqual({ images: true, files: true });
  });

  it("disables everything for a corrupt session key", () => {
    const capabilities = capabilitiesOf({ kind: "invalid", key: "host:***" });
    expect(capabilities.newWorktree).toEqual({ enabled: false, reason: "会话标识损坏" });
    expect(capabilities.attachments).toEqual({ images: false, files: false });
  });
});
