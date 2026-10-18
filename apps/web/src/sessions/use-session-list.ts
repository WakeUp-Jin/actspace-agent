import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isRecord } from "@actspace/shared/host-protocol";
import type { ApprovalRequest, RuntimeV2SessionListItem } from "@actspace/shared/runtime-v2";
import { useConnectionStore, useHostConnection } from "../connection/use-connection";

export type SessionListState = {
  /** null 表示还没拉到过；断线期间保留上一次的结果。 */
  readonly sessions: readonly RuntimeV2SessionListItem[] | null;
  /** 待审批请求，按 sessionId 分组。 */
  readonly approvals: ReadonlyMap<string, readonly ApprovalRequest[]>;
  /** 有运行中 Run 的会话（A3：host.observe 快照的 running + activity 事件）。 */
  readonly running: ReadonlySet<string>;
  readonly error: unknown;
  readonly refresh: () => Promise<void>;
};

const SessionListContext = createContext<SessionListState | null>(null);
export const SESSION_LIST_DEBOUNCE_MS = 300;

function groupApprovals(requests: readonly ApprovalRequest[]): Map<string, readonly ApprovalRequest[]> {
  const grouped = new Map<string, ApprovalRequest[]>();
  for (const request of requests) grouped.set(request.sessionId, [...(grouped.get(request.sessionId) ?? []), request]);
  return grouped;
}

/** Host 频道的订阅只在这里做一次；列表页、详情页顶栏、新建面板共用（front-web-pwa客户端规范 §9.1）。 */
export function SessionListProvider({ children }: { readonly children: ReactNode }) {
  const store = useConnectionStore();
  const connection = useHostConnection();
  const [sessions, setSessions] = useState<readonly RuntimeV2SessionListItem[] | null>(null);
  const [approvals, setApprovals] = useState<ReadonlyMap<string, readonly ApprovalRequest[]>>(new Map());
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<unknown>(null);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  const refresh = useCallback(async () => {
    const current = connectionRef.current;
    if (!current) return;
    try {
      const list = await current.client.call("sessions.list") as RuntimeV2SessionListItem[];
      if (connectionRef.current !== current) return;
      setSessions(list);
      setError(null);
    } catch (reason) {
      if (connectionRef.current !== current) return;
      store.reportError(reason);
      setError(reason);
    }
  }, [store]);

  useEffect(() => {
    if (!connection) return;
    setApprovals(groupApprovals(connection.hostSnapshot.approvals));
    setRunning(new Set(connection.hostSnapshot.running));
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = connection.events.on(connection.hostSubscriptionId, value => {
      if (!isRecord(value)) return;
      if (value.kind === "sessions-changed") {
        // 流式输出时每个片段都会触发，不能每次重置计时（否则一直不刷新）：窗口内只刷新一次。
        timer ??= setTimeout(() => { timer = undefined; void refresh(); }, SESSION_LIST_DEBOUNCE_MS);
      } else if (value.kind === "approvals" && typeof value.sessionId === "string" && Array.isArray(value.requests)) {
        const sessionId = value.sessionId, requests = value.requests as ApprovalRequest[];
        setApprovals(previous => {
          const next = new Map(previous);
          if (requests.length) next.set(sessionId, requests); else next.delete(sessionId);
          return next;
        });
      } else if (value.kind === "activity" && typeof value.sessionId === "string" && typeof value.running === "boolean") {
        const sessionId = value.sessionId, active = value.running;
        setRunning(previous => {
          if (previous.has(sessionId) === active) return previous;
          const next = new Set(previous);
          if (active) next.add(sessionId); else next.delete(sessionId);
          return next;
        });
      }
    });
    return () => { stop(); clearTimeout(timer); };
  }, [connection, refresh]);

  const value = useMemo<SessionListState>(() => ({ sessions, approvals, running, error, refresh }), [sessions, approvals, running, error, refresh]);
  return createElement(SessionListContext.Provider, { value }, children);
}

export function useSessionList(): SessionListState {
  const value = useContext(SessionListContext);
  if (!value) throw new Error("SessionListProvider is missing");
  return value;
}
