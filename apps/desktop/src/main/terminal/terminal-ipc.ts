import { ipcMain, webContents } from "electron";
import type {
  TerminalAckInput,
  TerminalAttachInput,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalDetachInput,
  TerminalEvent,
  TerminalListInput,
  TerminalResizeInput,
  TerminalWriteInput,
} from "@actspace/shared";
import type { TerminalSessionService } from "./terminal-session-service";

const HANDLES = [
  "terminal:create", "terminal:list", "terminal:attach", "terminal:detach",
  "terminal:write", "terminal:resize", "terminal:ack", "terminal:close",
] as const;

export function sendTerminalEvent(ownerId: number, event: TerminalEvent): void {
  const owner = webContents.fromId(ownerId);
  if (owner && !owner.isDestroyed()) owner.send("terminal:event", event);
}

export function registerTerminalIpc(service: TerminalSessionService): () => void {
  ipcMain.handle("terminal:create", (event, input: TerminalCreateInput) =>
    service.create(input.sessionId, event.sender.id, input.cols, input.rows));
  ipcMain.handle("terminal:list", (event, input: TerminalListInput) => ({
    terminals: service.list(input.sessionId, event.sender.id),
  }));
  ipcMain.handle("terminal:attach", (event, input: TerminalAttachInput) =>
    service.attach(input.terminalId, event.sender.id, input.cols, input.rows));
  ipcMain.handle("terminal:detach", (event, input: TerminalDetachInput) =>
    service.detach(input.terminalId, event.sender.id));
  ipcMain.handle("terminal:write", (event, input: TerminalWriteInput) =>
    service.write(input.terminalId, event.sender.id, input.data));
  ipcMain.handle("terminal:resize", (event, input: TerminalResizeInput) =>
    service.resize(input.terminalId, event.sender.id, input.cols, input.rows));
  ipcMain.handle("terminal:ack", (event, input: TerminalAckInput) =>
    service.ack(input.terminalId, event.sender.id, input.bytes));
  ipcMain.handle("terminal:close", (event, input: TerminalCloseInput) =>
    service.close(input.terminalId, event.sender.id));

  return () => {
    for (const channel of HANDLES) ipcMain.removeHandler(channel);
  };
}
