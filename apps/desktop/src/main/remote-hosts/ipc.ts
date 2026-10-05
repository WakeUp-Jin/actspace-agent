import { RemoteArtifacts } from "./artifacts";
import { RemoteSessionRouter } from "./session-router";
import type { BrowserWindow } from "electron";
import { HOST_IPC } from "@actspace/shared/host-protocol";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import type { RemoteHostRegistry } from "./registry";
import { createIpcRegistrar } from "../ipc/registry";
/** 入参形状（含 `hosts.call` 的方法白名单）由 `ipc/guards.ts` 校验，这里只做转发。 */
export function registerRemoteHostIpc(registry: RemoteHostRegistry, getWindow: () => BrowserWindow | null, activate: (sessionId: string | null) => Promise<void>): () => void {
  const ipc = createIpcRegistrar({ getWindow, untrustedMessage: "Untrusted Host IPC sender" });
  const artifacts = () => new RemoteArtifacts(new RemoteSessionRouter(registry), () => getWindow() ?? undefined);
  ipc.handle(contract.hosts.activate, sessionId => activate(sessionId));
  ipc.handle(contract.hosts.preview, ({ hostId, sessionId, artifactId }) => artifacts().safePreview({ hostId, sessionId }, artifactId));
  ipc.handle(contract.hosts.download, ({ hostId, sessionId, artifactId }) => artifacts().save({ hostId, sessionId }, artifactId));
  ipc.handle(contract.hosts.list, () => registry.list());
  ipc.handle(contract.hosts.add, input => registry.add(input));
  ipc.handle(contract.hosts.remove, id => registry.remove(id));
  ipc.handle(contract.hosts.reconnect, id => registry.reconnect(id));
  ipc.handle(contract.hosts.call, ({ hostId, method, params }) => registry.call(hostId, method, params));
  const send = (channel: string, payload: unknown) => { const window = getWindow(); if (window && !window.isDestroyed()) window.webContents.send(channel, payload); };
  const unsubscribe = registry.subscribe(() => send(HOST_IPC.changed, registry.list()));
  const events = registry.subscribeEvents((hostId, event) => send(HOST_IPC.event, { hostId, event }));
  return () => { unsubscribe(); events(); ipc.dispose(); };
}
