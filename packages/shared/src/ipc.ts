import type { ModelId } from "./model-config";

export type BootstrapState = {
  appVersion: string;
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  workspaceRoot: string;
};

export { DEFAULT_MODEL_ID, MODEL_LIST, MODEL_REGISTRY, type ModelId, type ModelSpec, resolveModelSpec } from "./model-config";

// ─── IPC 输入类型 ───

export type RunTurnInput = {
  sessionId: string;
  turnId: string;
  userInput: string;
  model?: ModelId;
  thinkingEnabled?: boolean;
};

export type AbortTurnInput = {
  sessionId: string;
  turnId: string;
};

export type ApprovalDecideInput = {
  requestId: string;
  decision: "approve_once" | "deny" | "allow_similar";
};

export type ApprovalDecideResult = {
  ok: boolean;
  reason?: string;
};

export type ApprovalListPendingInput = {
  sessionId?: string;
};

export type PendingApprovalInfo = {
  requestId: string;
  toolName: string;
  summary: string;
  reason: string;
  riskLevel?: string;
  command?: string;
  createdAt: number;
  expiresAt: number;
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
  contextState?: import("./session").ContextState | null;
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
