// 应用启动态与关闭通知：main 在窗口创建时交给 renderer 的一次性事实。

export type BootstrapState = {
  appVersion: string;
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  workspaceRoot: string;
};

export type AppBootstrapStateInput = {
  appVersion: string;
  dataRoot: string;
  sessionRoot?: string;
  logRoot?: string;
  tmpRoot?: string;
  workspaceRoot?: string;
};

export function createBootstrapState(input: AppBootstrapStateInput): BootstrapState {
  return {
    appVersion: input.appVersion,
    dataRoot: input.dataRoot,
    sessionRoot: input.sessionRoot ?? `${input.dataRoot}/sessions`,
    logRoot: input.logRoot ?? `${input.dataRoot}/logs`,
    tmpRoot: input.tmpRoot ?? `${input.dataRoot}/tmp`,
    workspaceRoot: input.workspaceRoot ?? input.dataRoot
  };
}

export type AppShutdownNotice = {
  reason: "normal" | "local_update";
};
