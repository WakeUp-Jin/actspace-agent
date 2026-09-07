import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { SkillCatalog, type SkillRecord } from "./catalog.js";

export const DEFAULT_SKILL_ROOTS = Object.freeze([".actspace/skills", ".agents/skills", ".claude/skills"]);

export type SkillDiscoveryOptions = {
  readonly workspaceRoot: string;
  readonly dataRoot?: string;
  readonly homeDir?: string;
  readonly roots?: readonly string[];
};

export async function discoverSkills(input: string | SkillDiscoveryOptions, roots: readonly string[] = DEFAULT_SKILL_ROOTS): Promise<SkillCatalog> {
  const catalog = new SkillCatalog();
  const options = typeof input === "string" ? { workspaceRoot: input, roots } : input;
  const scanRoots = (options.roots ?? DEFAULT_SKILL_ROOTS).map((source) => ({ root: resolve(options.workspaceRoot, source), source }));
  if (options.dataRoot !== undefined) {
    scanRoots.push({ root: resolve(options.dataRoot, "skills"), source: "actspace-userData" });
    scanRoots.push({ root: resolve(options.dataRoot, ".actspace/skills"), source: "actspace-userData-legacy" });
  }
  if (options.homeDir !== undefined) {
    scanRoots.push({ root: resolve(options.homeDir, ".agents/skills"), source: "agents-user" });
    scanRoots.push({ root: resolve(options.homeDir, ".claude/skills"), source: "claude-user" });
  }
  for (const { root, source } of scanRoots) await scanRoot(root, source, catalog, 0, { files: 0 });
  return catalog;
}

async function scanRoot(root: string, source: string, catalog: SkillCatalog, depth: number, state: { files: number }): Promise<void> {
  if (depth > 6 || state.files >= 512) return;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) { await scanRoot(fullPath, source, catalog, depth + 1, state); continue; }
    if (!entry.isFile() || entry.name !== "SKILL.md") continue;
    state.files += 1;
    const skill = await parseSkill(fullPath, source);
    if (skill !== null) catalog.add(skill);
  }
}

async function parseSkill(path: string, source: string): Promise<SkillRecord | null> {
  const text = await readFile(path, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (match === null) return null;
  const fields = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ""));
  }
  const id = fields.get("id") ?? fields.get("name") ?? basenameSkill(path);
  const name = fields.get("name") ?? id;
  const description = fields.get("description") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || description.length === 0 || description.length > 1024) return null;
  const root = resolve(path, "..");
  if (relative(root, path).startsWith("..")) return null;
  await stat(path);
  return Object.freeze({ id, name, description, path, source, contentDigest: createHash("sha256").update(match[2]).digest("hex") });
}

function basenameSkill(path: string): string {
  return path.split("/").slice(-2, -1)[0] ?? "skill";
}
