import type { BrowserWindow, Rectangle } from "electron";

type QuickOpenWindow = Pick<BrowserWindow,
  "isDestroyed" | "isMinimized" | "restore" | "isMaximized" | "unmaximize" |
  "isFullScreen" | "setFullScreen" | "once" | "removeListener" | "getBounds" | "setBounds" | "show" | "focus">;

/** Main owns presentation; the renderer receives its existing routing intent afterwards. */
export async function presentQuickOpenWindow(window: QuickOpenWindow, workArea: Rectangle): Promise<boolean> {
  if (window.isDestroyed()) return false;
  // Native macOS fullscreen exits asynchronously; bounds applied earlier would be discarded.
  if (window.isFullScreen()) {
    await new Promise<void>((resolve) => {
      const finish = () => {
        window.removeListener("leave-full-screen", finish);
        window.removeListener("closed", finish);
        resolve();
      };
      window.once("leave-full-screen", finish);
      window.once("closed", finish);
      window.setFullScreen(false);
    });
  }
  if (window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  if (window.isMaximized()) window.unmaximize();
  const width = Math.min(640, workArea.width);
  const height = Math.min(window.getBounds().height, workArea.height);
  window.setBounds({
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  });
  window.show();
  window.focus();
  return true;
}
