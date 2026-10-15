import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, basename, resolve } from "node:path";
import type { SessionListItem, WorkspaceEntry, WorkspaceRegistry } from "@actspace/shared";

const WORKSPACES_FILE = "workspaces.json";
/** 首次启动兜底工作区的名字。登记后就是普通工作区：可以移除，移除后不再重建。 */
const DEFAULT_WORKSPACE_LABEL = "默认工作区";
const workspaceRegistryOperationChains = new Map<string, Promise<void>>();

export type WorkspaceRegistryOptions = {
  dataRoot: string;
  /** registry 里一个工作区都没有（含已隐藏）时，创建这个目录并登记。 */
  defaultWorkspaceRoot: string;
  fallbackWorkspaceRoot: string;
  sessions?: SessionListItem[];
};

export type WorkspaceSelectionInput = {
  workspaceId?: string;
  workspaceRoot?: string;
};

export type WorkspaceSelectionResult =
  | { ok: true; workspaceId: string; workspaceRoot: string }
  | { ok: false; error: string };

export type WorkspaceVisibilityResult =
  | { ok: true }
  | { ok: false; error: "workspace_not_found" };

export function readWorkspaceRegistry(options: WorkspaceRegistryOptions): Promise<WorkspaceRegistry> {
  return runWorkspaceRegistryOperation(options.dataRoot, () => readWorkspaceRegistryUnsafe(options));
}

async function readWorkspaceRegistryUnsafe(options: WorkspaceRegistryOptions): Promise<WorkspaceRegistry> {
  const fallback = createFallbackRegistry(options);
  const filePath = workspaceRegistryPath(options.dataRoot);

  let registry: WorkspaceRegistry;
  let needsWrite = false;
  try {
    const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    registry = sanitizeWorkspaceRegistry(raw);
    needsWrite = JSON.stringify(raw) !== JSON.stringify(registry);
  } catch {
    registry = fallback;
    needsWrite = true;
  }

  const withFallback = mergeWorkspaceEntries(registry, fallback.items);
  let merged = mergeSessionWorkspaces(withFallback, options.sessions ?? []);
  if (merged.items.length === 0) merged = await addFirstRunWorkspace(merged, options.defaultWorkspaceRoot);
  if (JSON.stringify(merged) !== JSON.stringify(registry) || needsWrite) {
    await writeWorkspaceRegistry(options.dataRoot, merged);
  }

  return merged;
}

export function createFallbackRegistry(options: WorkspaceRegistryOptions): WorkspaceRegistry {
  const fallbackRoot = normalizeWorkspacePath(options.fallbackWorkspaceRoot);
  // 打包版的 fallback 就是兜底目录，交给 addFirstRunWorkspace 建目录并起名；开发版是仓库根或环境变量指定的目录。
  const items = fallbackRoot && fallbackRoot !== normalizeWorkspacePath(options.defaultWorkspaceRoot)
    ? [createFolderWorkspaceEntry(fallbackRoot, 0)]
    : [];
  return mergeSessionWorkspaces({ version: 1, items }, options.sessions ?? []);
}

/** 首次启动兜底：建目录并登记成普通工作区。建不了只记日志，用户自己选文件夹。 */
async function addFirstRunWorkspace(registry: WorkspaceRegistry, root: string): Promise<WorkspaceRegistry> {
  const path = normalizeWorkspacePath(root);
  if (!path) return registry;
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    console.warn("[workspace-registry] failed to create default workspace", error);
    return registry;
  }
  return { ...registry, items: [{ ...createFolderWorkspaceEntry(path, 0), label: DEFAULT_WORKSPACE_LABEL }] };
}

export function workspaceRegistryPath(dataRoot: string): string {
  return join(dataRoot, WORKSPACES_FILE);
}

export function resolveWorkspaceSelection(
  options: WorkspaceRegistryOptions,
  input: WorkspaceSelectionInput = {},
): Promise<WorkspaceSelectionResult> {
  return runWorkspaceRegistryOperation(
    options.dataRoot,
    () => resolveWorkspaceSelectionUnsafe(options, input),
  );
}

async function resolveWorkspaceSelectionUnsafe(
  options: WorkspaceRegistryOptions,
  input: WorkspaceSelectionInput,
): Promise<WorkspaceSelectionResult> {
  const registry = await readWorkspaceRegistryUnsafe(options);
  const workspaceId = input.workspaceId?.trim();
  if (workspaceId) {
    const entry = registry.items.find((item) => item.id === workspaceId);
    if (!entry) {
      return { ok: false, error: `workspaceId not found: ${workspaceId}` };
    }
    return { ok: true, workspaceId: entry.id, workspaceRoot: entry.path };
  }

  const workspaceRoot = input.workspaceRoot ? normalizeWorkspacePath(input.workspaceRoot) : "";
  if (workspaceRoot) {
    const existing = registry.items.find((item) => item.path === workspaceRoot);
    if (existing) {
      if (existing.hidden) {
        await writeWorkspaceRegistry(options.dataRoot, {
          ...registry,
          items: registry.items.map((item) => item.id === existing.id
            ? { ...item, hidden: false, updatedAt: new Date().toISOString() }
            : item),
        });
      }
      return { ok: true, workspaceId: existing.id, workspaceRoot: existing.path };
    }

    const entry = createFolderWorkspaceEntry(workspaceRoot, registry.items.length);
    const nextRegistry = { ...registry, items: sortWorkspaceItems([...registry.items, entry]) };
    await writeWorkspaceRegistry(options.dataRoot, nextRegistry);
    return { ok: true, workspaceId: entry.id, workspaceRoot: entry.path };
  }

  return { ok: false, error: "workspace is required" };
}

export function setWorkspaceHidden(
  options: WorkspaceRegistryOptions,
  workspaceId: string,
  hidden: boolean,
): Promise<WorkspaceVisibilityResult> {
  return runWorkspaceRegistryOperation(
    options.dataRoot,
    () => setWorkspaceHiddenUnsafe(options, workspaceId, hidden),
  );
}

async function setWorkspaceHiddenUnsafe(
  options: WorkspaceRegistryOptions,
  workspaceId: string,
  hidden: boolean,
): Promise<WorkspaceVisibilityResult> {
  const registry = await readWorkspaceRegistryUnsafe(options);
  const workspace = registry.items.find((item) => item.id === workspaceId);
  if (!workspace) return { ok: false, error: "workspace_not_found" };
  if (Boolean(workspace.hidden) === hidden) return { ok: true };

  await writeWorkspaceRegistry(options.dataRoot, {
    ...registry,
    items: registry.items.map((item) => item.id === workspaceId
      ? { ...item, hidden, updatedAt: new Date().toISOString() }
      : item),
  });
  return { ok: true };
}

export async function resolveRegisteredWorkspaceSelection(
  options: WorkspaceRegistryOptions,
  input: WorkspaceSelectionInput = {},
): Promise<WorkspaceSelectionResult> {
  const registry = await readWorkspaceRegistry(options);
  const workspaceId = input.workspaceId?.trim();
  if (workspaceId) {
    const entry = registry.items.find((item) => item.id === workspaceId);
    return entry
      ? { ok: true, workspaceId: entry.id, workspaceRoot: entry.path }
      : { ok: false, error: `workspaceId not found: ${workspaceId}` };
  }

  const workspaceRoot = normalizeWorkspacePath(input.workspaceRoot ?? options.defaultWorkspaceRoot);
  const entry = registry.items.find((item) => item.path === workspaceRoot);
  return entry
    ? { ok: true, workspaceId: entry.id, workspaceRoot: entry.path }
    : { ok: false, error: "workspaceRoot is not registered" };
}

export async function createWorkspaceFolder(
  options: WorkspaceRegistryOptions,
  input: { parentRoot: string; name: string },
): Promise<WorkspaceSelectionResult> {
  const name = input.name.trim();
  if (!name || name === "." || name === ".." || /[\\/]/.test(name)) {
    return { ok: false, error: "Folder name must be a single non-empty path segment." };
  }
  const parentRoot = normalizeWorkspacePath(input.parentRoot);
  const workspaceRoot = join(parentRoot, name);
  try {
    await mkdir(workspaceRoot);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return resolveWorkspaceSelection(options, { workspaceRoot });
}

/** 旧版的 `kind: "default"`（指向 Downloads 的默认工作区）在这里丢掉。 */
function sanitizeWorkspaceRegistry(raw: unknown): WorkspaceRegistry {
  if (!raw || typeof raw !== "object") return { version: 1, items: [] };
  const value = raw as Partial<WorkspaceRegistry>;
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items: WorkspaceEntry[] = [];
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const now = new Date().toISOString();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Partial<WorkspaceEntry>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const path = typeof entry.path === "string" ? normalizeWorkspacePath(entry.path) : "";
    if (!id || !label || !path || entry.kind !== "folder" || seenIds.has(id) || seenPaths.has(path)) continue;
    seenIds.add(id);
    seenPaths.add(path);
    items.push({
      id,
      kind: "folder",
      label,
      path,
      order: typeof entry.order === "number" ? entry.order : items.length,
      hidden: entry.hidden === true,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : now,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : now,
    });
  }

  return { version: 1, items: sortWorkspaceItems(items) };
}

function mergeSessionWorkspaces(registry: WorkspaceRegistry, sessions: SessionListItem[]): WorkspaceRegistry {
  return mergeWorkspaceEntries(
    registry,
    sessions
      .map((session) => {
        const root = session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot;
        return root ? normalizeWorkspacePath(root) : "";
      })
      .filter(Boolean)
      .map((root, index) => createFolderWorkspaceEntry(root, registry.items.length + index)),
  );
}

function mergeWorkspaceEntries(registry: WorkspaceRegistry, entries: WorkspaceEntry[]): WorkspaceRegistry {
  const items = [...registry.items];
  const paths = new Set(items.map((item) => item.path));
  let changed = false;
  for (const entry of entries) {
    if (!entry.path || paths.has(entry.path)) continue;
    items.push(createFolderWorkspaceEntry(entry.path, items.length, entry.createdAt));
    paths.add(entry.path);
    changed = true;
  }
  if (!changed) return registry;
  return { ...registry, items: sortWorkspaceItems(items) };
}

function normalizeWorkspacePath(path: string): string {
  const trimmed = path.trim();
  return trimmed ? resolve(trimmed) : "";
}

function createFolderWorkspaceEntry(path: string, order: number, timestamp = new Date().toISOString()): WorkspaceEntry {
  return {
    id: workspaceIdFromPath(path),
    kind: "folder",
    label: basename(path) || path,
    path,
    order,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function workspaceIdFromPath(path: string): string {
  const slug = (basename(path) || "workspace")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36) || "workspace";
  const hash = hashString(path);
  return `ws_${slug}_${hash}`;
}

function runWorkspaceRegistryOperation<T>(dataRoot: string, operation: () => Promise<T>): Promise<T> {
  const key = workspaceRegistryPath(dataRoot);
  const previous = workspaceRegistryOperationChains.get(key) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  workspaceRegistryOperationChains.set(key, result.then(() => undefined, () => undefined));
  return result;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

function sortWorkspaceItems(items: WorkspaceEntry[]): WorkspaceEntry[] {
  return [...items].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

async function writeWorkspaceRegistry(dataRoot: string, registry: WorkspaceRegistry): Promise<void> {
  const filePath = workspaceRegistryPath(dataRoot);
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(registry, null, 2) + "\n", "utf8");
    await rename(tmp, filePath);
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}
