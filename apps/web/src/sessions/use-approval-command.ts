import { useEffect, useState } from "react";
import { isRecord } from "@actspace/shared/host-protocol";
import type { ApprovalRequest } from "@actspace/shared/runtime-v2";
import { useHostConnection } from "../connection/use-connection";

/** A history page may omit the pending call. Recover it through the session-owned tool API. */
export function useApprovalCommand(request: ApprovalRequest, provided?: string) {
  const connection = useHostConnection();
  const key = JSON.stringify([request.sessionId, request.requestId, request.callId]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; command?: string; error?: string } | null>(null);
  const required = request.resources.some(resource => resource.kind === "process");
  const supplied = provided?.trim() ? provided : undefined;
  useEffect(() => {
    if (!required || supplied) return;
    let cancelled = false;
    setResult(null);
    if (!connection) return;
    void connection.client.call("sessions.tool", { sessionId: request.sessionId, callId: request.callId }).then(value => {
      if (cancelled) return;
      if (!isRecord(value) || !isRecord(value.snapshot) || value.snapshot.sessionId !== request.sessionId || !Array.isArray(value.journal)) throw new Error("命令详情不可用");
      const call = value.journal.find(event => isRecord(event) && event.type === "tool/call" && isRecord(event.data) && event.data.callId === request.callId);
      const args = isRecord(call) && isRecord(call.data) && call.data.name === request.toolName && isRecord(call.data.args) ? call.data.args : null;
      if (typeof args?.command !== "string" || !args.command.trim()) throw new Error("命令详情不可用");
      setResult({ key, command: args.command });
    }).catch(error => { if (!cancelled) setResult({ key, error: error instanceof Error ? error.message : "命令详情不可用" }); });
    return () => { cancelled = true; };
  }, [connection, key, request.sessionId, request.callId, request.toolName, required, supplied, attempt]);
  const current = result?.key === key ? result : null;
  return { command: supplied ?? current?.command, missing: required && !supplied && !current?.command,
    error: current?.error, retry: () => setAttempt(value => value + 1) };
}
