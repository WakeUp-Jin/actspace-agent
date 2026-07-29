import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, basename, resolve } from "node:path";
import type { SessionListItem, WorkspaceEntry, WorkspaceRegistry } from "@actspace/shared";

const WORKSPACES_FILE = "workspaces.json";
const DEFAULT_WORKSPACE_ID = "default";
const DEFAULT_WORKSPACE_LABEL = "Default workspace";
const workspaceRegistryOperationChains = new Map<string, Promise<void>>();

export type WorkspaceRegistryOptions = {
  dataRoot: string;
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
  | { ok: false; error: "workspace_not_found" | "default_workspace_required" };

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
    registry = sanitizeWorkspaceRegistry(raw, fallback);
    needsWrite = JSON.stringify(raw) !== JSON.stringify(registry);
  } catch {
    registry = fallback;
    needsWrite = true;
  }

  const withFallback = mergeWorkspaceEntries(registry, fallback.items);
  const merged = mergeSessionWorkspaces(withFallback, options.sessions ?? []);
  if (JSON.stringify(merged) !== JSON.stringify(registry) || needsWrite) {
    await writeWorkspaceRegistry(options.dataRoot, merged);
  }

  return merged;
}

export function createFallbackRegistry(options: WorkspaceRegistryOptions): WorkspaceRegistry {
  const now = new Date().toISOString();
  const defaultWorkspaceRoot = normalizeWorkspacePath(options.defaultWorkspaceRoot);
  const items: WorkspaceEntry[] = [
    {
      id: DEFAULT_WORKSPACE_ID,
      kind: "default",
      label: DEFAULT_WORKSPACE_LABEL,
      path: defaultWorkspaceRoot,
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const fallbackRoot = normalizeWorkspacePath(options.fallbackWorkspaceRoot);
  if (fallbackRoot && fallbackRoot !== defaultWorkspaceRoot) {
    items.push(createFolderWorkspaceEntry(fallbackRoot, items.length, now));
  }

  return mergeSessionWorkspaces({
    version: 1,
    defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
    items,
  }, options.sessions ?? []);
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

  const defaultEntry =
    registry.items.find((item) => item.id === registry.defaultWorkspaceId) ??
    registry.items.find((item) => item.id === DEFAULT_WORKSPACE_ID) ??
    registry.items.find((item) => item.kind === "default");
  if (!defaultEntry) {
    return { ok: false, error: "default workspace is missing" };
  }
  return { ok: true, workspaceId: defaultEntry.id, workspaceRoot: defaultEntry.path };
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
  if (hidden && workspace.kind === "default") {
    return { ok: false, error: "default_workspace_required" };
  }
  if (Boolean(workspace.hidden) === hidden) return { ok: true };

  await writeWorkspaceRegistry(options.dataRoot, {
    ...registry,
    items: registry.items.map((item) => item.id === workspaceId
      ? { ...item, hidden, updatedAt: new Date().toISOString() }
      : item),
  });
  return { ok: true };
}

function sanitizeWorkspaceRegistry(raw: unknown, fallback: WorkspaceRegistry): WorkspaceRegistry {
  if (!raw || typeof raw !== "object") return fallback;
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
    const kind = entry.kind === "default" ? "default" : entry.kind === "folder" ? "folder" : null;
    if (!id || !label || !path || !kind || seenIds.has(id)) continue;
    if (kind !== "default" && seenPaths.has(path)) continue;
    seenIds.add(id);
    seenPaths.add(path);
    items.push({
      id,
      kind,
      label,
      path,
      order: typeof entry.order === "number" ? entry.order : items.length,
      hidden: kind === "default" ? false : entry.hidden === true,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : now,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : now,
    });
  }

  const defaultItem = items.find((item) => item.id === DEFAULT_WORKSPACE_ID && item.kind === "default");
  if (!defaultItem) {
    return fallback;
  }

  const fallbackDefaultPath =
    fallback.items.find((item) => item.id === DEFAULT_WORKSPACE_ID && item.kind === "default")?.path ??
    defaultItem.path;
  const normalizedItems = items.map((item) =>
    item.id === DEFAULT_WORKSPACE_ID && item.kind === "default"
      ? {
          ...item,
          label: DEFAULT_WORKSPACE_LABEL,
          path: fallbackDefaultPath,
          updatedAt: item.path === fallbackDefaultPath ? item.updatedAt : now,
        }
      : item,
  );
  const defaultWorkspaceId =
    typeof value.defaultWorkspaceId === "string" &&
    normalizedItems.some((item) => item.id === value.defaultWorkspaceId)
      ? value.defaultWorkspaceId
      : DEFAULT_WORKSPACE_ID;

  return {
    version: 1,
    defaultWorkspaceId,
    items: sortWorkspaceItems(normalizedItems),
  };
}

function mergeSessionWorkspaces(registry: WorkspaceRegistry, sessions: SessionListItem[]): WorkspaceRegistry {
  return mergeWorkspaceEntries(
    registry,
    sessions
      .map((session) => session.workspaceRoot ? normalizeWorkspacePath(session.workspaceRoot) : "")
      .filter(Boolean)
      .map((root, index) => createFolderWorkspaceEntry(root, registry.items.length + index)),
  );
}

function mergeWorkspaceEntries(registry: WorkspaceRegistry, entries: WorkspaceEntry[]): WorkspaceRegistry {
  const items = [...registry.items];
  const paths = new Set(items.map((item) => item.path));
  let changed = false;
  for (const entry of entries) {
    if (entry.kind === "default" || !entry.path || paths.has(entry.path)) continue;
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
  return [...items].sort((a, b) => {
    if (a.kind === "default") return -1;
    if (b.kind === "default") return 1;
    return a.order - b.order || a.label.localeCompare(b.label);
  });
}

async function writeWorkspaceRegistry(dataRoot: string, registry: WorkspaceRegistry): Promise<void> {
  const filePath = workspaceRegistryPath(dataRoot);
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(registry, null, 2) + "\n", "utf8");
  await rename(tmp, filePath);
}
