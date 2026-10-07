import type { HostDescription } from "./host-directory";

/** 03-1：Host 不返回会话的 workspaceId，模型也不在会话 meta 里，由 renderer 按会话记下。 */
export type RemoteSessionPrefs = { readonly workspaceId?: string; readonly modelId?: string; readonly recordedAt: number };
type PrefsRecord = Readonly<Record<string, RemoteSessionPrefs>>;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const REMOTE_SESSION_PREFS_KEY = "actspace:remote-session-prefs";

export interface RemoteSessionPrefsStore {
  get(sessionKey: string): RemoteSessionPrefs | undefined;
  set(sessionKey: string, patch: { readonly workspaceId?: string; readonly modelId?: string }): void;
  remove(sessionKey: string): void;
  subscribe(listener: () => void): () => void;
}

/**
 * localStorage 里的 `{ [sessionKey]: { workspaceId?, modelId?, recordedAt } }`。
 * 读写失败（隐私模式、配额、内容损坏）都当作没有记录，不影响界面。
 */
export function createRemoteSessionPrefsStore(storage: () => StorageLike | undefined, now: () => number = Date.now): RemoteSessionPrefsStore {
  const listeners = new Set<() => void>();
  let cache: PrefsRecord | null = null;
  const read = (): PrefsRecord => {
    if (cache) return cache;
    try {
      const value: unknown = JSON.parse(storage()?.getItem(REMOTE_SESSION_PREFS_KEY) ?? "{}");
      cache = value && typeof value === "object" && !Array.isArray(value) ? value as PrefsRecord : {};
    } catch {
      cache = {};
    }
    return cache;
  };
  const write = (next: PrefsRecord) => {
    cache = next;
    try { storage()?.setItem(REMOTE_SESSION_PREFS_KEY, JSON.stringify(next)); } catch { /* 存不下时只保留在内存里。 */ }
    for (const listener of [...listeners]) listener();
  };
  return {
    get: (sessionKey) => read()[sessionKey],
    set: (sessionKey, patch) => {
      const current = read()[sessionKey];
      const merged = { ...current, ...patch };
      if (current && current.workspaceId === merged.workspaceId && current.modelId === merged.modelId) return;
      write({ ...read(), [sessionKey]: { ...merged, recordedAt: now() } });
    },
    remove: (sessionKey) => {
      const current = read();
      if (!(sessionKey in current)) return;
      const next = { ...current };
      delete next[sessionKey];
      write(next);
    },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export const remoteSessionPrefs = createRemoteSessionPrefsStore(() => typeof window === "undefined" ? undefined : window.localStorage);

/**
 * 远端会话的工作区：先看记录；没有记录的旧会话按会话 meta 里的路径反查。
 * 记录的 id 在 Host 上已经没有（管理员改了工作区 id）时，同样按路径反查；路径也对不上才算工作区缺失。
 * 纯函数，不在渲染中写存储：`fromPath` 为 true 时由调用方（`useRunTarget` 的 effect）写回一次，之后就不再反查。
 * 反查不到（Host 上没有这个工作区，或 describe 还没回来）时返回记录的 id 或空串。
 */
export function resolveRemoteWorkspaceId(prefs: RemoteSessionPrefs | undefined, sessionWorkspacePath: string | null | undefined, description: HostDescription | undefined): { readonly workspaceId: string; readonly fromPath: boolean } {
  const recorded = prefs?.workspaceId;
  if (recorded && (!description || description.workspaces.some((workspace) => workspace.id === recorded))) return { workspaceId: recorded, fromPath: false };
  const found = sessionWorkspacePath ? description?.workspaces.find((workspace) => workspace.path === sessionWorkspacePath)?.id : undefined;
  if (found) return { workspaceId: found, fromPath: true };
  return { workspaceId: recorded ?? "", fromPath: false };
}
