import type { BrowserWindow } from "electron";
import type { AgentTurnResult, RunTurnInput } from "@actspace/shared";
import type { AgentRuntime } from "@actspace/agent-core";
import type { PendingApprovalRegistry } from "./approval-registry";
import type { ModelRuntimeService } from "./model-runtime-service";
import {
  createDesktopAgentRuntime,
  toDesktopRuntimeRequest,
  type AgentRuntimeContextLoader,
} from "./desktop-agent-runtime";

export type AppDataRoots = {
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  defaultWorkspaceRoot: string;
  workspaceRoot: string;
};

export type { AgentRuntimeContextLoader } from "./desktop-agent-runtime";

let runtime: AgentRuntime | undefined;

export async function runAndPersistTurn(
  input: RunTurnInput,
  roots: AppDataRoots,
  getMainWindow: () => BrowserWindow | undefined,
  approvalRegistry?: PendingApprovalRegistry,
  loadRuntimeContext?: AgentRuntimeContextLoader,
  modelRuntime?: ModelRuntimeService,
): Promise<AgentTurnResult> {
  runtime ??= createDesktopAgentRuntime({
    getMainWindow,
    approvalRegistry,
    loadRuntimeContext,
    modelRuntime,
  });
  return runtime.runTurn(toDesktopRuntimeRequest(input, roots));
}

export function abortTurn(input: { sessionId: string; turnId: string }): boolean {
  return runtime?.abortTurn(input) ?? false;
}

export function isSessionTurnActive(sessionId: string): boolean {
  return runtime?.isSessionActive(sessionId) ?? false;
}

export async function disposeDesktopAgentRuntime(): Promise<void> {
  const current = runtime;
  runtime = undefined;
  await current?.dispose();
}
