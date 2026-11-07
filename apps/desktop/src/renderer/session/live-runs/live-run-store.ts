import { useCallback, useRef, useSyncExternalStore } from "react";
import type { LiveRunStore, LiveRunView, SteeredMessage } from "@actspace/client/live";
import type { QueuedComposerMessage } from "../message-queue";

// store 本体已迁到 @actspace/client/live（Web 端共用），这里只留 React 订阅。
export { TERMINAL_RUN_LIMIT, createBoundedSet, createLiveRunStore, type LiveRunStore, type LiveRunView, type StreamEvent } from "@actspace/client/live";

// applyStreamEvent 的 onSteered 直接返回排队消息。
type Steered<T extends SteeredMessage> = T;
export type QueuedSteeredContract = Steered<QueuedComposerMessage>;

export function useLiveRunView(store: LiveRunStore, sessionId: string | null): LiveRunView {
  const getSnapshot = useCallback(() => store.view(sessionId), [store, sessionId]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/**
 * 订阅会话 live run 视图的一部分。流式输出每帧都会换一个新的 view（blocks 变长），
 * 只关心运行状态的组件（App、Composer 外壳）用这个 hook：selector 的结果按 `isEqual` 判等，
 * 相等就沿用上一次的引用，组件不随帧重渲染。
 */
export function useLiveRunSelect<T>(store: LiveRunStore, sessionId: string | null, selector: (view: LiveRunView) => T, isEqual: (left: T, right: T) => boolean = Object.is): T {
  const cache = useRef<{ view: LiveRunView; selector: typeof selector; value: T } | null>(null);
  const getSnapshot = useCallback(() => {
    const view = store.view(sessionId);
    const cached = cache.current;
    if (cached && cached.view === view && cached.selector === selector) return cached.value;
    const value = selector(view);
    const next = cached && isEqual(cached.value, value) ? cached.value : value;
    cache.current = { view, selector, value: next };
    return next;
  }, [store, sessionId, selector, isEqual]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useBusySessionIds(store: LiveRunStore): Set<string> {
  return useSyncExternalStore(store.subscribe, store.busyIds, store.busyIds);
}
