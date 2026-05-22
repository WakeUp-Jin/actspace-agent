import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentTurnResult,
  BootstrapState,
  RunTurnInput,
  SessionGetInput,
  SessionListItem,
  SessionRecord
} from "@actspace/shared";

contextBridge.exposeInMainWorld("actspace", {
  getBootstrapState: () => ipcRenderer.invoke("app:get-bootstrap-state") as Promise<BootstrapState>,
  runTurn: (input: RunTurnInput) => ipcRenderer.invoke("agent:run-turn", input) as Promise<AgentTurnResult>,
  listSessions: () => ipcRenderer.invoke("session:list") as Promise<SessionListItem[]>,
  getSession: (input: SessionGetInput) => ipcRenderer.invoke("session:get", input) as Promise<SessionRecord | null>
});
