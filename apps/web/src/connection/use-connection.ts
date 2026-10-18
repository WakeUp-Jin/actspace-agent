import { createContext, useContext, useSyncExternalStore } from "react";
import type { ConnectionState, ConnectionStore, HostConnection, HostDescription } from "./connection-store";

export const ConnectionContext = createContext<ConnectionStore | null>(null);

export function useConnectionStore(): ConnectionStore {
  const store = useContext(ConnectionContext);
  if (!store) throw new Error("ConnectionContext is missing");
  return store;
}

export function useConnection(): ConnectionState {
  const store = useConnectionStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** 工作区和模型列表：断线时用最近一次连接的结果。 */
export function useHostDescription(): HostDescription | null {
  const state = useConnection();
  return state.connection?.description ?? state.description;
}

/** 当前可用的连接；断线时为 null。 */
export function useHostConnection(): HostConnection | null {
  return useConnection().connection;
}
