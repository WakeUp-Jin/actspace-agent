import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConnectionStore, useHostConnection } from "../connection/use-connection";
import { EMPTY_OBSERVATION, SessionObserver, type ObservationState } from "./session-observer";

export type SessionObservation = ObservationState & {
  /** 当前没有可用连接：界面继续显示旧内容，输入禁用。 */
  readonly disconnected: boolean;
  readonly loadOlder: () => Promise<void>;
  /** tasks.command 回包里的新快照交给观察器。 */
  readonly applyTasks: SessionObserver["applyTasks"];
  readonly refresh: () => Promise<void>;
};

const never = () => () => undefined;

/**
 * 进入会话 observe，离开 unobserve；连接对象换了（重连）就重新 observe。
 * epoch 不变时沿用投影，epoch 变了整体替换；重连期间继续显示上一次的内容。
 */
export function useSessionObservation(sessionId: string): SessionObservation {
  const connection = useHostConnection();
  const store = useConnectionStore();
  const [observer, setObserver] = useState<SessionObserver | null>(null);
  const previous = useRef<SessionObserver | null>(null);

  useEffect(() => {
    if (!connection) { previous.current?.dispose(); return; }
    const before = previous.current;
    const next = new SessionObserver(connection, sessionId, {
      onError: error => store.reportError(error),
      ...(before && before.sessionId === sessionId ? { carry: before.getState(), ...(before.epoch === connection.epoch ? { store: before.store } : {}) } : {}),
    });
    before?.dispose();
    previous.current = next;
    setObserver(next);
    void next.start();
    return () => next.dispose();
  }, [connection, sessionId, store]);

  const state = useSyncExternalStore(observer ? observer.subscribe : never, observer ? observer.getState : () => EMPTY_OBSERVATION);
  const loadOlder = useCallback(() => observer?.loadOlder() ?? Promise.resolve(), [observer]);
  const refresh = useCallback(() => observer?.refresh() ?? Promise.resolve(), [observer]);
  const applyTasks = useCallback<SessionObserver["applyTasks"]>(snapshot => observer?.applyTasks(snapshot), [observer]);
  return { ...state, disconnected: connection === null, loadOlder, applyTasks, refresh };
}
