import {
  createSkillCatalogSegment,
  CACHE_STABILITY,
  loadSkillRegistry,
  type AgentRuntimeContext,
  type AgentSystemPromptSegment,
} from "@actspace/agent-core";
import type { AgentSystemPromptFile } from "@actspace/shared";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { loadAgentsMdSegments } from "./agents-md-service";

type WarningLogger = (message: string, details?: Record<string, unknown>) => void;

export type MainAgentRuntimeContextInput = {
  dataRoot: string;
  workspaceRoot: string;
  homeDir?: string;
  readPromptFile: () => Promise<AgentSystemPromptFile>;
  /** 主 Agent Skill 黑名单（settings.skills.disabled）；命中的 Skill 不进 catalog。 */
  disabledSkills?: string[];
  /** Browser Bridge CLI path. When present on disk, inject bash-based browser-use guidance. */
  browserBridgeAbbPath?: string;
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
  const browserBridgeSegment = await createBrowserBridgeCliSegment(input.browserBridgeAbbPath);
  if (browserBridgeSegment) {
    systemPromptSegments.push(browserBridgeSegment);
  }
  const skillRegistry = await loadSkillRegistry({
    dataRoot: input.dataRoot,
    workspaceRoot: input.workspaceRoot,
    homeDir: input.homeDir,
    warn: input.warn,
  });
  const disabled = new Set(input.disabledSkills ?? []);
  const filteredRegistry = disabled.size === 0
    ? skillRegistry
    : { ...skillRegistry, skills: skillRegistry.skills.filter((s) => !disabled.has(s.name)) };
  const skillCatalogSegment = createSkillCatalogSegment(filteredRegistry);
  if (skillCatalogSegment) {
    systemPromptSegments.push(skillCatalogSegment);
  }
  return {
    systemPrompt: promptFile.content,
    systemPromptSegments,
    additionalWritableRoots: [kairosInboxRoot],
  };
}

async function createBrowserBridgeCliSegment(abbPath?: string): Promise<AgentSystemPromptSegment | undefined> {
  if (!abbPath) return undefined;
  try {
    await access(abbPath);
  } catch {
    return undefined;
  }

  return {
    id: "browser_bridge_cli",
    title: "Browser Bridge CLI",
    content: [
      "Browser Bridge is available through the `abb` CLI and bash.",
      `- abb path: ${abbPath}`,
      "- For browser/tab/page tasks, prefer this CLI over AppleScript or generic OS automation.",
      "- First inspect the interface with the absolute-path command plus `help`, `doctor --json`, or `capabilities --json`.",
      "- Use JSON output when available, and quote the absolute path because it may contain spaces.",
      "- If the Chrome extension or native host is not connected, report the doctor result and the required user action instead of guessing.",
    ].join("\n"),
    bucket: "skills",
    priority: 72,
    stability: CACHE_STABILITY.STABLE,
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
