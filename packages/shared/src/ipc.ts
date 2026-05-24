export type BootstrapState = {
  appVersion: string;
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  workspaceRoot: string;
};

export type RunTurnInput = {
  sessionId: string;
  turnId: string;
  userInput: string;
};

export type SessionListItem = {
  id: string;
  title: string;
  updatedAt: string;
  turnCount: number;
};

export type SessionRecord = {
  meta: import("./session").SessionMeta;
  events: import("./session").SessionEvent[];
  messageBlocks?: import("./session").MessageBlock[];
  contextSnapshot?: import("./session").ContextUsageSnapshot | null;
  diffSummary?: import("./session").SessionDiffSummary;
};

export type SessionGetInput = {
  sessionId: string;
};

export type SessionCreateInput = {
  title?: string;
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
