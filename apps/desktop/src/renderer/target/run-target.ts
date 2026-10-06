import type { SessionWorktreeContext, WorkspaceGitContext } from "@actspace/shared";

/**
 * 15 S4：会话在哪里运行。代替散落各处的「有没有 hostId」判断。
 * `invalid` 是损坏的会话 key（见 `locateSession`）：既不是本机，也连不到任何 Host。
 */
export type RunTarget =
  | { readonly kind: "local"; readonly workspaceRoot?: string; readonly branch?: string; readonly worktree?: SessionWorktreeContext }
  | { readonly kind: "remote"; readonly hostId: string; readonly hostName: string; readonly workspaceId?: string; readonly workspaceName?: string }
  | { readonly kind: "invalid"; readonly key: string };

export type Capability = { readonly enabled: boolean; readonly reason?: string };

/** 每一项都对应一处被替换的「是不是远端」分支。 */
export type RunTargetCapabilities = {
  /** Composer 运行位置菜单里的「新建工作树」。 */
  readonly newWorktree: Capability;
  /** Composer 的分支选择。 */
  readonly branchSwitch: Capability;
  /** 打开会话中的文件：本机从工作区读，远端经 Host 下载。 */
  readonly localFileOpen: Capability;
  /** 终端等开发面板（WorkbenchLayout 的 developmentEnabled）。 */
  readonly terminal: Capability;
  /** Review 面板、改动摘要条、工作区标题栏控件。 */
  readonly review: Capability;
  /** 本机 Agent 只收图片；远端会话的附件经 Host 上传，图片和文件都收。Chat 形态另由 Composer 放开文件。 */
  readonly attachments: { readonly images: boolean; readonly files: boolean };
};

const REMOTE_UNSUPPORTED = "远端机器暂不支持";
const INVALID = "会话标识损坏";

const enabled: Capability = { enabled: true };
const off = (reason: string): Capability => ({ enabled: false, reason });

export function capabilitiesOf(target: RunTarget, env: { readonly gitStatus?: WorkspaceGitContext["status"] } = {}): RunTargetCapabilities {
  if (target.kind === "local") {
    const gitReady = env.gitStatus === "ready";
    const gitHasBranch = gitReady || env.gitStatus === "no_head";
    return {
      newWorktree: gitReady ? enabled : off("当前工作区不是可用的 Git 仓库"),
      branchSwitch: gitHasBranch ? enabled : off("当前工作区不是 Git 仓库"),
      localFileOpen: enabled,
      terminal: enabled,
      review: enabled,
      attachments: { images: true, files: false },
    };
  }
  const reason = target.kind === "remote" ? REMOTE_UNSUPPORTED : INVALID;
  return {
    newWorktree: off(reason),
    branchSwitch: off(reason),
    localFileOpen: off(reason),
    terminal: off(reason),
    review: off(reason),
    attachments: target.kind === "remote" ? { images: true, files: true } : { images: false, files: false },
  };
}
