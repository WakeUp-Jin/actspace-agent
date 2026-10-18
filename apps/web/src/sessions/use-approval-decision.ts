import { useCallback, useEffect, useRef, useState } from "react";
import { useConnectionStore, useHostConnection } from "../connection/use-connection";

export type DecisionKind = "once" | "session" | "deny";
export type DecisionState = { readonly status: "idle" | "pending" | "done"; readonly picked: DecisionKind | null; readonly error: string | null };
const IDLE: DecisionState = { status: "idle", picked: null, error: null };

/**
 * approvals.decide 的三种状态：提交中、已决定、失败（失败回到 idle 并带原因）。
 * 提交中和已决定都不接受再次点击。
 */
export function useApprovalDecision(sessionId: string, requestId: string, onDecided?: (kind: DecisionKind) => void) {
  const connection = useHostConnection();
  const store = useConnectionStore();
  const [state, setState] = useState<DecisionState>(IDLE);
  const busy = useRef(false);
  useEffect(() => { busy.current = false; setState(IDLE); }, [requestId]);

  const decide = useCallback(async (kind: DecisionKind, suggestionId?: string) => {
    if (busy.current) return;
    if (!connection) { setState({ status: "idle", picked: null, error: "已断开，正在重连…" }); return; }
    busy.current = true;
    setState({ status: "pending", picked: kind, error: null });
    try {
      await connection.client.call("approvals.decide", { sessionId, requestId, kind, ...(suggestionId ? { suggestionId } : {}) });
      setState({ status: "done", picked: kind, error: null });
      onDecided?.(kind);
    } catch (error) {
      store.reportError(error);
      busy.current = false;
      setState({ status: "idle", picked: null, error: error instanceof Error ? error.message : "审批提交失败" });
    }
  }, [connection, store, sessionId, requestId, onDecided]);
  return { state, decide };
}
