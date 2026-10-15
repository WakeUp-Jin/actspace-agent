import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { WorkspaceRegistry } from "@actspace/shared";
import type { AppDataRoots } from "./app-paths";
import { readWorkspaceRegistry, resolveRegisteredWorkspaceSelection, type WorkspaceRegistryOptions } from "./workspace-registry-service";

export const WORKSPACE_NOT_REGISTERED = "workspace_not_registered";

export class WorkspaceAccessError extends Error {
  readonly code = WORKSPACE_NOT_REGISTERED;

  constructor(readonly requested: string) {
    super(`${WORKSPACE_NOT_REGISTERED}: ${requested}`);
    this.name = "WorkspaceAccessError";
  }
}

export type WorkspaceAccessDeps = {
  readonly readRegistry: () => Promise<WorkspaceRegistry>;
  /** 本地会话当前的 workspaceRoot（worktree 会话是 worktree 路径），不在 registry 里也允许。 */
  readonly listSessionWorkspaceRoots: () => Promise<readonly (string | null | undefined)[]>;
};

/**
 * renderer 传来的 workspaceRoot 必须等于 registry 某个条目的 path，或者某个本地会话的 workspaceRoot
 * （worktree 会话就是 worktree 路径）。比较前双方都先 realpath，所以指向外部的 symlink 会被拒绝，
 * 同一目录的 symlink 别名可以通过。没传 root 时直接拒绝。
 * 返回 realpath 后的 root；不允许时抛 `WorkspaceAccessError`。
 */
export async function resolveWorkspaceAccess(
  input: { readonly workspaceRoot?: string | null },
  deps: WorkspaceAccessDeps,
): Promise<string> {
  const registry = await deps.readRegistry();
  const requested = input.workspaceRoot?.trim() || "";
  if (!requested) throw new WorkspaceAccessError("");

  const realRequested = await realpathOrNull(requested);
  if (!realRequested) throw new WorkspaceAccessError(requested);

  if (await matchesAny(registry.items.map((item) => item.path), realRequested)) return realRequested;
  // 会话列表只在 registry 没命中时才读，绝大多数请求走不到这里。
  if (await matchesAny(await deps.listSessionWorkspaceRoots(), realRequested)) return realRequested;
  throw new WorkspaceAccessError(requested);
}

async function matchesAny(candidates: readonly (string | null | undefined)[], realRequested: string): Promise<boolean> {
  const unique = new Set(candidates.filter((path): path is string => typeof path === "string" && path.trim().length > 0));
  for (const candidate of unique) {
    if ((await realpathOrNull(candidate)) === realRequested) return true;
  }
  return false;
}

export function workspaceRegistryOptions(roots: AppDataRoots): WorkspaceRegistryOptions {
  return {
    dataRoot: roots.dataRoot,
    defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
    fallbackWorkspaceRoot: roots.workspaceRoot,
  };
}

/** 生产环境的依赖：registry 来自 workspaces.json，会话来自运行时；运行时还没 boot 时当作没有会话。 */
export function createWorkspaceAccessDeps(
  registryOptions: WorkspaceRegistryOptions,
  listSessions: () => Promise<readonly { readonly workspaceRoot?: string | null }[]>,
): WorkspaceAccessDeps {
  return {
    readRegistry: () => readWorkspaceRegistry(registryOptions),
    listSessionWorkspaceRoots: async () => {
      try {
        return (await listSessions()).map((session) => session.workspaceRoot);
      } catch {
        return [];
      }
    },
  };
}

/**
 * 要把路径写进会话或交给 git 写操作时用：只认 registry 条目，返回条目里记录的 path 原文
 * （不做 realpath，侧栏按这个字符串给会话分组）。
 */
export async function registeredWorkspaceRoot(options: WorkspaceRegistryOptions, requested?: string): Promise<string> {
  const resolved = await resolveRegisteredWorkspaceSelection(options, { workspaceRoot: requested ?? options.defaultWorkspaceRoot });
  if (resolved.ok === false) throw new Error(resolved.error);
  return resolved.workspaceRoot;
}

/** `child` 等于 `parent` 或在它下面。只做路径比较，调用方负责先 realpath。`..foo` 这类名字不算越界。 */
export function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export async function realpathOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

/** 对最近一个存在的祖先做 realpath，再接上不存在的那几段。用来判断还不存在的路径会落在哪里。 */
export async function realpathOfNearestExisting(path: string): Promise<string> {
  const missing: string[] = [];
  let current = resolve(path);
  for (;;) {
    const real = await realpathOrNull(current);
    if (real) return missing.length > 0 ? join(real, ...missing.reverse()) : real;
    const parent = dirname(current);
    if (parent === current) return resolve(path);
    missing.push(basename(current));
    current = parent;
  }
}
