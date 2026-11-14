import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ClientSessionStore,
  emptyClientSessionCell,
  type ClientLiveOverlay,
  type ClientSessionCell,
} from "@actspace/client/sessions";
import { createDesktopSessionBridge, type DesktopSessionBridge } from "./desktop-session-bridge";
import { liveEvents } from "../api/live-events";
import { sessionsApi } from "../api/sessions";

/** 会话投影的「当前会话 + 当时的 cell / overlay」。随当前会话的 cell 或 overlay 引用变化而换新（流式时每帧一次）。 */
export type SessionProjectionContextValue = {
  readonly sessionId: string | null;
  readonly cell: ClientSessionCell | null;
  readonly overlay: ClientLiveOverlay | null;
  readonly store: ClientSessionStore;
  readonly bridge: DesktopSessionBridge | null;
};

/** 不随 cell 变化的那部分：哪个会话、哪个 store、哪个 bridge。需要 cell 派生值的组件用 `useProjectionSelect`，不要读上面那个粗粒度 value。 */
export type SessionProjectionTarget = {
  readonly sessionId: string | null;
  readonly store: ClientSessionStore;
  readonly bridge: DesktopSessionBridge | null;
};

type ProjectionPair = { readonly cell: ClientSessionCell | null; readonly overlay: ClientLiveOverlay | null };

const NO_PAIR: ProjectionPair = Object.freeze({ cell: null, overlay: null });
const subscribeNothing = () => () => undefined;

const SessionProjectionContext = createContext<SessionProjectionContextValue | null>(null);
const SessionProjectionTargetContext = createContext<SessionProjectionTarget | null>(null);

/**
 * 订阅一个会话的 cell + overlay。只有这个会话自己的 cell / overlay 引用变了才返回新对象：
 * store 的通知是全局的（后台会话的事件也会来），这里读 `peek(id)` 比较引用，别的会话的变化不会触发重渲染。
 */
function useProjectionPair(store: ClientSessionStore | null, sessionId: string | null): ProjectionPair {
  const cache = useRef<{
    cell: ClientSessionCell | null;
    overlay: ClientLiveOverlay | null;
    pair: ProjectionPair;
  } | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => (store ? store.subscribe(onChange) : subscribeNothing()),
    [store],
  );
  const getSnapshot = useCallback((): ProjectionPair => {
    if (!store || sessionId === null) return NO_PAIR;
    const cell = store.peek(sessionId);
    const overlay = store.getOverlay(sessionId);
    const cached = cache.current;
    if (cached && cached.cell === cell && cached.overlay === overlay) return cached.pair;
    const pair = { cell, overlay };
    cache.current = { cell, overlay, pair };
    return pair;
  }, [store, sessionId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useCoarseValue(
  store: ClientSessionStore | null,
  bridge: DesktopSessionBridge | null,
  sessionId: string | null,
): SessionProjectionContextValue | null {
  const pair = useProjectionPair(store, sessionId);
  return useMemo<SessionProjectionContextValue | null>(
    () =>
      store
        ? {
            sessionId,
            // 没有 cell 时沿用旧行为：读到一个空 cell，而不是 null。
            cell: sessionId === null ? null : (pair.cell ?? store.get(sessionId)),
            overlay: sessionId === null ? null : pair.overlay,
            store,
            bridge,
          }
        : null,
    [store, bridge, sessionId, pair],
  );
}

/**
 * Desktop React adapter for the framework-neutral ClientSessionStore.
 * The provider owns subscription and Session selection; consumers only read
 * the selected Session-bound cell and never reconstruct Journal state.
 *
 * 渲染隔离：只有「当前会话自己」的 cell / overlay 变了，粗粒度 value 才换新；别的会话的事件不会让消费者重渲染。
 * 外壳组件（侧栏、右栏、输入框）不要读这个 value，用 `useProjectionSelect` 订阅它们真正需要的那一小块。
 */
export function SessionProjectionProvider({
  sessionId,
  children,
  store: suppliedStore,
}: {
  readonly sessionId: string | null;
  readonly children: ReactNode;
  readonly store?: ClientSessionStore;
}) {
  const storeRef = useRef<ClientSessionStore | null>(null);
  const bridgeRef = useRef<DesktopSessionBridge | null>(null);
  const [bridge, setBridge] = useState<DesktopSessionBridge | null>(null);
  if (storeRef.current === null) storeRef.current = new ClientSessionStore();
  const store = suppliedStore ?? storeRef.current;
  const ownsStore = suppliedStore === undefined;

  useEffect(() => {
    const created = createDesktopSessionBridge(
      {
        getSessionProjectionSnapshot: sessionsApi.getProjectionSnapshot,
        onSessionLiveEvent: liveEvents.subscribe,
        setObservedSessions: sessionsApi.setObserved,
      },
      store,
    );
    bridgeRef.current = created;
    created.start();
    setBridge(created);
    return () => {
      created.dispose();
      bridgeRef.current = null;
      setBridge(null);
    };
  }, [store]);

  useEffect(() => {
    if (sessionId === null) {
      store.select(null);
      return;
    }
    if (!ownsStore) {
      store.select(sessionId);
      return;
    }
    const current = bridgeRef.current;
    if (current === null) {
      store.select(sessionId);
      return;
    }
    // 失败已由 bridge 写进 cell 的 status/error，会话视图据此显示错误和「重试」；这里只避免未处理的 rejection。
    void current.open(sessionId).catch(() => undefined);
  }, [ownsStore, sessionId, store]);

  const target = useMemo<SessionProjectionTarget>(() => ({ sessionId, store, bridge }), [sessionId, store, bridge]);
  const value = useCoarseValue(store, bridge, sessionId);

  return (
    <SessionProjectionTargetContext.Provider value={target}>
      <SessionProjectionContext.Provider value={value}>{children}</SessionProjectionContext.Provider>
    </SessionProjectionTargetContext.Provider>
  );
}

/**
 * 给非当前会话（右栏的侧边对话）一份投影：沿用外层 Provider 的 store 和 bridge，用 `bridge.watch`
 * 拉取并跟随它，不改 store 的选中会话。scope 里的 Composer、上下文胶囊和统计读到的是这个会话。
 */
export function SessionProjectionScope({
  sessionId,
  children,
}: {
  readonly sessionId: string;
  readonly children: ReactNode;
}) {
  const outer = useContext(SessionProjectionTargetContext);
  const bridge = outer?.bridge ?? null;
  const store = outer?.store ?? null;
  useEffect(() => bridge?.watch(sessionId), [bridge, sessionId]);
  const target = useMemo<SessionProjectionTarget | null>(
    () => (store ? { sessionId, store, bridge } : null),
    [sessionId, store, bridge],
  );
  const value = useCoarseValue(store, bridge, sessionId);
  if (!target) return <>{children}</>;
  return (
    <SessionProjectionTargetContext.Provider value={target}>
      <SessionProjectionContext.Provider value={value}>{children}</SessionProjectionContext.Provider>
    </SessionProjectionTargetContext.Provider>
  );
}

/** Optional form for isolated renderer component tests and non-chat surfaces. */
export function useOptionalSessionProjection(): SessionProjectionContextValue | null {
  return useContext(SessionProjectionContext);
}

/** 当前投影指向的会话、store 和 bridge；它们稳定，不随 cell 变化。没有 Provider 时为 null。 */
export function useOptionalProjectionTarget(): SessionProjectionTarget | null {
  return useContext(SessionProjectionTargetContext);
}

/**
 * 订阅投影里的一小块派生值。cell / overlay 每次变更（流式时每帧一次）都会重算 selector，
 * 但结果按 `isEqual` 判等，相等就沿用上一次的引用，组件只在派生值真的变了才重渲染。
 * - `sessionId` 不传时取投影当前指向的会话；传了就读那个会话（要求它和 Provider 用同一个 store）。
 * - 没有 Provider 或没有会话时，selector 收到 `(null, null)`。
 * - `selector` 和 `isEqual` 建议用模块级函数；内联函数也正确，只是每次渲染多算一次。
 * 没有 cell 的会话收到的是一个空 cell（和 `useOptionalSessionProjection().cell` 一致），不是 null。
 */
export function useProjectionSelect<T>(
  selector: (cell: ClientSessionCell | null, overlay: ClientLiveOverlay | null) => T,
  isEqual: (left: T, right: T) => boolean = Object.is,
  sessionId?: string | null,
): T {
  const target = useContext(SessionProjectionTargetContext);
  const store = target?.store ?? null;
  const id = sessionId === undefined ? (target?.sessionId ?? null) : sessionId;
  const cache = useRef<{
    cell: ClientSessionCell | null;
    overlay: ClientLiveOverlay | null;
    selector: typeof selector;
    value: T;
  } | null>(null);
  const empty = useRef<ClientSessionCell | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => (store ? store.subscribe(onChange) : subscribeNothing()),
    [store],
  );
  const getSnapshot = useCallback((): T => {
    let cell: ClientSessionCell | null = null;
    let overlay: ClientLiveOverlay | null = null;
    if (store && id !== null) {
      cell = store.peek(id);
      if (!cell) {
        if (empty.current?.sessionId !== id) empty.current = emptyClientSessionCell(id);
        cell = empty.current;
      }
      overlay = store.getOverlay(id);
    }
    const cached = cache.current;
    if (cached && cached.cell === cell && cached.overlay === overlay && cached.selector === selector)
      return cached.value;
    const value = selector(cell, overlay);
    const next = cached && isEqual(cached.value, value) ? cached.value : value;
    cache.current = { cell, overlay, selector, value: next };
    return next;
  }, [store, id, selector, isEqual]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
