import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseSkillFile } from "./frontmatter";
import type { SkillRegistry, SkillScanRoot, SkillSummary } from "./types";

export interface LoadSkillRegistryInput {
  workspaceRoot: string;
  dataRoot?: string;
  homeDir?: string;
  readTextFile?: (filePath: string) => Promise<string>;
  readDirectory?: ReadDirents;
  warn?: (message: string, details?: Record<string, unknown>) => void;
}

export type ReadDirents = (path: string, options: { withFileTypes: true }) => Promise<Dirent[]>;

export function createSkillScanRoots(input: {
  workspaceRoot: string;
  dataRoot?: string;
  homeDir?: string;
}): SkillScanRoot[] {
  const home = input.homeDir ?? homedir();
  const roots: SkillScanRoot[] = [
    {
      path: join(input.workspaceRoot, ".actspace", "skills"),
      scope: "project",
      source: "actspace",
      priority: 10,
    },
    {
      path: join(input.workspaceRoot, ".agents", "skills"),
      scope: "project",
      source: "agents",
      priority: 20,
    },
    {
      path: join(input.workspaceRoot, ".claude", "skills"),
      scope: "project",
      source: "claude",
      priority: 30,
    },
  ];

  if (input.dataRoot) {
    roots.push(
      {
        path: join(input.dataRoot, "skills"),
        scope: "user",
        source: "actspace-userData",
        priority: 40,
      },
      {
        path: join(input.dataRoot, ".actspace", "skills"),
        scope: "user",
        source: "actspace-userData",
        priority: 50,
      },
    );
  }

  roots.push(
    {
      path: join(home, ".agents", "skills"),
      scope: "user",
      source: "agents",
      priority: 60,
    },
    {
      path: join(home, ".claude", "skills"),
      scope: "user",
      source: "claude",
      priority: 70,
    },
  );

  return roots;
}

export async function loadSkillRegistry(input: LoadSkillRegistryInput): Promise<SkillRegistry> {
  const readTextFile = input.readTextFile ?? ((filePath: string) => readFile(filePath, "utf8"));
  const readDirectory = input.readDirectory ?? readdir;
  const summaries: SkillSummary[] = [];
  const warnings: string[] = [];

  for (const root of createSkillScanRoots(input).sort((a, b) => a.priority - b.priority)) {
    const children = await readSkillRootChildren(root.path, readDirectory, input.warn);
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!child.isDirectory()) continue;
      const directory = join(root.path, child.name);
      const location = join(directory, "SKILL.md");
      try {
        const content = await readTextFile(location);
        const parsed = parseSkillFile(content, directory);
        const summary: SkillSummary = {
          name: parsed.name,
          description: parsed.description,
          location,
          directory,
          scope: root.scope,
          source: root.source,
          status: parsed.warning ? "warning" : "available",
          warning: parsed.warning,
        };
        summaries.push(summary);
        if (parsed.warning) warnings.push(`${summary.name}: ${parsed.warning}`);
      } catch (error) {
        if (isNotFoundError(error)) continue;
        const message = error instanceof Error ? error.message : String(error);
        const summary: SkillSummary = {
          name: child.name,
          description: "",
          location,
          directory,
          scope: root.scope,
          source: root.source,
          status: "warning",
          warning: `failed to read SKILL.md: ${message}`,
        };
        summaries.push(summary);
        warnings.push(`${summary.name}: ${summary.warning}`);
        input.warn?.("skill file read failed", { path: location, error: message });
      }
    }
  }

  return dedupeSkills(summaries, warnings);
}

export function dedupeSkills(
  summaries: SkillSummary[],
  warnings: string[] = [],
): SkillRegistry {
  const byName = new Map<string, SkillSummary>();
  const shadowed: SkillSummary[] = [];

  for (const summary of summaries) {
    const existing = byName.get(summary.name);
    if (existing) {
      shadowed.push(summary);
      continue;
    }
    byName.set(summary.name, summary);
  }

  return {
    skills: Array.from(byName.values()),
    shadowed,
    warnings,
  };
}

async function readSkillRootChildren(
  rootPath: string,
  readDirectory: ReadDirents,
  warn?: (message: string, details?: Record<string, unknown>) => void,
): Promise<Dirent[]> {
  try {
    return await readDirectory(rootPath, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) return [];
    const message = error instanceof Error ? error.message : String(error);
    warn?.("skill root read failed", { path: rootPath, error: message });
    return [];
  }
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT",
  );
}
