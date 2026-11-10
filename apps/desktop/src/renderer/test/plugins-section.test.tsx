import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PythonRuntimeStatus } from "@actspace/shared";
import { PluginsSection } from "../components/extensions/PluginsSection";
import { extensionBrowserStatus, extensionPlugins } from "./fixtures/extensionsFixture";
import { setupBridge } from "./helpers/bridge";

const learningState = { enabled: false, targetSessionId: null, revision: 0, promptStatus: "off", speechStatus: "idle", queuedSegments: 0, hasApiKey: false, notice: null, error: null };

function setup(plugins = extensionPlugins()) {
  const list = vi.fn(async () => plugins);
  const getStatus = vi.fn(async () => extensionBrowserStatus);
  const getLearning = vi.fn(async () => learningState);
  const updateV4 = vi.fn(async () => ({ ok: true, snapshot: { revision: "r2" } }));
  const getPython = vi.fn(async () => pythonStatus());
  const installPython = vi.fn(async () => pythonStatus({ state: "installing", progress: { completed: 0, total: 3 } }));
  setupBridge({
    "plugins.list": list,
    "pythonRuntime.getStatus": getPython,
    "pythonRuntime.installExtension": installPython,
    "browserBridge.getStatus": getStatus,
    "englishLearning.getState": getLearning,
    "settings.getV4": vi.fn(async () => ({ version: 4, revision: "r1", settings: {} })),
    "settings.updateV4": updateV4,
    "sessions.list": vi.fn(async () => []),
  });
  return { list, getStatus, getLearning, updateV4, getPython, installPython };
}

function pythonStatus(extension: Partial<PythonRuntimeStatus["extension"]> = {}): PythonRuntimeStatus {
  return {
    runtime: { version: "3.12.16", root: "/app/runtime/python", corePackages: ["openpyxl", "pypdf"] },
    extension: { packages: ["numpy", "pandas", "markitdown"], state: "missing", localWheelsDirectory: "/data/runtime/python-ext/wheels", ...extension },
  };
}

describe("PluginsSection", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("groups plugins into global and session, with the switchable ones on top and built-ins folded", async () => {
    setup();
    render(<PluginsSection />);
    const global = await screen.findByRole("region", { name: "全局插件" });
    const session = screen.getByRole("region", { name: "会话插件" });
    expect(within(global).getByRole("heading", { name: "全局插件" })).toBeVisible();
    expect(screen.getByText("插件 · 6")).toBeVisible();
    expect(within(global).getByRole("switch", { name: "英语学习" })).toHaveAttribute("aria-checked", "false");
    expect(within(session).getByRole("switch", { name: "操控浏览器" })).toHaveAttribute("aria-checked", "false");
    const globalFold = within(global).getByRole("button", { name: "内置插件 2 个，不能关闭" });
    expect(globalFold).toHaveAttribute("aria-expanded", "false");
    expect(within(global).queryByText("会话日志")).not.toBeInTheDocument();
    expect(within(session).getByRole("button", { name: "内置插件 2 个，不能关闭" })).toBeVisible();

    await userEvent.click(globalFold);
    expect(within(global).getByText("会话日志")).toBeVisible();
    expect(within(global).getByText("侧边对话")).toBeVisible();
    expect(within(global).getAllByText("内置")).toHaveLength(2);
    expect(within(global).getAllByRole("switch")).toHaveLength(1);
  });

  it("writes tools.plugins on toggle and shows the restart hint until the next launch", async () => {
    const { list, updateV4 } = setup();
    render(<PluginsSection />);
    const toggle = await screen.findByRole("switch", { name: "操控浏览器" });
    list.mockResolvedValue(extensionPlugins({ "browser-tools": { enabled: true } }));
    await userEvent.click(toggle);
    await waitFor(() => expect(updateV4).toHaveBeenCalledWith({ expectedRevision: "r1", namespace: "tools", patch: { plugins: { "browser-tools": true } } }));
    expect(await screen.findByText("重启后开启")).toBeVisible();
    expect(screen.getByRole("switch", { name: "操控浏览器" })).toHaveAttribute("aria-checked", "true");

    list.mockResolvedValue(extensionPlugins({ "browser-tools": { enabled: false, loaded: true } }));
    await userEvent.click(screen.getByRole("switch", { name: "操控浏览器" }));
    expect(await screen.findByText("重启后关闭")).toBeVisible();
  });

  it("keeps the old state and reports an error when saving fails", async () => {
    const { updateV4 } = setup();
    updateV4.mockRejectedValueOnce(new Error("write failed"));
    render(<PluginsSection />);
    await userEvent.click(await screen.findByRole("switch", { name: "英语学习" }));
    expect(await screen.findByText(/保存失败/)).toBeVisible();
    expect(screen.getByRole("switch", { name: "英语学习" })).toHaveAttribute("aria-checked", "false");
  });

  it("does not request browser or English-learning state while both are off", async () => {
    const { list, getStatus, getLearning } = setup();
    render(<PluginsSection />);
    await screen.findByRole("switch", { name: "操控浏览器" });
    expect(list).toHaveBeenCalled();
    expect(getStatus).not.toHaveBeenCalled();
    expect(getLearning).not.toHaveBeenCalled();
    expect(screen.queryByText("已连接，可以在对话中使用 Chrome")).not.toBeInTheDocument();
  });

  it("does not mount details when enabled but not loaded yet (restart pending)", async () => {
    const { getStatus, getLearning } = setup(extensionPlugins({ "browser-tools": { enabled: true, loaded: false }, "english-learning": { enabled: true, loaded: false } }));
    render(<PluginsSection />);
    expect(await screen.findAllByText("重启后开启")).toHaveLength(2);
    expect(getStatus).not.toHaveBeenCalled();
    expect(getLearning).not.toHaveBeenCalled();
  });

  it("expands the connection panel and learning settings when loaded and enabled", async () => {
    const { getStatus, getLearning } = setup(extensionPlugins({ "browser-tools": { enabled: true, loaded: true }, "english-learning": { enabled: true, loaded: true } }));
    render(<PluginsSection />);
    expect(await screen.findByText("已连接，可以在对话中使用 Chrome")).toBeVisible();
    expect(await screen.findByRole("region", { name: "英语辅助学习" })).toBeVisible();
    expect(getStatus).toHaveBeenCalled();
    expect(getLearning).toHaveBeenCalled();
    expect(screen.queryByText("重启后开启")).not.toBeInTheDocument();
  });

  it("searches names, descriptions, directories and ids, and opens the built-in fold while searching", async () => {
    setup();
    const { rerender } = render(<PluginsSection query="shell" />);
    const session = await screen.findByRole("region", { name: "会话插件" });
    expect(within(session).getByText("命令行")).toBeVisible();
    expect(within(session).queryByText("规则")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "全局插件" })).not.toBeInTheDocument();
    expect(screen.getByText("插件 · 1")).toBeVisible();

    rerender(<PluginsSection query="context" />);
    expect(within(await screen.findByRole("region", { name: "会话插件" })).getByText("规则")).toBeVisible();
    rerender(<PluginsSection query="Chrome 扩展" />);
    expect(within(await screen.findByRole("region", { name: "会话插件" })).getByRole("switch", { name: "操控浏览器" })).toBeVisible();
    rerender(<PluginsSection query="不存在" />);
    expect(await screen.findByText("没有找到匹配的插件。")).toBeVisible();
  });
  it("subagent plugins show why they are unavailable and write their settings", async () => {
    const plugins = [
      ...extensionPlugins(),
      { id: "subagent-codex", title: "Codex 子智能体", description: "用本机 Codex 跑子任务", scope: "session" as const, directory: "subagent", canDisable: true, loaded: true, enabled: true, settings: { approvalPolicy: "never", sandbox: "workspace-write" }, settingsPendingRestart: false },
      { id: "subagent-claude-code", title: "Claude Code", description: "用本机 Claude Code 跑子任务", scope: "session" as const, directory: "subagent", canDisable: true, loaded: false, enabled: false, unavailableReason: "本机没有找到 claude 命令", settings: { permissionMode: "dontAsk" } },
    ];
    const { updateV4 } = setup(plugins);
    render(<PluginsSection />);
    expect(await screen.findByText("不可用：本机没有找到 claude 命令")).toBeVisible();
    // 只有开启的插件才展开设置；没开的 Claude Code 不显示。
    expect(screen.queryByRole("region", { name: "Claude Code设置" })).not.toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Codex 子智能体设置" });
    expect(within(panel).getByText(/不经过 ActSpace 的审批与沙箱/)).toBeVisible();
    await userEvent.click(within(panel).getByRole("combobox", { name: "Codex 子智能体沙箱" }));
    await userEvent.click(await screen.findByRole("option", { name: /^read-only/ }));
    await waitFor(() => expect(updateV4).toHaveBeenCalledWith({ expectedRevision: "r1", namespace: "tools", patch: { externalSubagents: { codex: { sandbox: "read-only" } } } }));
  });
  it("mounts the script runtime panel under the 命令行 row only when the fold is open, and starts the extension download", async () => {
    const { getPython, installPython } = setup();
    render(<PluginsSection />);
    const session = await screen.findByRole("region", { name: "会话插件" });
    expect(getPython).not.toHaveBeenCalled();
    await userEvent.click(within(session).getByRole("button", { name: "内置插件 2 个，不能关闭" }));
    const panel = await screen.findByRole("region", { name: "脚本运行时" });
    expect(within(panel).getByText("脚本运行时 · Python 3.12.16")).toBeVisible();
    expect(within(panel).getByText(/核心包：openpyxl、pypdf/)).toBeVisible();
    await userEvent.click(within(panel).getByRole("button", { name: "下载数据扩展" }));
    expect(installPython).toHaveBeenCalledTimes(1);
    expect(await within(panel).findByText(/下载中 0\/3/)).toBeVisible();
    getPython.mockResolvedValue(pythonStatus({ state: "ready" }));
    expect(await within(panel).findByText("已安装", {}, { timeout: 3_000 })).toBeVisible();
    expect(within(panel).queryByRole("button", { name: "下载数据扩展" })).not.toBeInTheDocument();
  });

  it("shows the failure reason and offers a retry when the download failed", async () => {
    const { getPython } = setup();
    getPython.mockResolvedValue(pythonStatus({ state: "failed", error: "fetch failed" }));
    render(<PluginsSection />);
    const session = await screen.findByRole("region", { name: "会话插件" });
    await userEvent.click(within(session).getByRole("button", { name: "内置插件 2 个，不能关闭" }));
    const panel = await screen.findByRole("region", { name: "脚本运行时" });
    expect(within(panel).getByRole("alert")).toHaveTextContent("下载失败：fetch failed");
    expect(within(panel).getByRole("button", { name: "重新下载" })).toBeVisible();
  });
});
