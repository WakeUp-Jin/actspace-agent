import {
  createSkillCatalogSegment,
  loadSkillRegistry,
  type AgentRuntimeContext,
} from "@actspace/agent-core";
import type { AgentSystemPromptFile } from "@actspace/shared";
import { loadAgentsMdSegments } from "./agents-md-service";

type WarningLogger = (message: string, details?: Record<string, unknown>) => void;

export type MainAgentRuntimeContextInput = {
  dataRoot: string;
  workspaceRoot: string;
  homeDir?: string;
  readPromptFile: () => Promise<AgentSystemPromptFile>;
  warn?: WarningLogger;
};

export async function loadMainAgentRuntimeContext(
  input: MainAgentRuntimeContextInput,
): Promise<Pick<AgentRuntimeContext, "systemPrompt" | "systemPromptSegments">> {
  const promptFile = await input.readPromptFile();
  const systemPromptSegments = await loadAgentsMdSegments({
    dataRoot: input.dataRoot,
    workspaceRoot: input.workspaceRoot,
    warn: input.warn,
  });
  const skillRegistry = await loadSkillRegistry({
    dataRoot: input.dataRoot,
    workspaceRoot: input.workspaceRoot,
    homeDir: input.homeDir,
    warn: input.warn,
  });
  const skillCatalogSegment = createSkillCatalogSegment(skillRegistry);
  if (skillCatalogSegment) {
    systemPromptSegments.push(skillCatalogSegment);
  }
  return {
    systemPrompt: promptFile.content,
    systemPromptSegments,
  };
}
