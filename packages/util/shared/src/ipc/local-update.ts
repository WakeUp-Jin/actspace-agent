// 本地更新 IPC（`localUpdate.*`）：从源码目录重新打包并替换当前应用。

export type LocalUpdateErrorCode =
  | "invalid_source"
  | "not_packaged"
  | "not_macos"
  | "not_writable"
  | "missing_source"
  | "already_running"
  | "spawn_failed";

export type LocalUpdateProgressPhase =
  | "idle"
  | "starting"
  | "building"
  | "ready_to_replace"
  | "waiting_for_exit"
  | "replacing"
  | "succeeded"
  | "failed";

export type LocalUpdateProgress = {
  phase: LocalUpdateProgressPhase;
  message: string;
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
};

export type LocalUpdateState = {
  sourceRoot: string | null;
  sourceValid: boolean;
  sourceError?: LocalUpdateErrorCode;
  appExecutablePath?: string;
  appIsPackaged?: boolean;
  appPath: string | null;
  installParent: string | null;
  canUpdate: boolean;
  reason?: string;
  logPath: string;
  running: boolean;
  lastStartedAt?: string;
  progress: LocalUpdateProgress;
};

export type LocalUpdateSelectSourceResult = {
  canceled: boolean;
  state: LocalUpdateState;
};

export type LocalUpdateStartResult = {
  ok: boolean;
  state: LocalUpdateState;
  error?: LocalUpdateErrorCode;
  message?: string;
};
