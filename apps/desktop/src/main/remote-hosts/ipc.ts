import { RemoteArtifacts } from "./artifacts";
import { RemoteSessionRouter } from "./session-router";
import { ipcMain, type BrowserWindow } from "electron";
import { HOST_IPC, HOST_METHODS, isRecord, type AddHostInput, type HostMethod } from "@actspace/shared/host-protocol";
import type { RemoteHostRegistry } from "./registry";
import { assertTrustedSender } from "../ipc/trusted-sender";
export function registerRemoteHostIpc(registry: RemoteHostRegistry, getWindow: () => BrowserWindow | null, activate: (sessionId: string | null) => Promise<void>): () => void {
  const channels: string[] = [];
  const handle = (channel: string, listener: (input: unknown) => unknown) => {
    ipcMain.handle(channel, (event, input) => {
      assertTrustedSender(event, getWindow, "Untrusted Host IPC sender");
      return listener(input);
    }); channels.push(channel);
  };
  handle(HOST_IPC.activate, input => { if (input !== null && typeof input !== "string") throw new Error("Invalid Session identity"); return activate(input === null ? null : String(input)); });
  handle(HOST_IPC.preview, input => {
    if (!isRecord(input) || typeof input.hostId !== "string" || typeof input.sessionId !== "string" || typeof input.artifactId !== "string") throw new Error("Invalid artifact reference");
    return new RemoteArtifacts(new RemoteSessionRouter(registry), () => getWindow() ?? undefined).safePreview({ hostId: input.hostId, sessionId: input.sessionId }, input.artifactId);
  });
  handle(HOST_IPC.download, input => {
    if (!isRecord(input) || typeof input.hostId !== "string" || typeof input.sessionId !== "string" || typeof input.artifactId !== "string") throw new Error("Invalid artifact reference");
    return new RemoteArtifacts(new RemoteSessionRouter(registry), () => getWindow() ?? undefined).save({ hostId: input.hostId, sessionId: input.sessionId }, input.artifactId);
  });
  handle(HOST_IPC.list, () => registry.list());
  handle(HOST_IPC.add, input => { if (!isRecord(input) || typeof input.name !== "string" || typeof input.code !== "string" || !isRecord(input.endpoint)) throw new Error("Invalid Host connection"); return registry.add(input as unknown as AddHostInput); });
  handle(HOST_IPC.remove, input => { if (typeof input !== "string") throw new Error("Invalid connection id"); return registry.remove(input); });
  handle(HOST_IPC.reconnect, input => { if (typeof input !== "string") throw new Error("Invalid connection id"); return registry.reconnect(input); });
  handle(HOST_IPC.call, input => {
    if (!isRecord(input) || typeof input.hostId !== "string" || typeof input.method !== "string" || !isRecord(input.params) || !(HOST_METHODS as readonly string[]).includes(input.method) || ["host.hello", "auth.pair", "auth.resume"].includes(input.method)) throw new Error("Invalid Host operation");
    return registry.call(input.hostId, input.method as HostMethod, input.params);
  });
  const send = (channel: string, payload: unknown) => { const window = getWindow(); if (window && !window.isDestroyed()) window.webContents.send(channel, payload); };
  const unsubscribe = registry.subscribe(() => send(HOST_IPC.changed, registry.list()));
  const events = registry.subscribeEvents((hostId, event) => send(HOST_IPC.event, { hostId, event }));
  return () => { unsubscribe(); events(); for (const channel of channels) ipcMain.removeHandler(channel); };
}
