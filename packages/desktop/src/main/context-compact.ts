import type { BrowserWindow } from "electron";
import { join } from "node:path";
import type { CompactContextInput, CompactContextResult, RuntimeStreamEvent } from "@actspace/shared";
import {
  appendEvents,
  buildAgentConfig,
  buildAgentConfigFromRuntime,
  compactContextWithAgent,
  createAgentForSession,
  createSessionStorePaths,
  readMeta,
  updateMeta,
  writeContextState,
} from "@actspace/agent-core";
import type { AgentRuntimeContextLoader, AppDataRoots } from "./agent-turn";
import type { ModelRuntimeService } from "./model-runtime-service";

export async function compactAndPersistContext(
  input: CompactContextInput,
  roots: AppDataRoots,
  getMainWindow: () => BrowserWindow | undefined,
  loadRuntimeContext?: AgentRuntimeContextLoader,
  modelRuntime?: ModelRuntimeService,
): Promise<CompactContextResult> {
  const sessionDir = join(roots.sessionRoot, input.sessionId);
  const sessionPaths = createSessionStorePaths(sessionDir);
  const sessionMeta = await readMeta(sessionPaths.metaPath);
  const workspaceRoot = sessionMeta?.workspaceRoot ?? roots.defaultWorkspaceRoot;
  const runtimeContext = await loadRuntimeContext?.(workspaceRoot);
  const runtimeOptions = { tmpRoot: roots.tmpRoot, sessionId: input.sessionId, ...runtimeContext };
  const config = modelRuntime
    ? (() => {
        const main = modelRuntime.resolveMainModel(input.modelKey ?? input.model);
        if (!("model" in main)) throw new Error(main.message);
        const utility = modelRuntime.resolveUtilityModel(main.model);
        if (!("model" in utility)) throw new Error(utility.message);
        return buildAgentConfigFromRuntime({
          main: { definition: main.model.definition, runtime: main.model.providerRuntime },
          utility: { definition: utility.model.definition, runtime: utility.model.providerRuntime },
          explore: { definition: main.model.definition, runtime: main.model.providerRuntime },
          toolEnvironment: modelRuntime.getToolEnvironment(),
        }, workspaceRoot, undefined, runtimeOptions);
      })()
    : buildAgentConfig({ model: input.model }, workspaceRoot, undefined, runtimeOptions);
  const deps = await createAgentForSession(config, {
    sessionPath: sessionPaths.sessionPath,
  });
  const win = getMainWindow();
  const forwardStreamEvent = (event: RuntimeStreamEvent) => {
    win?.webContents.send("agent:stream", event);
  };

  const result = await compactContextWithAgent(input, deps, {
    onStreamEvent: forwardStreamEvent,
  });

  if (result.events.length > 0) {
    const writeResult = await appendEvents(sessionPaths.sessionPath, result.events);
    if (!writeResult.ok) {
      throw new Error(writeResult.error ?? "Failed to persist context compaction events");
    }
  }

  if (result.contextState) {
    const stateResult = await writeContextState(sessionPaths, result.contextState);
    if (!stateResult.ok) {
      throw new Error(stateResult.error ?? "Failed to persist context state");
    }
  }

  const metaResult = await updateMeta(sessionPaths.metaPath, {
    updatedAt: new Date().toISOString(),
  });
  if (!metaResult.ok) {
    throw new Error(metaResult.error ?? "Failed to update session metadata");
  }

  return result;
}
