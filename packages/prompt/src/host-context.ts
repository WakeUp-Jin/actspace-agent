import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SkillCatalog } from "./skills/catalog.js";
import { discoverSkills } from "./skills/discovery.js";

export type RuntimeInstructionSource = {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly content: string;
  readonly contentDigest: string;
};

export type RuntimePromptSource = {
  readonly instructions: readonly RuntimeInstructionSource[];
  readonly skills: SkillCatalog;
  readonly warnings: readonly string[];
};

export type PrepareRuntimePromptSourceOptions = {
  readonly dataRoot: string;
  readonly workspaceRoot: string;
  readonly homeDir?: string;
};

export async function prepareRuntimePromptSource(options: PrepareRuntimePromptSourceOptions): Promise<RuntimePromptSource> {
  const warnings: string[] = [];
  const instructions: RuntimeInstructionSource[] = [];
  for (const source of [
    { id: "host/user-instructions", title: "User instructions", path: join(options.dataRoot, "AGENTS.md") },
    { id: "host/workspace-instructions", title: "Workspace instructions", path: join(options.workspaceRoot, "AGENTS.md") },
  ]) {
    try {
      const content = await readFile(source.path, "utf8");
      if (content.trim().length === 0) continue;
      instructions.push(Object.freeze({ ...source, content, contentDigest: digest(content) }));
    } catch (error) {
      if (isNotFound(error)) continue;
      warnings.push(`${source.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const skills = await discoverSkills({ workspaceRoot: options.workspaceRoot, dataRoot: options.dataRoot, homeDir: options.homeDir ?? homedir() });
  return Object.freeze({ instructions: Object.freeze(instructions), skills, warnings: Object.freeze(warnings) });
}

export function emptyRuntimePromptSource(): RuntimePromptSource {
  return Object.freeze({ instructions: Object.freeze([]), skills: new SkillCatalog(), warnings: Object.freeze([]) });
}

function digest(content: string): string { return createHash("sha256").update(content).digest("hex"); }
function isNotFound(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT"); }
