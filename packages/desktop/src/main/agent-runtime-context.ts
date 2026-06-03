import {
  createSkillCatalogSegment,
  loadSkillRegistry,
  type AgentRuntimeContext,
  type AgentSystemPromptSegment,
} from "@actspace/agent-core";
import type { AgentSystemPromptFile } from "@actspace/shared";
import { join } from "node:path";
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
): Promise<Pick<AgentRuntimeContext, "systemPrompt" | "systemPromptSegments" | "additionalWritableRoots">> {
  const promptFile = await input.readPromptFile();
  const kairosInboxRoot = join(input.dataRoot, "kairos", "inbox");
  const mainAgentInboxPath = join(kairosInboxRoot, "main-agent.md");
  const systemPromptSegments = await loadAgentsMdSegments({
    dataRoot: input.dataRoot,
    workspaceRoot: input.workspaceRoot,
    warn: input.warn,
  });
  systemPromptSegments.push(createMainAgentKairosHandoffSegment(mainAgentInboxPath));
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
    additionalWritableRoots: [kairosInboxRoot],
  };
}

function createMainAgentKairosHandoffSegment(inboxPath: string): AgentSystemPromptSegment {
  return {
    id: "main_agent_kairos_handoff",
    title: "Kairos handoff inbox",
    content: [
      "Kairos handoff:",
      `- Append durable handoff notes for Kairos to this file: ${inboxPath}`,
      "- Write only stable user preferences, unfinished follow-ups, repeated failures, explicit decisions, or context Kairos should later observe/remind about.",
      "- Do not write ordinary chat logs, transient conclusions, greetings, or per-turn summaries.",
      "- Keep entries short, dated when useful, and append-only. Do not mark entries as Processed.",
      "- To append: use read_file to inspect the current end of the file, then edit_file to replace that ending with ending plus the new note. If the file does not exist, create it with write_file.",
    ].join("\n"),
    bucket: "systemPrompt",
    priority: 60,
  };
}
