import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  MAIN_AGENT_SYSTEM_PROMPT,
  MockLLMService,
  buildAgentConfig,
  createAgentForSession,
  createAgentHostRuntime,
  createApprovalGateForPermissionMode,
  createMockLLMConfig,
  loadAgentRuntimeContext,
  mockText,
  type RuntimeApprovalBroker,
  type RuntimeDiagnostic,
  type ToolApprovalDecision,
  type ToolApprovalRequest,
} from "@actspace/agent-core";
import type { ModelId, RuntimeStreamEvent } from "@actspace/shared";
import { ContextSnapshotCollector } from "./context-snapshot-collector";
import type { PermissionMode } from "./types";

// Keep the adapter API host-oriented: callers supply terminal/process behavior,
// while this module owns Agent Runtime dependency assembly.
export type CreateCliRuntimeInput = {
  workspace: string;
  dataDir: string;
  permissionMode: PermissionMode;
  mock: boolean;
  model?: string;
  eventSink: (event: RuntimeStreamEvent) => void | Promise<void>;
  contextSnapshots?: ContextSnapshotCollector;
  approvalBroker?: RuntimeApprovalBroker;
  onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void;
};

export function createCliAgentRuntime(input: CreateCliRuntimeInput) {
  const headlessApprovalBroker = input.approvalBroker
    ? undefined
    : new HeadlessApprovalBroker(input.permissionMode, input.workspace);
  const approvalBroker = input.approvalBroker ?? headlessApprovalBroker!;
  const runtime = createAgentHostRuntime({
    contextProvider: {
      load: (request, workspaceRoot) => loadAgentRuntimeContext({
        dataRoot: request.roots.dataRoot,
        workspaceRoot,
        homeDir: homedir(),
        readPromptFile: async () => ({ path: "builtin:main-agent", content: MAIN_AGENT_SYSTEM_PROMPT }),
        disabledTools: ["browser", "browser_help"],
        mode: request.mode,
        selectedSkills: request.selectedSkills,
        warn: (message, details) => input.onDiagnostic?.({
          level: "warn",
          code: "CONTEXT_LOAD_WARNING",
          message,
          error: details,
        }),
      }),
    },
    modelResolver: {
      resolveConfig: ({ request, workspaceRoot, runtimeContext, approvalGate }) => {
        const config = buildAgentConfig({
          model: (input.model ?? request.model) as ModelId | undefined,
          thinkingEnabled: request.thinkingEnabled,
          reasoningEffort: request.reasoningEffort,
        }, workspaceRoot, approvalGate, runtimeContext);
        config.toolManagerConfig.disabledTools = [
          ...new Set([...(config.toolManagerConfig.disabledTools ?? []), "browser", "browser_help"]),
        ];
        if (input.mock) {
          config.llmConfig = createMockLLMConfig();
          config.utilityLlmConfig = undefined;
          config.exploreLlmConfig = undefined;
          config.exploreModelId = null;
        }
        return config;
      },
    },
    eventSink: { emit: input.eventSink },
    approvalBroker,
    harnessObserver: {
      createCacheAudit: () => input.contextSnapshots,
      afterHarness: ({ deps }) => {
        input.contextSnapshots?.captureFinal(deps.contextManager.getMessages());
      },
    },
    harnessLog: () => {},
    createDependencies: async (config, options) => {
      const deps = await createAgentForSession(config, options);
      if (input.mock) {
        if (!(deps.llm instanceof MockLLMService)) {
          throw new Error("Mock CLI configuration did not create MockLLMService.");
        }
        deps.llm.setResponses([mockText("Mock ActSpace Agent response.")]);
      }
      return deps;
    },
    onDiagnostic: input.onDiagnostic,
  });

  return { runtime, approvalBroker, headlessApprovalBroker };
}

export function resolveCliDataDir(explicit: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  return resolve(explicit ?? env.ACTSPACE_DATA_DIR ?? join(homedir(), ".actspace"));
}

export class HeadlessApprovalBroker implements RuntimeApprovalBroker {
  private readonly automaticGate;
  private requiredRequest: ToolApprovalRequest | undefined;

  constructor(mode: PermissionMode, workspaceRoot: string) {
    this.automaticGate = createApprovalGateForPermissionMode(mode, workspaceRoot);
  }

  async waitForDecision(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    if (this.automaticGate) return this.automaticGate.waitForDecision(request);
    this.requiredRequest = request;
    return { requestId: request.id, decision: "abort", decidedAt: Date.now() };
  }

  get approvalRequired(): ToolApprovalRequest | undefined {
    return this.requiredRequest;
  }
}
