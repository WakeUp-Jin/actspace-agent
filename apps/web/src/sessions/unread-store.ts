import { useSyncExternalStore } from "react";

/**
 * 本机未读（front-web-pwa客户端规范 §9.1）：localStorage `actspace.web.seen` 记录每个会话最后一次
 * 在前台查看时的 updatedAt。会话 updatedAt 更新且不是当前打开的会话时视为未读，只在本机生效。
 *
 * 详情页在会话打开期间随 updatedAt 调用 `markSeen`；列表页用 `seedSeen` 给没记录过的会话打基线。
 */
const KEY = "actspace.web.seen";
type Seen = Readonly<Record<string, string>>;

let cache: Seen | null = null;
const listeners = new Set<() => void>();

function load(): Seen {
  if (cache) return cache;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    cache = value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string")) as Seen : {};
  } catch { cache = {}; }
  return cache;
}

/** 测试用：丢弃内存缓存，下次从 localStorage 重读。 */
export function resetUnreadCache(): void {
  cache = null;
  for (const listener of [...listeners]) listener();
}

/** 记录会话已读到 updatedAt（只前进不后退）。 */
export function markSeen(sessionId: string, updatedAt: string): void {
  const seen = load();
  if ((seen[sessionId] ?? "") >= updatedAt) return;
  cache = { ...seen, [sessionId]: updatedAt };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 只在本次页面内有效 */ }
  for (const listener of [...listeners]) listener();
}

/** 给没有记录过的会话记下当前 updatedAt 作为基线，之后的更新才能显示未读。 */
export function seedSeen(items: readonly { readonly sessionId: string; readonly updatedAt: string }[]): void {
  const seen = load();
  const missing = items.filter(item => seen[item.sessionId] === undefined);
  if (missing.length === 0) return;
  cache = { ...seen, ...Object.fromEntries(missing.map(item => [item.sessionId, item.updatedAt])) };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 只在本次页面内有效 */ }
  for (const listener of [...listeners]) listener();
}

/** 没有记录过的会话视为已读（首次连接时不把历史会话都标成未读）。 */
export function isUnread(sessionId: string, updatedAt: string, openSessionId: string | null, seen: Seen = load()): boolean {
  if (sessionId === openSessionId) return false;
  const last = seen[sessionId];
  return last !== undefined && updatedAt > last;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 订阅已读表；列表页用它重新计算未读。 */
export function useSeen(): Seen {
  return useSyncExternalStore(subscribe, load, load);
}
