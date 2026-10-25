import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { presentQuickOpenWindow } from "../quick-open-window";

function fakeWindow(options: { minimized?: boolean; maximized?: boolean; fullScreen?: boolean; height?: number } = {}) {
  return Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isMinimized: () => options.minimized ?? false,
    isMaximized: () => options.maximized ?? false,
    isFullScreen: () => options.fullScreen ?? false,
    restore: vi.fn(), unmaximize: vi.fn(), setFullScreen: vi.fn(),
    getBounds: () => ({ x: 100, y: 100, width: 1440, height: options.height ?? 900 }),
    setBounds: vi.fn(), show: vi.fn(), focus: vi.fn(),
  });
}

describe("quick-open main window presentation", () => {
  it("centers the same compact window on the cursor display, including negative display coordinates", async () => {
    const window = fakeWindow();
    await presentQuickOpenWindow(window, { x: -1920, y: 24, width: 1920, height: 1056 });
    expect(window.setBounds).toHaveBeenCalledWith({ x: -1280, y: 102, width: 640, height: 900 });
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it("restores and unmaximizes before resizing, keeping the window within a smaller work area", async () => {
    const window = fakeWindow({ minimized: true, maximized: true });
    await presentQuickOpenWindow(window, { x: 0, y: 24, width: 600, height: 800 });
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.unmaximize).toHaveBeenCalledOnce();
    expect(window.setBounds).toHaveBeenCalledWith({ x: 0, y: 24, width: 600, height: 800 });
    expect(window.unmaximize.mock.invocationCallOrder[0]).toBeLessThan(window.setBounds.mock.invocationCallOrder[0]);
  });

  it("waits for native fullscreen exit before applying bounds and focusing", async () => {
    const window = fakeWindow({ fullScreen: true });
    const presentation = presentQuickOpenWindow(window, { x: 0, y: 24, width: 1440, height: 841 });
    expect(window.setFullScreen).toHaveBeenCalledWith(false);
    expect(window.setBounds).not.toHaveBeenCalled();
    expect(window.focus).not.toHaveBeenCalled();
    window.emit("leave-full-screen");
    await presentation;
    expect(window.setBounds).toHaveBeenCalledWith({ x: 400, y: 24, width: 640, height: 841 });
    expect(window.focus).toHaveBeenCalledOnce();
  });
});
