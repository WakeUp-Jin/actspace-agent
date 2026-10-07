import { useRef, useSyncExternalStore } from "react";
import { spaceDemoStore, type SpaceDemoActions, type SpaceDemoStore } from "./space-demo-store";
import type { SpaceDemoState } from "./types";

/** 整个 state；状态没变时引用不变，配合 React.memo 使用 */
export function useSpaceDemoState(store: SpaceDemoStore = spaceDemoStore): SpaceDemoState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** 稳定的动作对象，组件不会因为它重渲染 */
export function useSpaceDemoActions(store: SpaceDemoStore = spaceDemoStore): SpaceDemoActions {
  return store.actions;
}

/**
 * 带 selector 的版本。selector 的结果按 state 引用缓存：state 没变就不重算，
 * selector 必须只依赖 state，所以可以返回新对象，不会触发无限重渲染。
 */
export function useSpaceDemoSelector<T>(selector: (state: SpaceDemoState) => T, store: SpaceDemoStore = spaceDemoStore): T {
  const cache = useRef<{ state: SpaceDemoState; value: T } | null>(null);
  const getSnapshot = (): T => {
    const state = store.getSnapshot();
    const hit = cache.current;
    if (hit && hit.state === state) return hit.value;
    const value = selector(state);
    cache.current = { state, value };
    return value;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
