/** A fake main window plus an IPC event from its main frame, matching assertTrustedSender's identity checks. */
export function trustedWindow() {
  const mainFrame = {};
  const webContents = { id: 7, mainFrame, send: () => undefined };
  const window = { isDestroyed: () => false, webContents };
  return { window, event: { sender: webContents, senderFrame: mainFrame } };
}
