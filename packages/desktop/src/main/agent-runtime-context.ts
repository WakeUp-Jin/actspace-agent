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
  /** Browser Bridge CLI path, retained only for diagnostics when standard tools fail. */
  browserBridgeAbbPath?: string;
  /** Browser Bridge Native Host exposed stable Unix socket. */
  browserBridgeSocketPath?: string;
  warn?: WarningLogger;
};

export async function loadMainAgentRuntimeContext(
  input: MainAgentRuntimeContextInput,
): Promise<Pick<AgentRuntimeContext, "systemPrompt" | "systemPromptSegments" | "additionalWritableRoots" | "browserBridgeSocketPath">> {
  const promptFile = await input.readPromptFile();
  const kairosInboxRoot = join(input.dataRoot, "kairos", "inbox");
  const mainAgentInboxPath = join(kairosInboxRoot, "main-agent.md");
  const systemPromptSegments = await loadAgentsMdSegments({
    dataRoot: input.dataRoot,
    workspaceRoot: input.workspaceRoot,
    warn: input.warn,
  });
  systemPromptSegments.push(createMainAgentKairosHandoffSegment(mainAgentInboxPath));
  const browserBridgeRuntime = await resolveBrowserBridgeRuntime(
    input.browserBridgeAbbPath,
    input.browserBridgeSocketPath,
  );
  if (browserBridgeRuntime) {
    systemPromptSegments.push(browserBridgeRuntime.segment);
  }
  const skillRegistry = await loadSkillRegistry({
    dataRoot: input.dataRoot,
    workspaceRoot: input.workspaceRoot,
    homeDir: input.homeDir,
    warn: input.warn,
  });
  const disabled = new Set(input.disabledSkills ?? []);
  if (browserBridgeRuntime) disabled.add("browser-bridge");
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
    browserBridgeSocketPath: browserBridgeRuntime?.socketPath,
  };
}

async function resolveBrowserBridgeRuntime(
  abbPath?: string,
  socketPath?: string,
): Promise<{ socketPath: string; segment: AgentSystemPromptSegment } | undefined> {
  if (!abbPath || !socketPath) return undefined;
  try {
    await access(abbPath);
  } catch {
    return undefined;
  }

  return {
    socketPath,
    segment: {
      id: "browser_bridge_tools",
      title: "Browser tools",
      content: [
        "The user's real Chrome browser is available through 11 categorized `browser_*` tools backed by 62 canonical actions.",
        "- Start with `browser_help` when an action schema is unclear. Use `browser_user` or `browser_tabs` to inspect tabs, then choose CUA, DOM, Locator, navigation, wait, I/O, or debug by intent.",
        "- Use `browser_run` only for a known structured sequence; the Go bridge preflights and binds approval to the exact batch.",
        "- Do not invoke `abb` through Bash for normal browser tasks.",
        "- Check `<runtime_model>.input` before relying on screenshots: if it is text-only, prefer DOM, URL, visible text, and structured browser state.",
        `- If a standard browser tool reports that the native host, socket, or extension is unavailable, diagnose with the quoted CLI path \`${abbPath}\` using only \`doctor --json\` or \`capabilities --json\`.`,
      ].join("\n"),
      bucket: "skills",
      priority: 72,
      stability: CACHE_STABILITY.STABLE,
    },
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
