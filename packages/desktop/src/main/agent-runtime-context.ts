import {
  createSkillCatalogSegment,
  CACHE_STABILITY,
  loadSkillRegistry,
  parseSkillFile,
  type AgentRuntimeContext,
  type AgentSystemPromptSegment,
} from "@actspace/agent-core";
import type { AgentSystemPromptFile, ComposerMode } from "@actspace/shared";
import { access, readFile } from "node:fs/promises";
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
  /** 主 Agent 工具黑名单；`browser` 或历史 `browser_help` 会关闭整个 Browser 工具组。 */
  disabledTools?: string[];
  mode?: ComposerMode;
  selectedSkills?: string[];
  warn?: WarningLogger;
};

export async function loadMainAgentRuntimeContext(
  input: MainAgentRuntimeContextInput,
): Promise<Pick<AgentRuntimeContext, "systemPrompt" | "systemPromptSegments" | "additionalWritableRoots" | "browserBridgeSocketPath">> {
  const promptFile = await input.readPromptFile();
  const kairosInboxRoot = join(input.dataRoot, "kairos", "inbox");
  const mainAgentInboxPath = join(kairosInboxRoot, "main-agent.md");
  const mode = input.mode ?? "agent";
  const systemPromptSegments = mode === "chat"
    ? []
    : await loadAgentsMdSegments({
        dataRoot: input.dataRoot,
        workspaceRoot: input.workspaceRoot,
        warn: input.warn,
      });
  if (mode === "agent") {
    systemPromptSegments.push(createMainAgentKairosHandoffSegment(mainAgentInboxPath));
  }
  const disabledTools = new Set(input.disabledTools ?? []);
  const browserBridgeRuntime = mode !== "agent" || disabledTools.has("browser") || disabledTools.has("browser_help")
    ? undefined
    : await resolveBrowserBridgeRuntime(
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
  const skillCatalogSegment = mode === "chat" ? undefined : createSkillCatalogSegment(filteredRegistry);
  if (skillCatalogSegment) {
    systemPromptSegments.push(skillCatalogSegment);
  }
  if (mode === "chat") {
    systemPromptSegments.push(createChatModeSegment());
  } else if (mode === "plan") {
    systemPromptSegments.push(createPlanModeSegment());
  }
  systemPromptSegments.push(...await createSelectedSkillSegments({
    selectedSkills: input.selectedSkills ?? [],
    registry: filteredRegistry,
  }));
  return {
    systemPrompt: promptFile.content,
    systemPromptSegments,
    additionalWritableRoots: mode === "agent" ? [kairosInboxRoot] : [],
    browserBridgeSocketPath: browserBridgeRuntime?.socketPath,
  };
}

function createChatModeSegment(): AgentSystemPromptSegment {
  return {
    id: "composer_chat_mode",
    title: "Chat mode",
    content: [
      "Chat mode is active.",
      "- Respond as a conversational assistant without using tools or claiming to inspect the workspace.",
      "- Use only the user's messages and explicitly attached Image or selected Skill context.",
      "- Do not claim that files were read, commands were run, or external information was checked.",
    ].join("\n"),
    bucket: "rules",
    priority: 92,
    stability: CACHE_STABILITY.STABLE,
  };
}

function createPlanModeSegment(): AgentSystemPromptSegment {
  return {
    id: "composer_plan_mode",
    title: "Plan mode",
    content: [
      "Plan mode is active.",
      "- Investigate the current implementation and constraints before proposing a plan.",
      "- Ask a concise clarification only when missing information would materially change the design.",
      "- Otherwise provide a concrete plan covering goals, affected boundaries, key decisions, implementation order, verification, and major risks.",
      "- You have a strict read-only tool set. Do not claim that files were edited, commands were executed, tests passed, or implementation was completed.",
    ].join("\n"),
    bucket: "rules",
    priority: 92,
    stability: CACHE_STABILITY.STABLE,
  };
}

async function createSelectedSkillSegments(input: {
  selectedSkills: string[];
  registry: Awaited<ReturnType<typeof loadSkillRegistry>>;
}): Promise<AgentSystemPromptSegment[]> {
  const selectedNames = [...new Set(input.selectedSkills.map((name) => name.trim()).filter(Boolean))];
  if (selectedNames.length === 0) return [];

  const availableByName = new Map(
    input.registry.skills
      .filter((skill) => skill.status === "available")
      .map((skill) => [skill.name, skill] as const),
  );
  const segments: AgentSystemPromptSegment[] = [];
  for (const name of selectedNames) {
    const skill = availableByName.get(name);
    if (!skill) {
      throw new Error(`Selected Skill is not available: ${name}`);
    }
    const parsed = parseSkillFile(await readFile(skill.location, "utf8"), skill.directory);
    if (parsed.warning) {
      throw new Error(`Selected Skill cannot be loaded: ${name}`);
    }
    segments.push({
      id: `selected_skill:${name}`,
      title: `Selected Skill: ${name}`,
      content: [
        `<selected_skill name="${escapeXmlAttribute(name)}">`,
        parsed.body.trim(),
        "</selected_skill>",
      ].join("\n"),
      bucket: "skills",
      priority: 88,
      stability: CACHE_STABILITY.STABLE,
    });
  }
  return segments;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
        "The user's real Chrome browser is available through the progressive `browser_help` gateway backed by 62 canonical actions.",
        "- For any task that needs the browser, call `browser_help` first. After it succeeds, the next model call receives the categorized Browser tools for CUA, DOM, Locator, navigation, tabs, user-browser state, waits, I/O, debug, and batching.",
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
