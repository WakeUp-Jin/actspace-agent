import { contextBridge, ipcRenderer } from "electron";
import type {
  AbortTurnInput,
  AgentTurnResult,
  ApprovalDecideInput,
  ApprovalDecideResult,
  ApprovalListPendingInput,
  BootstrapState,
  KairosBridgeApi,
  KairosContextSnapshot,
  KairosControl,
  KairosControlResponse,
  KairosGetEventsRecentRequest,
  KairosGetEventsRecentResponse,
  KairosReadConfigRequest,
  KairosReadConfigResponse,
  KairosRuntimeState,
  KairosWriteConfigRequest,
  KairosWriteConfigResponse,
  PendingApprovalInfo,
  RunTurnInput,
  RuntimeStreamEvent,
  SessionCreateInput,
  SessionEvent,
  SessionGetInput,
  SessionListItem,
  SessionPinInput,
  SessionPinResult,
  SessionRecord,
  UsageStatisticsGetInput,
  UsageStatisticsSnapshot
} from "@actspace/shared";

contextBridge.exposeInMainWorld("actspace", {
  getBootstrapState: () => ipcRenderer.invoke("app:get-bootstrap-state") as Promise<BootstrapState>,
  runTurn: (input: RunTurnInput) => ipcRenderer.invoke("agent:run-turn", input) as Promise<AgentTurnResult>,
  abortTurn: (input: AbortTurnInput) => ipcRenderer.invoke("agent:abort-turn", input) as Promise<boolean>,
  listSessions: () => ipcRenderer.invoke("session:list") as Promise<SessionListItem[]>,
  getSession: (input: SessionGetInput) => ipcRenderer.invoke("session:get", input) as Promise<SessionRecord | null>,
  getUsageStatistics: (input: UsageStatisticsGetInput) =>
    ipcRenderer.invoke("usage-statistics:get", input) as Promise<UsageStatisticsSnapshot | null>,
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

// ─── Kairos 桥接 ─────────────────────────────────────────────────────
// `window.kairos` API surface 与 `KairosBridgeApi` 接口逐字段对齐。

const kairosBridge: KairosBridgeApi = {
  getState: () => ipcRenderer.invoke("kairos:get-state") as Promise<KairosRuntimeState>,
  getEventsRecent: (req?: KairosGetEventsRecentRequest) =>
    ipcRenderer.invoke("kairos:get-events-recent", req ?? {}) as Promise<KairosGetEventsRecentResponse>,
  control: (ctrl: KairosControl) =>
    ipcRenderer.invoke("kairos:control", ctrl) as Promise<KairosControlResponse>,
  readConfig: (req: KairosReadConfigRequest) =>
    ipcRenderer.invoke("kairos:read-config", req) as Promise<KairosReadConfigResponse>,
  writeConfig: (req: KairosWriteConfigRequest) =>
    ipcRenderer.invoke("kairos:write-config", req) as Promise<KairosWriteConfigResponse>,
  getContextSnapshot: () =>
    ipcRenderer.invoke("kairos:get-context-snapshot") as Promise<KairosContextSnapshot>,
  onEvent: (listener: (event: SessionEvent) => void) => {
    const handler = (_: unknown, event: SessionEvent) => listener(event);
    ipcRenderer.on("kairos:event", handler);
    return () => {
      ipcRenderer.removeListener("kairos:event", handler);
    };
  },
  onState: (listener: (state: KairosRuntimeState) => void) => {
    const handler = (_: unknown, state: KairosRuntimeState) => listener(state);
    ipcRenderer.on("kairos:state", handler);
    return () => {
      ipcRenderer.removeListener("kairos:state", handler);
    };
  },
};

contextBridge.exposeInMainWorld("kairos", kairosBridge);
