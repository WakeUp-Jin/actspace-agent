import type { SkillCatalogItem } from "@actspace/shared";

export type ComposerSlashFunctionId =
  | "chat"
  | "plan"
  | "agent"
  | "compact"
  | "status"
  | "review";

export type ComposerSlashFunction = {
  id: ComposerSlashFunctionId;
  command: `/${string}`;
  label: string;
  description: string;
  /** Keep existing English discovery terms when the visible copy changes. */
  searchAliases: string;
};

export const COMPOSER_SLASH_FUNCTIONS: readonly ComposerSlashFunction[] = [
  {
    id: "chat",
    command: "/chat",
    label: "Chat 模式",
    description: "直接对话，不使用工具。",
    searchAliases: "Chat mode Talk without tools.",
  },
  {
    id: "plan",
    command: "/plan",
    label: "Plan 模式",
    description: "使用只读工具进行调研和规划。",
    searchAliases: "Plan mode Research and plan with read-only tools.",
  },
  {
    id: "agent",
    command: "/agent",
    label: "Agent 模式",
    description: "使用完整工具集进行规划和执行。",
    searchAliases: "Agent mode Plan and execute with the full tool set.",
  },
  {
    id: "compact",
    command: "/compact",
    label: "压缩上下文",
    description: "总结会话，释放上下文空间。",
    searchAliases: "Compact context Summarize the conversation and free context space.",
  },
  {
    id: "status",
    command: "/status",
    label: "上下文状态",
    description: "查看上下文用量与注入内容。",
    searchAliases: "Context status Show context usage and injected inputs.",
  },
  {
    id: "review",
    command: "/review",
    label: "审查变更",
    description: "打开当前工作区的变更。",
    searchAliases: "Review changes Open the current workspace changes.",
  },
] as const;

export function parseComposerSlashQuery(draft: string): string | null {
  if (!/^\/[^/\s]*$/u.test(draft)) return null;
  return normalizeSlashSearch(draft.slice(1));
}

export function filterComposerSlashFunctions(query: string): ComposerSlashFunction[] {
  const normalizedQuery = normalizeSlashSearch(query);
  if (!normalizedQuery) return [...COMPOSER_SLASH_FUNCTIONS];

  return COMPOSER_SLASH_FUNCTIONS
    .map((item, index) => ({
      item,
      index,
      commandPrefix: item.command.slice(1).toLocaleLowerCase().startsWith(normalizedQuery),
      matches:
        item.command.slice(1).toLocaleLowerCase().includes(normalizedQuery) ||
        item.label.toLocaleLowerCase().includes(normalizedQuery) ||
        item.description.toLocaleLowerCase().includes(normalizedQuery) ||
        item.searchAliases.toLocaleLowerCase().includes(normalizedQuery),
    }))
    .filter((entry) => entry.matches)
    .sort((left, right) => Number(right.commandPrefix) - Number(left.commandPrefix) || left.index - right.index)
    .map((entry) => entry.item);
}

export function filterComposerSlashSkills(skills: SkillCatalogItem[], query: string): SkillCatalogItem[] {
  const normalizedQuery = normalizeSlashSearch(query);
  return skills
    .filter((skill) =>
      !normalizedQuery ||
      skill.name.toLocaleLowerCase().includes(normalizedQuery) ||
      skill.description.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      if (left.scope !== right.scope) return left.scope === "project" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

export function composerSlashFunctionOptionId(id: ComposerSlashFunctionId): string {
  return `composer-slash-function-${id}`;
}

export function composerSlashSkillOptionId(name: string): string {
  return `composer-slash-skill-${encodeURIComponent(name)}`;
}

function normalizeSlashSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}
