import type {
  AgentTurnResult,
  RunTurnInput,
  RuntimeStreamEvent,
  SessionMeta,
  SessionWorktreeContext,
  WorkspacePreparationPayload,
} from "@actspace/shared";
import type { AgentConfig, AgentDeps, AgentRuntimeContext } from "../engine/create-agent-deps";
import type { CacheAuditTracker } from "../observability";
import type { ApprovalGate } from "../tools/scheduler";

export type RuntimePersistenceMode = "persistent" | "ephemeral";
export type RuntimeInteractionMode = "desktop" | "cli-headless" | "cli-interactive";

export interface RuntimeRoots {
  dataRoot: string;
  sessionRoot: string;
  tmpRoot: string;
  logRoot?: string;
  defaultWorkspaceRoot: string;
}

export interface RuntimeTurnRequest extends RunTurnInput {
  roots: RuntimeRoots;
  persistenceMode: RuntimePersistenceMode;
  interactionMode: RuntimeInteractionMode;
  /** Ephemeral hosts have no session meta, so their workspace must be explicit. */
  workspaceRoot?: string;
}

export interface RuntimeContextProvider {
  load(
    request: RuntimeTurnRequest,
    workspaceRoot: string,
    sessionMeta: SessionMeta | null,
  ): Promise<Pick<
    AgentRuntimeContext,
    "systemPrompt" | "systemPromptSegments" | "additionalWritableRoots" | "browserBridgeSocketPath"
  >>;
}

export interface RuntimeModelResolver {
  resolveConfig(input: {
    request: RuntimeTurnRequest;
    workspaceRoot: string;
    runtimeContext: AgentRuntimeContext;
    approvalGate?: ApprovalGate;
  }): Promise<AgentConfig> | AgentConfig;
}

export interface RuntimeEventSink {
  emit(event: RuntimeStreamEvent): Promise<void> | void;
}

export interface RuntimeApprovalBroker extends ApprovalGate {
  setCurrentTurn?(sessionId: string, turnId: string): void;
  abortTurn?(sessionId: string, turnId: string): unknown;
  dispose?(): Promise<void> | void;
}

export interface PreparedRuntimeWorkspace {
  workspaceRoot: string;
  workspaceId?: string;
  worktree?: SessionWorktreeContext;
  preparationEvent?: WorkspacePreparationPayload;
  rollback?: () => Promise<void>;
}

export interface WorkspaceExecutionProvider {
  prepare(input: {
    request: RuntimeTurnRequest;
    roots: RuntimeRoots;
    sessionMeta: SessionMeta | null;
  }): Promise<PreparedRuntimeWorkspace>;
}

export interface RuntimeTitleHook {
  afterCommittedTurn(input: {
    request: RuntimeTurnRequest;
    sessionMeta: SessionMeta | null;
    priorMessageCount: number;
    result: AgentTurnResult;
    deps: AgentDeps;
  }): Promise<void> | void;
}

export interface RuntimeHarnessObserver {
  createCacheAudit?(input: {
    request: RuntimeTurnRequest;
    deps: AgentDeps;
    defaultTracker: CacheAuditTracker;
  }): CacheAuditTracker | undefined;
  afterHarness?(input: {
    request: RuntimeTurnRequest;
    result: AgentTurnResult;
    deps: AgentDeps;
  }): Promise<void> | void;
}

export type RuntimeDiagnostic = {
  level: "warn" | "error";
  code: string;
  message: string;
  error?: unknown;
};

export interface AgentRuntimeOptions {
  contextProvider: RuntimeContextProvider;
  modelResolver: RuntimeModelResolver;
  eventSink: RuntimeEventSink;
  approvalBroker?: RuntimeApprovalBroker;
  workspaceExecutionProvider?: WorkspaceExecutionProvider;
  titleHook?: RuntimeTitleHook;
  harnessObserver?: RuntimeHarnessObserver;
  harnessLog?: (message: string, details?: Record<string, unknown>) => void;
  onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void;
  createDependencies?: (config: AgentConfig, options: { sessionPath?: string }) => Promise<AgentDeps>;
  runHarness?: typeof import("../engine/bridge").runTurnWithAgent;
}

export type AgentRuntimeErrorCode =
  | "RUNTIME_DISPOSED"
  | "SESSION_ACTIVE"
  | "WORKSPACE_PREPARATION_UNAVAILABLE"
  | "PERSISTENCE_ERROR"
  | "RUNTIME_ERROR";

export class AgentRuntimeError extends Error {
  constructor(
    public readonly code: AgentRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentRuntimeError";
  }
}

export interface AgentRuntime {
  runTurn(request: RuntimeTurnRequest): Promise<AgentTurnResult>;
  abortTurn(ref: { sessionId: string; turnId: string }): boolean;
  isSessionActive(sessionId: string): boolean;
  dispose(): Promise<void>;
}
