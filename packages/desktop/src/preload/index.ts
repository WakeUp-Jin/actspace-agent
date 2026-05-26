import { contextBridge, ipcRenderer } from "electron";
import type {
  AbortTurnInput,
  AgentTurnResult,
  ApprovalDecideInput,
  ApprovalDecideResult,
  ApprovalListPendingInput,
  BootstrapState,
  PendingApprovalInfo,
  RunTurnInput,
  RuntimeStreamEvent,
  SessionCreateInput,
  SessionGetInput,
  SessionListItem,
  SessionPinInput,
  SessionPinResult,
  SessionRecord
} from "@actspace/shared";

contextBridge.exposeInMainWorld("actspace", {
  getBootstrapState: () => ipcRenderer.invoke("app:get-bootstrap-state") as Promise<BootstrapState>,
  runTurn: (input: RunTurnInput) => ipcRenderer.invoke("agent:run-turn", input) as Promise<AgentTurnResult>,
  abortTurn: (input: AbortTurnInput) => ipcRenderer.invoke("agent:abort-turn", input) as Promise<boolean>,
  listSessions: () => ipcRenderer.invoke("session:list") as Promise<SessionListItem[]>,
  getSession: (input: SessionGetInput) => ipcRenderer.invoke("session:get", input) as Promise<SessionRecord | null>,
  createSession: (input?: SessionCreateInput) => ipcRenderer.invoke("session:create", input ?? {}) as Promise<SessionRecord>,
  pinSession: (input: SessionPinInput) => ipcRenderer.invoke("session:pin", input) as Promise<SessionPinResult>,

  submitApproval: (input: ApprovalDecideInput) => ipcRenderer.invoke("approval:decide", input) as Promise<ApprovalDecideResult>,
  listPendingApprovals: (input?: ApprovalListPendingInput) => ipcRenderer.invoke("approval:list-pending", input ?? {}) as Promise<PendingApprovalInfo[]>,

  onAgentStream: (callback: (event: RuntimeStreamEvent) => void) => {
    const handler = (_: unknown, event: RuntimeStreamEvent) => callback(event);
    ipcRenderer.on("agent:stream", handler);
    return () => {
      ipcRenderer.removeListener("agent:stream", handler);
    };
  },
});
