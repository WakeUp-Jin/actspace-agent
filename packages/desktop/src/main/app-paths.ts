import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppDataRoots } from "./agent-turn";

type ReadText = (path: string) => Promise<string>;

export type ResolveAppDataRootsInput = {
  dataRoot: string;
  defaultWorkspaceRoot: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  readText?: ReadText;
};

type ActspacePackageJson = {
  name?: string;
};

async function isActspaceRepoRoot(dir: string, readText: ReadText): Promise<boolean> {
  try {
    const raw = await readText(join(dir, "package.json"));
    const pkg = JSON.parse(raw) as ActspacePackageJson;
    return pkg.name === "actspace";
  } catch {
    return false;
  }
}

export async function resolveRepoRoot(input: ResolveAppDataRootsInput): Promise<string | null> {
  const readText = input.readText ?? ((path) => readFile(path, "utf-8"));
  const explicit = input.env.ACTSPACE_REPO_ROOT;
  if (explicit) {
    if (!(await isActspaceRepoRoot(explicit, readText))) {
      throw new Error(`ACTSPACE_REPO_ROOT is not an actspace repo: ${explicit}`);
    }
    return explicit;
  }

  let current = input.cwd;
  while (true) {
    if (await isActspaceRepoRoot(current, readText)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function resolveAppDataRoots(input: ResolveAppDataRootsInput): Promise<AppDataRoots> {
  const repoRoot = await resolveRepoRoot(input);
  const workspaceRoot = input.env.ACTSPACE_WORKSPACE_ROOT || repoRoot || input.defaultWorkspaceRoot;
  return {
    dataRoot: input.dataRoot,
    sessionRoot: join(input.dataRoot, "sessions"),
    logRoot: join(repoRoot ?? input.dataRoot, "logs"),
    tmpRoot: join(input.dataRoot, "tmp"),
    defaultWorkspaceRoot: input.defaultWorkspaceRoot,
    workspaceRoot,
  };
}
