import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentTurnResult,
  ComposerAttachment,
  RuntimeStreamEvent,
  SessionMeta,
  WorkspacePreparationPayload,
} from "@actspace/shared";
import {
  createPersistedSessionEvent,
  userMessageToEvents,
} from "../adapters";
import {
  createAgentForSession,
  type AgentDeps,
  type AgentRuntimeContext,
} from "../engine/create-agent-deps";
import { runTurnWithAgent } from "../engine/bridge";
import {
  cleanupOldAgentRunLogs,
  createAgentRunLogger,
  createCacheAuditTracker,
  type AgentRunLogger,
} from "../observability";
import { cleanupOldToolOutputs } from "../tools";
import {
  appendEvents,
  createSessionStorePaths,
  readMeta,
  updateMeta,
  writeSessionResult,
} from "../persistence";
import type {
  AgentRuntime,
  AgentRuntimeOptions,
  PreparedRuntimeWorkspace,
  RuntimeDiagnostic,
  RuntimeTurnRequest,
} from "./types";
import { AgentRuntimeError } from "./types";

type ActiveTurn = {
  turnId: string;
  abort: () => void;
  done: Promise<void>;
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export function createAgentHostRuntime(options: AgentRuntimeOptions): AgentRuntime {
  return new DefaultAgentRuntime(options);
}

class DefaultAgentRuntime implements AgentRuntime {
  private readonly activeTurns = new Map<string, ActiveTurn>();
  private readonly createDependencies: NonNullable<AgentRuntimeOptions["createDependencies"]>;
  private readonly runHarness: NonNullable<AgentRuntimeOptions["runHarness"]>;
  private disposed = false;

  constructor(private readonly options: AgentRuntimeOptions) {
    this.createDependencies = options.createDependencies ?? createAgentForSession;
    this.runHarness = options.runHarness ?? runTurnWithAgent;
  }

  runTurn(request: RuntimeTurnRequest): Promise<AgentTurnResult> {
    if (this.disposed) {
      return Promise.reject(new AgentRuntimeError("RUNTIME_DISPOSED", "Agent Runtime has been disposed."));
    }
    if (this.activeTurns.has(request.sessionId)) {
      return Promise.reject(new AgentRuntimeError(
        "SESSION_ACTIVE",
        `Session ${request.sessionId} already has an active turn.`,
      ));
    }

    let abortRequested = false;
    let abortHarness: (() => void) | undefined;
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const active: ActiveTurn = {
      turnId: request.turnId,
      done,
      abort: () => {
        abortRequested = true;
        abortHarness?.();
        this.options.approvalBroker?.abortTurn?.(request.sessionId, request.turnId);
      },
    };
    this.activeTurns.set(request.sessionId, active);

    return this.executeTurn(request, {
      isAbortRequested: () => abortRequested,
      setAbortHarness: (abort) => {
        abortHarness = abort;
      },
    }).finally(() => {
      if (this.activeTurns.get(request.sessionId) === active) {
        this.activeTurns.delete(request.sessionId);
      }
      resolveDone();
    });
  }

  abortTurn(ref: { sessionId: string; turnId: string }): boolean {
    const active = this.activeTurns.get(ref.sessionId);
    if (!active || active.turnId !== ref.turnId) return false;
    active.abort();
    return true;
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeTurns.has(sessionId);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const turns = [...this.activeTurns.values()];
    turns.forEach((turn) => turn.abort());
    await Promise.allSettled(turns.map((turn) => turn.done));
    await this.options.approvalBroker?.dispose?.();
  }

  private async executeTurn(
    request: RuntimeTurnRequest,
    abortControl: {
      isAbortRequested: () => boolean;
      setAbortHarness: (abort: (() => void) | undefined) => void;
    },
  ): Promise<AgentTurnResult> {
    const eventQueue = new OrderedEventQueue(this.options.eventSink, (diagnostic) => this.diagnose(diagnostic));
    const emit = (event: RuntimeStreamEvent) => eventQueue.emit(event);
    const persistent = request.persistenceMode === "persistent";
    const sessionPaths = createSessionStorePaths(join(request.roots.sessionRoot, request.sessionId));
    let sessionMeta = persistent ? await readMeta(sessionPaths.metaPath) : null;
    const originalWorkspaceRoot = sessionMeta?.workspaceRoot
      ?? request.workspaceRoot
      ?? request.roots.defaultWorkspaceRoot;
    let prepared: PreparedRuntimeWorkspace | undefined;
    let deps: AgentDeps | undefined;
    let runLogger: AgentRunLogger | undefined;
    let resultStarted = false;

    this.options.approvalBroker?.setCurrentTurn?.(request.sessionId, request.turnId);
    emit({ type: "turn_started", sessionId: request.sessionId, turnId: request.turnId });

    try {
      runLogger = await this.prepareRunLogger(request);
      prepared = await this.prepareWorkspace(request, sessionMeta, emit);
      const workspaceRoot = prepared.workspaceRoot;

      if (persistent && request.executionContext) {
        const metaWrite = await updateMeta(sessionPaths.metaPath, {
          ...(prepared.workspaceId ? { workspaceId: prepared.workspaceId } : {}),
          workspaceRoot,
          worktree: prepared.worktree ?? null,
        });
        if (!metaWrite.ok) {
          throw new AgentRuntimeError("PERSISTENCE_ERROR", metaWrite.error);
        }
        sessionMeta = await readMeta(sessionPaths.metaPath);
      }

      const selectedSkills = [...new Set(
        (request.selectedSkills ?? []).map((name) => name.trim()).filter(Boolean),
      )];
      const mode = request.mode ?? "agent";
      const hostContext = await this.options.contextProvider.load(
        { ...request, mode, selectedSkills },
        workspaceRoot,
        sessionMeta,
      );
      const runtimeContext: AgentRuntimeContext = {
        tmpRoot: request.roots.tmpRoot,
        artifactRoot: join(sessionPaths.root, "artifacts", "generated-images"),
        sessionId: request.sessionId,
        turnId: request.turnId,
        toolProfile: mode === "chat" ? "none" : mode === "plan" ? "read-only" : "full",
        ...hostContext,
      };
      const config = await this.options.modelResolver.resolveConfig({
        request,
        workspaceRoot,
        runtimeContext,
        approvalGate: this.options.approvalBroker,
      });
      deps = await this.createDependencies(config, {
        ...(persistent ? { sessionPath: sessionPaths.sessionPath } : {}),
      });
      const priorMessageCount = deps.contextManager.getMessageCount();

      const userEvents = userMessageToEvents({
        role: "user",
        content: request.userInput,
        timestamp: Date.now(),
        source: "user",
      }, request.sessionId, request.turnId, { attachments: request.attachments });
      const preparationEvents = prepared.preparationEvent
        ? [createPersistedSessionEvent(
            request.sessionId,
            request.turnId,
            "workspace_preparation",
            prepared.preparationEvent,
          )]
        : [];

      if (persistent) {
        const startWrite = await appendEvents(
          sessionPaths.sessionPath,
          [...userEvents, ...preparationEvents],
        );
        if (!startWrite.ok) {
          throw new AgentRuntimeError("PERSISTENCE_ERROR", startWrite.error);
        }
      }

      if (prepared.preparationEvent) {
        emit({
          type: "workspace_preparation_finished",
          sessionId: request.sessionId,
          turnId: request.turnId,
          payload: prepared.preparationEvent,
        });
      }

      if (abortControl.isAbortRequested()) {
        const abortedHarnessResult: AgentTurnResult = {
          sessionId: request.sessionId,
          turnId: request.turnId,
          events: persistent ? [] : [...userEvents, ...preparationEvents],
          contextSnapshot: deps.contextManager.getUsageSnapshot(),
          status: "aborted",
        };
        if (persistent) {
          const persistedResult = await writeSessionResult(sessionPaths, abortedHarnessResult);
          if (!persistedResult.ok) {
            throw new AgentRuntimeError("PERSISTENCE_ERROR", persistedResult.error);
          }
        }
        const abortedResult = persistent
          ? { ...abortedHarnessResult, events: [...userEvents, ...preparationEvents] }
          : abortedHarnessResult;
        emitTerminalEvent(emit, abortedResult);
        await eventQueue.flush();
        return abortedResult;
      }

      const modelAttachments = await prepareAttachmentsForModel(
        request.attachments,
        deps.modelDefinition.capabilities.input.includes("image"),
      );
      const defaultCacheAudit = createCacheAuditTracker({
        rootDir: join(request.roots.dataRoot, "cache-audit"),
        sessionId: request.sessionId,
        turnId: request.turnId,
        provider: deps.modelDefinition.provider,
        model: deps.modelDefinition.apiModel,
        modelId: deps.modelKey,
        thinkingEnabled: request.thinkingEnabled ?? deps.thinkingEnabled,
      });
      const cacheAudit = this.options.harnessObserver?.createCacheAudit
        ? this.options.harnessObserver.createCacheAudit({ request, deps, defaultTracker: defaultCacheAudit })
        : defaultCacheAudit;
      const abortableDeps = {
        ...deps,
        cacheAudit,
        abort: undefined as (() => void) | undefined,
      };
      const resultPromise = this.runHarness(
        {
          sessionId: request.sessionId,
          turnId: request.turnId,
          userInput: request.userInput,
          attachments: request.attachments,
          modelAttachments,
          thinkingEnabled: request.thinkingEnabled,
          reasoningEffort: request.reasoningEffort,
        },
        abortableDeps,
        {
          onStreamEvent: emit,
          runLogger,
          includeUserEvent: !persistent,
          emitTerminalEvent: false,
          emitTurnStartedEvent: false,
          onLog: this.options.harnessLog,
        },
      );
      abortControl.setAbortHarness(abortableDeps.abort);
      if (abortControl.isAbortRequested()) abortableDeps.abort?.();
      resultStarted = true;
      const harnessResult = await resultPromise;
      await this.runHarnessObserver(request, harnessResult, deps);
      const result = persistent
        ? { ...harnessResult, events: [...userEvents, ...preparationEvents, ...harnessResult.events] }
        : harnessResult;

      if (persistent) {
        const persistedResult = await writeSessionResult(sessionPaths, harnessResult);
        if (!persistedResult.ok) {
          throw new AgentRuntimeError("PERSISTENCE_ERROR", persistedResult.error);
        }
      }

      emitTerminalEvent(emit, result);
      await eventQueue.flush();
      if (persistent) {
        await this.runTitleHook(request, sessionMeta, priorMessageCount, result, deps);
      }
      return result;
    } catch (error) {
      if (prepared?.rollback && !resultStarted) {
        await this.rollbackWorkspace(prepared, persistent ? sessionPaths.metaPath : undefined, originalWorkspaceRoot);
      }
      const runtimeError = normalizeRuntimeError(error);
      emit({
        type: "turn_failed",
        sessionId: request.sessionId,
        turnId: request.turnId,
        error: {
          code: runtimeError.code,
          message: runtimeError.message,
          recoverable: false,
        },
      });
      await eventQueue.flush();
      throw runtimeError;
    } finally {
      abortControl.setAbortHarness(undefined);
      this.options.approvalBroker?.abortTurn?.(request.sessionId, request.turnId);
      await deps?.toolManager.dispose().catch((error) => {
        this.diagnose({
          level: "error",
          code: "TOOL_DISPOSE_FAILED",
          message: "Failed to dispose ToolManager.",
          error,
        });
      });
    }
  }

  private async prepareWorkspace(
    request: RuntimeTurnRequest,
    sessionMeta: SessionMeta | null,
    emit: (event: RuntimeStreamEvent) => void,
  ): Promise<PreparedRuntimeWorkspace> {
    const fallbackRoot = sessionMeta?.workspaceRoot
      ?? request.workspaceRoot
      ?? request.roots.defaultWorkspaceRoot;
    if (!request.executionContext) return { workspaceRoot: fallbackRoot };
    if (!this.options.workspaceExecutionProvider) {
      throw new AgentRuntimeError(
        "WORKSPACE_PREPARATION_UNAVAILABLE",
        "This Runtime host does not support workspace preparation.",
      );
    }
    if ((sessionMeta?.turnCount ?? 0) > 0) {
      throw new Error("Execution context can only be prepared before the first turn.");
    }
    if (request.executionContext.runLocation === "worktree") {
      emit({
        type: "workspace_preparation_started",
        sessionId: request.sessionId,
        turnId: request.turnId,
        kind: "worktree",
        sourceWorkspaceRoot: request.executionContext.sourceWorkspaceRoot,
        baseBranch: request.executionContext.branch ?? "",
      });
    }
    return this.options.workspaceExecutionProvider.prepare({
      request,
      roots: request.roots,
      sessionMeta,
    });
  }

  private async rollbackWorkspace(
    prepared: PreparedRuntimeWorkspace,
    metaPath: string | undefined,
    originalWorkspaceRoot: string,
  ): Promise<void> {
    await prepared.rollback?.();
    if (!metaPath) return;
    const restored = await updateMeta(metaPath, {
      workspaceRoot: originalWorkspaceRoot,
      worktree: null,
    });
    if (!restored.ok) {
      this.diagnose({
        level: "error",
        code: "WORKSPACE_ROLLBACK_META_FAILED",
        message: restored.error,
      });
    }
  }

  private async prepareRunLogger(request: RuntimeTurnRequest): Promise<AgentRunLogger | undefined> {
    if (!request.roots.logRoot) return undefined;
    try {
      await cleanupOldAgentRunLogs(request.roots.logRoot);
      await cleanupOldToolOutputs(request.roots.tmpRoot);
      return await createAgentRunLogger({
        logRoot: request.roots.logRoot,
        sessionId: request.sessionId,
        turnId: request.turnId,
      });
    } catch (error) {
      this.diagnose({
        level: "warn",
        code: "RUN_LOG_UNAVAILABLE",
        message: "Failed to prepare Agent run logging.",
        error,
      });
      return undefined;
    }
  }

  private async runTitleHook(
    request: RuntimeTurnRequest,
    sessionMeta: SessionMeta | null,
    priorMessageCount: number,
    result: AgentTurnResult,
    deps: AgentDeps,
  ): Promise<void> {
    try {
      await this.options.titleHook?.afterCommittedTurn({
        request,
        sessionMeta,
        priorMessageCount,
        result,
        deps,
      });
    } catch (error) {
      this.diagnose({
        level: "warn",
        code: "TITLE_HOOK_FAILED",
        message: "Session title hook failed after the committed turn.",
        error,
      });
    }
  }

  private async runHarnessObserver(
    request: RuntimeTurnRequest,
    result: AgentTurnResult,
    deps: AgentDeps,
  ): Promise<void> {
    try {
      await this.options.harnessObserver?.afterHarness?.({ request, result, deps });
    } catch (error) {
      this.diagnose({
        level: "warn",
        code: "HARNESS_OBSERVER_FAILED",
        message: "Runtime Harness observer failed.",
        error,
      });
    }
  }

  private diagnose(diagnostic: RuntimeDiagnostic): void {
    if (this.options.onDiagnostic) {
      this.options.onDiagnostic(diagnostic);
      return;
    }
    const log = diagnostic.level === "error" ? console.error : console.warn;
    log(`[agent-runtime] ${diagnostic.code}: ${diagnostic.message}`, diagnostic.error ?? "");
  }
}

class OrderedEventQueue {
  private pending = Promise.resolve();

  constructor(
    private readonly sink: AgentRuntimeOptions["eventSink"],
    private readonly diagnose: (diagnostic: RuntimeDiagnostic) => void,
  ) {}

  emit(event: RuntimeStreamEvent): void {
    this.pending = this.pending
      .then(() => this.sink.emit(event))
      .catch((error) => {
        this.diagnose({
          level: "warn",
          code: "EVENT_SINK_FAILED",
          message: `Runtime event sink failed for ${event.type}.`,
          error,
        });
      });
  }

  flush(): Promise<void> {
    return this.pending;
  }
}

function emitTerminalEvent(
  emit: (event: RuntimeStreamEvent) => void,
  result: AgentTurnResult,
): void {
  if (result.status === "aborted") {
    emit({ type: "turn_aborted", sessionId: result.sessionId, turnId: result.turnId });
    return;
  }
  if (result.status === "failed") {
    emit({
      type: "turn_failed",
      sessionId: result.sessionId,
      turnId: result.turnId,
      error: {
        code: result.error?.code ?? "AGENT_ERROR",
        message: result.error?.message ?? "Agent turn failed.",
        recoverable: false,
      },
    });
    return;
  }
  emit({
    type: "turn_finished",
    sessionId: result.sessionId,
    turnId: result.turnId,
    resultEventIds: result.events.map((event) => event.id),
  });
}

async function prepareAttachmentsForModel(
  attachments: ComposerAttachment[] | undefined,
  supportsImages: boolean,
): Promise<ComposerAttachment[] | undefined> {
  if (!supportsImages || !attachments?.some((attachment) => attachment.kind === "image" && attachment.path)) {
    return attachments;
  }
  return Promise.all(attachments.map(async (attachment) => {
    if (attachment.kind !== "image" || !attachment.path) return attachment;
    const extension = attachment.name.match(/\.[^.\\/]+$/)?.[0]?.toLowerCase() ?? "";
    const mimeType = attachment.mimeType || IMAGE_MIME_BY_EXT[extension] || "image/png";
    const bytes = await readFile(attachment.path);
    return {
      ...attachment,
      mimeType,
      path: `data:${mimeType};base64,${bytes.toString("base64")}`,
    };
  }));
}

function normalizeRuntimeError(error: unknown): AgentRuntimeError {
  if (error instanceof AgentRuntimeError) return error;
  return new AgentRuntimeError(
    "RUNTIME_ERROR",
    error instanceof Error ? error.message : String(error),
  );
}
