import type { SkillCatalogItem } from "@actspace/shared";

export type ComposerSlashFunctionId =
  | "chat"
  | "plan"
  | "agent"
  | "compact"
  | "eval"
  | "status"
  | "review";

export type ComposerSlashFunction = {
  id: ComposerSlashFunctionId;
  command: `/${string}`;
  label: string;
  description: string;
};

export const COMPOSER_SLASH_FUNCTIONS: readonly ComposerSlashFunction[] = [
  {
    id: "chat",
    command: "/chat",
    label: "Chat mode",
    description: "Talk without tools.",
  },
  {
    id: "plan",
    command: "/plan",
    label: "Plan mode",
    description: "Research and plan with read-only tools.",
  },
  {
    id: "agent",
    command: "/agent",
    label: "Agent mode",
    description: "Plan and execute with the full tool set.",
  },
  {
    id: "compact",
    command: "/compact",
    label: "Compact context",
    description: "Summarize the conversation and free context space.",
  },
  {
    id: "eval",
    command: "/eval",
    label: "Capture failed turn",
    description: "Create an evaluation candidate from the latest failed turn.",
  },
  {
    id: "status",
    command: "/status",
    label: "Context status",
    description: "Show context usage and injected inputs.",
  },
  {
    id: "review",
    command: "/review",
    label: "Review changes",
    description: "Open the current workspace changes.",
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
        item.description.toLocaleLowerCase().includes(normalizedQuery),
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
