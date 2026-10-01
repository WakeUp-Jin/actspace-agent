import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handlers: new Map<string, Function>(), metrics: vi.fn(() => [{ pid: 1, type: "Browser", cpu: { percentCPUUsage: 2 }, memory: { workingSetSize: 4096 } }]), enable: vi.fn(), disable: vi.fn(), reset: vi.fn() }));
vi.mock("electron", () => ({ app: { getAppMetrics: mocks.metrics }, ipcMain: { handle: (key: string, fn: Function) => mocks.handlers.set(key, fn), removeHandler: (key: string) => mocks.handlers.delete(key) } }));
vi.mock("node:perf_hooks", () => {
  const monitorEventLoopDelay = () => ({ enable: mocks.enable, disable: mocks.disable, reset: mocks.reset, max: 120_000_000 });
  return { monitorEventLoopDelay, default: { monitorEventLoopDelay } };
});
import { registerPerformanceIpc } from "../performance-ipc";
import { PERFORMANCE_CHANNELS } from "@actspace/shared";
it("rejects foreign frames, samples only while enabled, and cleans up on hide/dispose", () => {
  const contents = Object.assign(new EventEmitter(), { mainFrame: {} });
  const window = Object.assign(new EventEmitter(), { webContents: contents, isVisible: () => true, isMinimized: () => false });
  const dispose = registerPerformanceIpc(() => window as never);
  const active = mocks.handlers.get(PERFORMANCE_CHANNELS.active)!;
  const sample = mocks.handlers.get(PERFORMANCE_CHANNELS.sample)!;
  const event = { sender: contents, senderFrame: contents.mainFrame };
  expect(() => active({ ...event, senderFrame: {} }, true)).toThrow("Invalid");
  expect(() => sample(event)).toThrow("paused");
  active(event, true);
  expect(sample(event)).toMatchObject({ mainDelayMs: 20, processes: [{ pid: 1, workingSetKiB: 4096 }] });
  window.emit("hide");
  expect(mocks.disable).toHaveBeenCalled();
  expect(() => sample(event)).toThrow("paused");
  active(event, true); active(event, false);
  expect(() => sample(event)).toThrow("paused");
  dispose(); expect(mocks.handlers.size).toBe(0);
  expect(window.listenerCount("hide")).toBe(0);
});
