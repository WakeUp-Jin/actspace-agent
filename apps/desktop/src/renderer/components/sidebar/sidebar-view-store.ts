import { useSyncExternalStore } from "react";
import {
  defaultSidebarViewState, parseSidebarViewState,
  type SidebarArchivedFilter, type SidebarGroupBy, type SidebarSort, type SidebarViewState,
} from "./sidebar-view";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type FlagMap = "sectionCollapsed" | "groupCollapsed" | "timeCollapsed";

export const SIDEBAR_VIEW_STORAGE_KEY = "actspace.sidebar.view.v1";

export interface SidebarViewStore {
  get(): SidebarViewState;
  subscribe(listener: () => void): () => void;
  setGroupBy(groupBy: SidebarGroupBy): void;
  /** 切到手动排序时传入当前看到的顺序作为快照，列表不跳；切到最近更新时清空保存的顺序（DSH）。 */
  setSort(sort: SidebarSort, snapshot?: Record<string, string[]>): void;
  setArchived(filter: SidebarArchivedFilter): void;
  /** 恢复默认视图选项，同时清空手动顺序；折叠状态保留。 */
  resetOptions(): void;
  /** 拖拽后写一个账本的顺序；`snapshot` 存在时表示从最近更新切到了手动，先用它铺好其余账本。 */
  setOrder(account: string, order: string[], snapshot?: Record<string, string[]>): void;
  toggle(map: FlagMap, key: string): void;
  setFlag(map: FlagMap, key: string, value: boolean): void;
}

/** 侧栏视图偏好（分组、排序、归档筛选、手动顺序、折叠状态），存 localStorage；读写失败只保留在内存里。 */
export function createSidebarViewStore(storage: () => StorageLike | undefined): SidebarViewStore {
  const listeners = new Set<() => void>();
  let cache: SidebarViewState | null = null;
  // 记下缓存对应的原始字符串：存储被别处改掉或清空（测试之间）时重新解析，没变时返回同一个对象。
  let cachedRaw: string | null | undefined;
  const readRaw = (): string | null | undefined => {
    try { return storage()?.getItem(SIDEBAR_VIEW_STORAGE_KEY); } catch { return cachedRaw; }
  };
  const read = (): SidebarViewState => {
    const raw = readRaw();
    if (cache && raw === cachedRaw) return cache;
    cachedRaw = raw;
    try {
      cache = parseSidebarViewState(JSON.parse(raw ?? "null"));
    } catch {
      cache = defaultSidebarViewState();
    }
    return cache;
  };
  const write = (next: SidebarViewState) => {
    cache = next;
    const raw = JSON.stringify(next);
    try { storage()?.setItem(SIDEBAR_VIEW_STORAGE_KEY, raw); cachedRaw = raw; } catch { /* 存不下时只保留在内存里。 */ }
    for (const listener of [...listeners]) listener();
  };
  const update = (fn: (state: SidebarViewState) => SidebarViewState) => {
    const current = read();
    const next = fn(current);
    if (next !== current) write(next);
  };
  return {
    get: read,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setGroupBy: (groupBy) => update((state) => state.options.groupBy === groupBy ? state : { ...state, options: { ...state.options, groupBy } }),
    setSort: (sort, snapshot) => update((state) => state.options.sort === sort ? state : {
      ...state,
      options: { ...state.options, sort },
      orders: sort === "manual" ? { ...snapshot } : {},
    }),
    setArchived: (archived) => update((state) => state.options.archived === archived ? state : { ...state, options: { ...state.options, archived } }),
    resetOptions: () => update((state) => ({ ...state, options: defaultSidebarViewState().options, orders: {} })),
    setOrder: (account, order, snapshot) => update((state) => ({
      ...state,
      options: { ...state.options, sort: "manual" },
      orders: { ...(state.options.sort === "manual" ? state.orders : snapshot), [account]: order },
    })),
    toggle: (map, key) => update((state) => ({ ...state, [map]: withFlag(state[map], key, !state[map][key]) })),
    setFlag: (map, key, value) => update((state) => Boolean(state[map][key]) === value ? state : { ...state, [map]: withFlag(state[map], key, value) }),
  };
}

function withFlag(flags: Record<string, boolean>, key: string, value: boolean): Record<string, boolean> {
  const next = { ...flags };
  if (value) next[key] = true;
  else delete next[key];
  return next;
}

export const sidebarViewStore = createSidebarViewStore(() => typeof window === "undefined" ? undefined : window.localStorage);

export function useSidebarView(store: SidebarViewStore = sidebarViewStore): SidebarViewState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
