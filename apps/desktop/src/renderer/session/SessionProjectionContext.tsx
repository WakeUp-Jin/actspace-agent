import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClientSessionStore, type ClientLiveOverlay, type ClientSessionCell } from "@actspace/client/sessions";
import { createDesktopSessionBridge, type DesktopSessionBridge } from "./desktop-session-bridge";

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
}: {
  readonly sessionId: string | null;
  readonly children: ReactNode;
}) {
  const storeRef = useRef<ClientSessionStore | null>(null);
  const bridgeRef = useRef<DesktopSessionBridge | null>(null);
  const [version, setVersion] = useState(0);
  if (storeRef.current === null) storeRef.current = new ClientSessionStore();
  const store = storeRef.current;

  useEffect(() => {
    const unsubscribeStore = store.subscribe(() => setVersion((value) => value + 1));
    const api = typeof window === "undefined" ? undefined : window.actspace;
    if (!api?.getSessionProjectionSnapshot || !api.onSessionLiveEvent) {
      return unsubscribeStore;
    }
    const bridge = createDesktopSessionBridge({
      getSessionProjectionSnapshot: api.getSessionProjectionSnapshot,
      onSessionLiveEvent: api.onSessionLiveEvent,
    }, store);
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
    const bridge = bridgeRef.current;
    if (bridge === null) {
      store.select(sessionId);
      return;
    }
    void bridge.open(sessionId).catch(() => undefined);
  }, [sessionId, store]);

  const value = useMemo<SessionProjectionContextValue>(() => ({
    sessionId,
    cell: sessionId === null ? null : store.get(sessionId),
    overlay: sessionId === null ? null : store.getOverlay(sessionId),
    store,
    bridge: bridgeRef.current,
  }), [sessionId, store, version]);

  return <SessionProjectionContext.Provider value={value}>{children}</SessionProjectionContext.Provider>;
}

export function useSessionProjection(): SessionProjectionContextValue {
  const value = useContext(SessionProjectionContext);
  if (value === null) throw new Error("useSessionProjection must be used within a SessionProjectionProvider");
  return value;
}

/** Optional form for isolated renderer component tests and non-chat surfaces. */
export function useOptionalSessionProjection(): SessionProjectionContextValue | null {
  return useContext(SessionProjectionContext);
}
