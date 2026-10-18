import { useCallback, useSyncExternalStore } from "react";
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

export function useBusySessionIds(store: LiveRunStore): Set<string> {
  return useSyncExternalStore(store.subscribe, store.busyIds, store.busyIds);
}
