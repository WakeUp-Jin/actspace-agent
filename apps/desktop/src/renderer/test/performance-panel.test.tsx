import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformancePanel } from "../components/PerformancePanel";

afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("performance monitor lifecycle", () => {
  it("does not sample while disabled and stops when the preference changes", async () => {
    vi.useFakeTimers();
    let enabled = false;
    let changed = () => {};
    const active = vi.fn().mockResolvedValue(undefined);
    const sample = vi.fn().mockResolvedValue({ sampledAt: Date.now(), mainDelayMs: 0, processes: [{ pid: 1, type: "Browser", cpuPercent: 1, workingSetKiB: 1024 }] });
    window.actspace = {
      getSettingsV4: vi.fn(async () => ({ settings: { general: { performanceMonitoring: enabled } } })),
      onSettingsChangedV4: vi.fn(callback => { changed = callback; return () => {}; }),
      setPerformanceActive: active, samplePerformance: sample,
    } as unknown as Window["actspace"];
    await act(async () => { render(<PerformancePanel />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(sample).not.toHaveBeenCalled(); expect(active).not.toHaveBeenCalled();
    enabled = true;
    await act(async () => { changed(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(sample).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("性能监控")).toHaveTextContent("内存 1 MB");
    enabled = false;
    await act(async () => { changed(); });
    expect(active).toHaveBeenLastCalledWith(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(sample).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("性能监控")).toBeNull();
  });
});
