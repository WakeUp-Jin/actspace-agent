import type { BrowserWindow } from "electron";

type SenderEvent = { readonly sender: unknown; readonly senderFrame?: unknown };
type WindowLike = Pick<BrowserWindow, "isDestroyed"> & { readonly webContents: { readonly mainFrame: unknown } };

/** Fail closed: only the live main window's main frame may call privileged IPC. */
export function isTrustedSender(event: SenderEvent, window: WindowLike | null | undefined): boolean {
  return window !== null && window !== undefined && !window.isDestroyed()
    && event.sender === window.webContents
    && event.senderFrame !== undefined && event.senderFrame !== null
    && event.senderFrame === window.webContents.mainFrame;
}

export function assertTrustedSender(event: SenderEvent, getWindow: () => WindowLike | null | undefined, message = "Untrusted IPC sender"): void {
  if (!isTrustedSender(event, getWindow())) throw new Error(message);
}
