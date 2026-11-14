import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResourceSample, SettingsV4Snapshot } from "@actspace/shared";
import { SettingsPage } from "../components/settings/SettingsPage";
import {
  cpuChartMax,
  delayTone,
  formatCpuPercent,
  formatMemoryKiB,
  mainCpuTone,
  sparkPaths,
} from "../components/settings/resources/resource-format";
import { TooltipProvider } from "../components/ui/Tooltip";
import { setupBridge } from "./helpers/bridge";

function settingsSnapshot(performanceMonitoring: boolean): SettingsV4Snapshot {
  return {
    version: 4,
    revision: "revision-1",
    settings: {
      version: 4,
      general: {
        personalization: { displayName: "", responseStyle: "" },
        agentInstructions: { systemPromptPath: "/tmp/main-agent.md" },
        taskDefaults: { temperature: null, maxOutputTokens: null, chatCompactionTriggerRatio: 0.8 },
        shortcuts: {
          quickOpen: { enabled: true, accelerator: "CommandOrControl+Shift+Space", target: { kind: "automatic" } },
        },
        performanceMonitoring,
      },
      models: {
        connections: {},
        definitions: {},
        installed: {},
        taskBindings: { defaultChat: null, utility: null, subagentDefaultModel: null },
      },
      tools: { disabledTools: [], bash: { alwaysAsk: false }, searchProviders: {} },
      media: { imageGeneration: { baseUrl: "https://www.duckcoding.ai/v1", model: "gpt-image-2" } },
      skills: { disabled: [] },
      subagents: { routes: {} },
      activity: {
        usage: {
          range: "30d",
          activeTab: "requests",
          tokenView: "type",
          timeView: "phase",
          trendMetric: "tokens",
          heatMetric: "sessions",
        },
      },
    },
  } as SettingsV4Snapshot;
}

function sample(over: Partial<ResourceSample> = {}): ResourceSample {
  return {
    sampledAt: 1_000,
    cpuPercent: 42,
    rssKiB: 640 * 1024,
    mainCpuPercent: 95,
    mainThreadDelayMs: 250,
    agentProcessesAvailable: true,
    groups: [
      {
        id: "main",
        cpuPercent: 95,
        rssKiB: 200 * 1024,
        processes: [{ pid: 1, label: "主进程", count: 1, cpuPercent: 95, rssKiB: 200 * 1024 }],
      },
      {
        id: "renderer",
        cpuPercent: 3,
        rssKiB: 300 * 1024,
        processes: [{ pid: 2, label: "界面", count: 1, cpuPercent: 3, rssKiB: 300 * 1024 }],
      },
      {
        id: "gpu",
        cpuPercent: 1,
        rssKiB: 100 * 1024,
        processes: [{ pid: 3, label: "GPU", count: 1, cpuPercent: 1, rssKiB: 100 * 1024 }],
      },
      {
        id: "utility",
        cpuPercent: 0,
        rssKiB: 20 * 1024,
        processes: [{ pid: 4, label: "Network Service", count: 1, cpuPercent: 0, rssKiB: 20 * 1024 }],
      },
      {
        id: "agent",
        cpuPercent: 4,
        rssKiB: 20 * 1024,
        processes: [{ pid: 5, label: "node", count: 3, cpuPercent: 4, rssKiB: 20 * 1024 }],
      },
      {
        id: "monitor",
        cpuPercent: 0.3,
        rssKiB: 40 * 1024,
        processes: [{ pid: 6, label: "悬浮窗", count: 1, cpuPercent: 0.3, rssKiB: 40 * 1024 }],
      },
    ],
    ...over,
  };
}

function renderResources() {
  return render(
    <TooltipProvider delayDuration={0}>
      <SettingsPage onBack={() => {}} initialSection="resources" />
    </TooltipProvider>,
  );
}

describe("resource format", () => {
  it("formats values and only colors the main process CPU and main thread delay", () => {
    expect(formatCpuPercent(null)).toBe("—");
    expect(formatCpuPercent(3.14)).toBe("3.1%");
    expect(formatCpuPercent(123.4)).toBe("123%");
    expect(formatMemoryKiB(640 * 1024)).toBe("640 MB");
    expect(formatMemoryKiB(1.5 * 1024 * 1024)).toBe("1.50 GB");
    expect(mainCpuTone(89)).toBeNull();
    expect(mainCpuTone(90)).toBe("warning");
    expect(delayTone(199)).toBeNull();
    expect(delayTone(200)).toBe("warning");
    expect(delayTone(1000)).toBe("danger");
    expect(cpuChartMax([10, 20])).toBe(100);
    expect(cpuChartMax([10, 250])).toBe(300);
  });

  it("draws sparklines right-aligned on a fixed axis", () => {
    expect(sparkPaths([], 100, 150, 300, 40)).toEqual({ line: "", area: "" });
    const { line } = sparkPaths([0, 100], 100, 3, 300, 40);
    expect(line).toBe("M150.0,39.0L300.0,3.0");
  });
});

describe("ResourceUsageSection", () => {
  it("watches while open, renders pushed samples, and unwatches on unmount", async () => {
    const watch = vi.fn(async (active?: boolean) => ({
      history: active ? [{ at: 0, cpuPercent: 10, rssKiB: 1024, mainThreadDelayMs: 5 }] : [],
      latest: null,
    }));
    const handle = setupBridge({
      "settings.getV4": vi.fn(async () => settingsSnapshot(false)),
      "resourceMonitor.watch": watch,
    });
    const view = renderResources();
    await screen.findByRole("heading", { name: "资源占用", level: 2 });
    await waitFor(() => expect(watch).toHaveBeenCalledWith(true));
    expect(screen.getByText("正在读取…")).toBeTruthy();

    act(() =>
      handle.emit("resourceSample", {
        sample: sample(),
        point: { at: 2_000, cpuPercent: 42, rssKiB: 640 * 1024, mainThreadDelayMs: 250 },
      }),
    );
    const table = await screen.findByRole("table", { name: "进程占用" });
    expect(within(table).getByText("主进程").closest("tr")!.querySelector(".text-on-warning")?.textContent).toBe("95%");
    expect(within(table).getByText("3 个")).toBeTruthy();
    expect(within(table).getByText("node ×3")).toBeTruthy();
    expect(screen.getAllByText("250 ms").some((node) => node.className.includes("text-on-warning"))).toBe(true);
    expect(within(table).getByText("合计").closest("tr")!.textContent).toContain("42%");

    view.unmount();
    expect(watch).toHaveBeenLastCalledWith(false);
  });

  it("writes the float switch into general.performanceMonitoring with the revision", async () => {
    const updateV4 = vi.fn(async () => ({
      ok: true as const,
      snapshot: { ...settingsSnapshot(true), revision: "revision-2" },
    }));
    setupBridge({ "settings.getV4": vi.fn(async () => settingsSnapshot(false)), "settings.updateV4": updateV4 });
    renderResources();
    const toggle = await screen.findByRole("switch", { name: "显示悬浮窗" });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(updateV4).toHaveBeenCalledWith({
        namespace: "general",
        patch: { performanceMonitoring: true },
        expectedRevision: "revision-1",
      }),
    );
  });

  it("copies the snapshot text from main", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const handle = setupBridge({
      "settings.getV4": vi.fn(async () => settingsSnapshot(false)),
      "resourceMonitor.copySnapshot": vi.fn(async () => "ActSpace 资源快照"),
    });
    renderResources();
    const button = await screen.findByRole("button", { name: "复制快照" });
    expect(button.hasAttribute("disabled")).toBe(true);
    act(() =>
      handle.emit("resourceSample", {
        sample: sample(),
        point: { at: 2_000, cpuPercent: 42, rssKiB: 1, mainThreadDelayMs: 1 },
      }),
    );
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    await userEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ActSpace 资源快照"));
  });

  it("shows a dash for agent processes when the platform has no ps", async () => {
    const handle = setupBridge({ "settings.getV4": vi.fn(async () => settingsSnapshot(false)) });
    renderResources();
    await screen.findByRole("heading", { name: "资源占用", level: 2 });
    act(() =>
      handle.emit("resourceSample", {
        sample: sample({ agentProcessesAvailable: false }),
        point: { at: 2_000, cpuPercent: 1, rssKiB: 1, mainThreadDelayMs: 1 },
      }),
    );
    const row = (await screen.findByText("Agent 子进程")).closest("tr")!;
    expect(row.textContent).not.toContain("个");
    expect(row.querySelectorAll("td")[1]!.textContent).toBe("—");
  });
});
