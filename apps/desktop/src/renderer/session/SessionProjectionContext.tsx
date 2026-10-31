import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClientSessionStore, type ClientLiveOverlay, type ClientSessionCell } from "@actspace/client/sessions";
import { createDesktopSessionBridge, type DesktopSessionBridge } from "./desktop-session-bridge";
import { liveEvents } from "../api/live-events";
import { scheduleFrame } from "./frame-batch";
import { sessionsApi } from "../api/sessions";

export type SessionProjectionContextValue = {
  readonly sessionId: string | null;
  readonly cell: ClientSessionCell | null;
  readonly overlay: ClientLiveOverlay | null;
  readonly store: ClientSessionStore;
  readonly bridge: DesktopSessionBridge | null;
};

const SessionProjectionContext = createContext<SessionProjectionContextValue | null>(null);

/**
 * Desktop React adapter for the framework-neutral ClientSessionStore.
 * The provider owns subscription and Session selection; consumers only read
 * the selected Session-bound cell and never reconstruct Journal state.
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
  const [version, setVersion] = useState(0);
  if (storeRef.current === null) storeRef.current = new ClientSessionStore();
  const store = suppliedStore ?? storeRef.current;
  const ownsStore = suppliedStore === undefined;

  useEffect(() => {
    const unsubscribeStore = store.subscribe(() => setVersion((value) => value + 1));
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: sessionsApi.getProjectionSnapshot,
      onSessionLiveEvent: liveEvents.subscribe,
    }, store, { scheduleStreamFlush: scheduleFrame });
    bridgeRef.current = bridge;
    bridge.start();
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
      unsubscribeStore();
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
    const bridge = bridgeRef.current;
    if (bridge === null) {
      store.select(sessionId);
      return;
    }
    // 失败已由 bridge 写进 cell 的 status/error，会话视图据此显示错误和「重试」；这里只避免未处理的 rejection。
    void bridge.open(sessionId).catch(() => undefined);
  }, [ownsStore, sessionId, store]);

  const value = useMemo<SessionProjectionContextValue>(() => ({
    sessionId,
    cell: sessionId === null ? null : store.get(sessionId),
    overlay: sessionId === null ? null : store.getOverlay(sessionId),
    store,
    bridge: bridgeRef.current,
  }), [sessionId, store, version]);

  return <SessionProjectionContext.Provider value={value}>{children}</SessionProjectionContext.Provider>;
}

/**
 * 给非当前会话（右栏的侧边对话）一份投影：沿用外层 Provider 的 store 和 bridge，用 `bridge.watch`
 * 拉取并跟随它，不改 store 的选中会话。scope 里的 Composer、上下文胶囊和统计读到的是这个会话。
 */
export function SessionProjectionScope({ sessionId, children }: { readonly sessionId: string; readonly children: ReactNode }) {
  const outer = useContext(SessionProjectionContext);
  const bridge = outer?.bridge ?? null;
  useEffect(() => bridge?.watch(sessionId), [bridge, sessionId]);
  const store = outer?.store ?? null;
  // 外层 value 随 store 每次变化而更新，这里跟着它重算。
  const value = useMemo<SessionProjectionContextValue | null>(() => store ? {
    sessionId,
    cell: store.get(sessionId),
    overlay: store.getOverlay(sessionId),
    store,
    bridge,
  } : null, [outer, sessionId, store, bridge]);
  if (!value) return <>{children}</>;
  return <SessionProjectionContext.Provider value={value}>{children}</SessionProjectionContext.Provider>;
}

/** Optional form for isolated renderer component tests and non-chat surfaces. */
export function useOptionalSessionProjection(): SessionProjectionContextValue | null {
  return useContext(SessionProjectionContext);
}
