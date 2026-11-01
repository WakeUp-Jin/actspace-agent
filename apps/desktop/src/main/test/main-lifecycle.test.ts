import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { attachWindowLifecycle, installProcessErrorLogging } from "../main-lifecycle";

function fakeWindow() {
  return new EventEmitter();
}

describe("main window lifecycle", () => {
  it("runs onClosed when the window closes", () => {
    const win = fakeWindow();
    const onClosed = vi.fn();
    attachWindowLifecycle(win, { onClosed });
    win.emit("closed");
    expect(onClosed).toHaveBeenCalledTimes(1);
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
