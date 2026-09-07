import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { SkillInstallResult, SkillListResult, SkillUninstallResult } from "@actspace/shared";

type SkillCandidate = {
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly location: string;
  readonly directory: string;
  readonly scope: "project" | "user";
};

export async function listFixedRendererSkills(input: {
  readonly dataRoot: string;
  readonly workspaceRoot: string;
  readonly homeDir: string;
  readonly disabled: readonly string[];
}): Promise<SkillListResult> {
  const roots = [
    { path: join(input.workspaceRoot, ".actspace", "skills"), source: ".actspace/skills", scope: "project" as const },
    { path: join(input.workspaceRoot, ".agents", "skills"), source: ".agents/skills", scope: "project" as const },
    { path: join(input.workspaceRoot, ".claude", "skills"), source: ".claude/skills", scope: "project" as const },
    { path: join(input.dataRoot, "skills"), source: "actspace-userData", scope: "user" as const },
    { path: join(input.homeDir, ".agents", "skills"), source: "agents-user", scope: "user" as const },
    { path: join(input.homeDir, ".claude", "skills"), source: "claude-user", scope: "user" as const },
  ];
  const managedRoot = `${resolve(input.dataRoot, "skills")}${sep}`;
  const disabled = new Set(input.disabled);
  const seen = new Set<string>();
  const items: SkillListResult["items"] = [];
  const warnings: string[] = [];
  for (const root of roots) {
    const candidates = await scanSkills(root.path, root.source, root.scope, warnings);
    for (const candidate of candidates) {
      const shadowed = seen.has(candidate.name);
      seen.add(candidate.name);
      items.push({
        ...candidate,
        status: "available",
        removable: `${resolve(candidate.directory)}${sep}`.startsWith(managedRoot),
        enabledForAgent: !disabled.has(candidate.name),
        shadowed,
      });
    }
  }
  return { items, warnings };
}

export async function installFixedRendererSkill(dataRoot: string, sourceDir: string): Promise<SkillInstallResult> {
  const skill = await readSkill(join(sourceDir, "SKILL.md"), "selected", "user");
  if (skill === null) return { ok: false, error: "所选目录里没有有效的 SKILL.md。" };
  const root = resolve(dataRoot, "skills");
  const target = resolve(root, basename(sourceDir));
  if (!isInside(root, target)) return { ok: false, error: "Skill 安装路径无效。" };
  try {
    await mkdir(root, { recursive: true });
    await cp(sourceDir, target, { recursive: true, errorOnExist: true, force: false });
    return { ok: true, name: skill.name };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Skill 安装失败。" };
  }
}

export async function uninstallFixedRendererSkill(dataRoot: string, directory: string): Promise<SkillUninstallResult> {
  const root = resolve(dataRoot, "skills");
  const target = resolve(directory);
  if (target === root || !isInside(root, target)) return { ok: false, error: "只能卸载 ActSpace 用户目录中的 Skill。" };
  try {
    await rm(target, { recursive: true, force: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Skill 卸载失败。" };
  }
}

async function scanSkills(root: string, source: string, scope: "project" | "user", warnings: string[]): Promise<SkillCandidate[]> {
  const items: SkillCandidate[] = [];
  await walk(root, 0, async (path) => {
    const skill = await readSkill(path, source, scope).catch((error: unknown) => {
      warnings.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (skill !== null) items.push(skill);
  });
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

async function walk(root: string, depth: number, visit: (path: string) => Promise<void>): Promise<void> {
  if (depth > 6) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await walk(path, depth + 1, visit);
    else if (entry.isFile() && entry.name === "SKILL.md") await visit(path);
  }
}

async function readSkill(path: string, source: string, scope: "project" | "user"): Promise<SkillCandidate | null> {
  const text = await readFile(path, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (match === null) return null;
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ""));
  }
  const directory = dirname(path);
  const name = fields.get("name") ?? basename(directory);
  const description = fields.get("description") ?? "";
  if (!name || !description || !(await stat(path)).isFile()) return null;
  return { name, description, source, location: path, directory, scope };
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path !== "" && !path.startsWith("..") && !path.startsWith(sep);
}
