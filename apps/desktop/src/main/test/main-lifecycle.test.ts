import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { attachWindowLifecycle, installProcessErrorLogging } from "../main-lifecycle";

function fakeWindow(id: number) {
  return Object.assign(new EventEmitter(), { webContents: { id } });
}

describe("main window lifecycle", () => {
  it("closes the window's terminals with the id captured before webContents is destroyed", async () => {
    const win = fakeWindow(42);
    const closeOwnedTerminals = vi.fn(async () => undefined);
    const onClosed = vi.fn();
    attachWindowLifecycle(win, { onClosed, closeOwnedTerminals, log: vi.fn() });
    (win as { webContents: { id: number } }).webContents = { id: -1 };
    win.emit("closed");
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(closeOwnedTerminals).toHaveBeenCalledWith(42);
  });

  it("logs instead of throwing when terminal cleanup fails", async () => {
    const win = fakeWindow(3);
    const log = vi.fn();
    attachWindowLifecycle(win, { onClosed: vi.fn(), closeOwnedTerminals: async () => { throw new Error("pty gone"); }, log });
    win.emit("closed");
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("window terminal cleanup failed", { ownerId: 3, error: "pty gone" }));
  });
});

describe("main process error logging", () => {
  it("logs unhandled rejections and uncaught exceptions until disposed", () => {
    const target = new EventEmitter();
    const log = vi.fn();
    const dispose = installProcessErrorLogging(log, target);

    target.emit("unhandledRejection", new Error("lost promise"));
    target.emit("uncaughtExceptionMonitor", new Error("boom"), "uncaughtException");

    expect(log).toHaveBeenCalledWith("main process unhandled rejection", expect.objectContaining({ error: "lost promise" }));
    expect(log).toHaveBeenCalledWith("main process uncaught exception", expect.objectContaining({ error: "boom", origin: "uncaughtException" }));

    dispose();
    target.emit("unhandledRejection", "ignored");
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("registers on the real process and cleans up", () => {
    const before = process.listenerCount("unhandledRejection");
    const log = vi.fn();
    const dispose = installProcessErrorLogging(log);
    expect(process.listenerCount("unhandledRejection")).toBe(before + 1);
    process.emit("unhandledRejection", "plain reason", Promise.resolve());
    expect(log).toHaveBeenCalledWith("main process unhandled rejection", { error: "plain reason" });
    dispose();
    expect(process.listenerCount("unhandledRejection")).toBe(before);
  });
});
