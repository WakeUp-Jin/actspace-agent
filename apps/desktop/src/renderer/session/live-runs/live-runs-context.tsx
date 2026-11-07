import { createContext, useCallback, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import { requestOutputs, type LiveRunStore, type LiveRunView, type RequestLiveOutput } from "@actspace/client/live";

// 界面进程的实时运行状态（App 持有）。轨迹流式层按会话读它，不经过 App 的重渲染。
const LiveRunsContext = createContext<LiveRunStore | null>(null);

export function LiveRunsProvider({ store, children }: { readonly store: LiveRunStore; readonly children: ReactNode }) {
  return <LiveRunsContext.Provider value={store}>{children}</LiveRunsContext.Provider>;
}

const NONE: ReadonlyMap<string, RequestLiveOutput> = new Map();
const noStore = () => () => undefined;

/**
 * 会话实时运行里按请求归组的未定稿输出（轨迹流式层，规范 agent-spec-live-assistant-stream §6）。
 * 运行视图换了才重算；没有 Provider（测试、fixture）或没有运行时返回空表。
 */
export function useRequestOutputs(sessionId: string | null): ReadonlyMap<string, RequestLiveOutput> {
  const store = useContext(LiveRunsContext);
  const cache = useRef<{ store: LiveRunStore; sessionId: string; view: LiveRunView; value: ReadonlyMap<string, RequestLiveOutput> } | null>(null);
  const getSnapshot = useCallback(() => {
    if (store === null || sessionId === null) return NONE;
    const view = store.view(sessionId);
    const cached = cache.current;
    if (cached && cached.store === store && cached.sessionId === sessionId && cached.view === view) return cached.value;
    const value = requestOutputs(store.get(sessionId));
    cache.current = { store, sessionId, view, value };
    return value;
  }, [store, sessionId]);
  return useSyncExternalStore(store?.subscribe ?? noStore, getSnapshot, getSnapshot);
}
