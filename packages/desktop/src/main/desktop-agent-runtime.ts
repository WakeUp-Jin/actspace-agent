import type { BrowserWindow } from "electron";
import {
  buildAgentConfig,
  buildAgentConfigFromRuntime,
  createAgentHostRuntime,
  generateSessionTitle,
  isDefaultSessionTitle,
  updateMeta,
  type AgentRuntime,
  type AgentRuntimeContext,
  type RuntimeAgentRunRequest,
} from "@actspace/agent-core";
import type { ComposerMode } from "@actspace/shared";
import type { PendingApprovalRegistry } from "./approval-registry";
import type { AppDataRoots } from "./agent-run";
import type { ModelRuntimeService } from "./model-runtime-service";
import {
  prepareExecutionContext,
  rollbackPreparedExecution,
} from "./workspace-git-context-service";

export type AgentRuntimeContextLoader = (
  workspaceRoot: string,
  options: { mode: ComposerMode; selectedSkills: string[] },
) => Promise<Pick<
  AgentRuntimeContext,
  "systemPrompt" | "systemPromptSegments" | "additionalWritableRoots" | "browserBridgeSocketPath"
>>;

export type DesktopAgentRuntimeOptions = {
  getMainWindow: () => BrowserWindow | undefined;
  approvalRegistry?: PendingApprovalRegistry;
  loadRuntimeContext?: AgentRuntimeContextLoader;
  modelRuntime?: ModelRuntimeService;
};

export function createDesktopAgentRuntime(options: DesktopAgentRuntimeOptions): AgentRuntime {
  return createAgentHostRuntime({
    contextProvider: {
      load: async (request, workspaceRoot) => options.loadRuntimeContext?.(workspaceRoot, {
        mode: request.mode ?? "agent",
        selectedSkills: request.selectedSkills ?? [],
      }) ?? {},
    },
    modelResolver: {
      resolveConfig: ({ request, workspaceRoot, runtimeContext, approvalGate }) => {
        if (!options.modelRuntime) {
          return buildAgentConfig({
            model: request.model,
            modelKey: request.modelKey,
            thinkingEnabled: request.thinkingEnabled,
            reasoningEffort: request.reasoningEffort,
            exploreModelId: request.exploreModelId,
          }, workspaceRoot, approvalGate, runtimeContext);
        }

        const main = options.modelRuntime.resolveMainModel(request.modelKey ?? request.model);
        if (!("model" in main)) {
          throw createModelUnavailableError(main.message, main.modelKey, main.reason ?? main.code);
        }
        const utility = options.modelRuntime.resolveUtilityModel(main.model);
        const explore = options.modelRuntime.resolveExploreModel(main.model);
        const imageInspection = options.modelRuntime.resolveImageInspectionModel();
        if (!("model" in utility) || !("model" in explore)) {
          throw createModelUnavailableError("任务模型无法解析。", undefined, "task_model_unavailable");
        }
        return buildAgentConfigFromRuntime({
          main: { definition: main.model.definition, runtime: main.model.providerRuntime },
          utility: { definition: utility.model.definition, runtime: utility.model.providerRuntime },
          explore: { definition: explore.model.definition, runtime: explore.model.providerRuntime },
          ...("model" in imageInspection && {
            imageInspection: {
              definition: imageInspection.model.definition,
              runtime: imageInspection.model.providerRuntime,
            },
          }),
          thinkingEnabled: request.thinkingEnabled,
          reasoningEffort: request.reasoningEffort,
          toolEnvironment: options.modelRuntime.getToolEnvironment(),
        }, workspaceRoot, approvalGate, runtimeContext);
      },
    },
    eventSink: {
      emit: (event) => {
        options.getMainWindow()?.webContents.send("agent:stream", event);
      },
    },
    approvalBroker: options.approvalRegistry,
    workspaceExecutionProvider: {
      prepare: async ({ request }) => {
        if (!request.executionContext) {
          return { workspaceRoot: request.workspaceRoot ?? request.roots.defaultWorkspaceRoot };
        }
        const prepared = await prepareExecutionContext(
          request.executionContext,
          desktopRootsFromRuntimeRequest(request),
        );
        if ("message" in prepared) {
          throw createExecutionContextError(prepared.message, prepared.code);
        }
        return {
          workspaceRoot: prepared.workspaceRoot,
          workspaceId: prepared.workspaceId,
          worktree: prepared.worktree,
          preparationEvent: prepared.preparationEvent,
          ...(prepared.rollback ? {
            rollback: () => rollbackPreparedExecution(prepared.rollback),
          } : {}),
        };
      },
    },
    titleHook: {
      afterCommittedAgentRun: async ({ request, sessionMeta, priorMessageCount, result, deps }) => {
        if (priorMessageCount > 0 || !isDefaultSessionTitle(sessionMeta?.title) || result.status !== "completed") {
          return;
        }
        const title = await generateSessionTitle(deps.utilityLlm ?? deps.llm, {
          userInput: request.userInput,
          replyText: result.finalReply?.content ?? "",
        });
        if (!title) return;
        const metaPath = `${request.roots.sessionRoot}/${request.sessionId}/meta.json`;
        const write = await updateMeta(metaPath, { title });
        if (!write.ok) throw new Error(write.error);
      },
    },
    onDiagnostic: (diagnostic) => {
      const log = diagnostic.level === "error" ? console.error : console.warn;
      log(`[desktop-agent-runtime] ${diagnostic.code}: ${diagnostic.message}`, diagnostic.error ?? "");
    },
  });
}

export function toDesktopRuntimeRequest(
  input: Omit<RuntimeAgentRunRequest, "roots" | "persistenceMode" | "interactionMode" | "workspaceRoot">,
  roots: AppDataRoots,
): RuntimeAgentRunRequest {
  return {
    ...input,
    roots: {
      dataRoot: roots.dataRoot,
      sessionRoot: roots.sessionRoot,
      logRoot: roots.logRoot,
      tmpRoot: roots.tmpRoot,
      defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
    },
    workspaceRoot: roots.workspaceRoot,
    persistenceMode: "persistent",
    interactionMode: "desktop",
  };
}

export function desktopRootsFromRuntimeRequest(request: RuntimeAgentRunRequest): AppDataRoots {
  return {
    dataRoot: request.roots.dataRoot,
    sessionRoot: request.roots.sessionRoot,
    logRoot: request.roots.logRoot ?? request.roots.dataRoot,
    tmpRoot: request.roots.tmpRoot,
    defaultWorkspaceRoot: request.roots.defaultWorkspaceRoot,
    workspaceRoot: request.workspaceRoot ?? request.roots.defaultWorkspaceRoot,
  };
}

function createModelUnavailableError(message: string, modelKey?: string, reason?: string): Error {
  const error = new Error(message) as Error & { code?: string; modelKey?: string; reason?: string };
  error.name = "ModelUnavailableError";
  error.code = "model_unavailable";
  error.modelKey = modelKey;
  error.reason = reason;
  return error;
}

function createExecutionContextError(message: string, reason = "preparation_failed"): Error {
  const error = new Error(message) as Error & { code?: string; reason?: string };
  error.name = "ExecutionContextError";
  error.code = "execution_context_failed";
  error.reason = reason;
  return error;
}
