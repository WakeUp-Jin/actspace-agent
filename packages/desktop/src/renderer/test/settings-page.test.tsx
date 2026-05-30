import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppSettings } from "@actspace/shared";
import { SettingsPage } from "../components/settings/SettingsPage";

function makeSettings(over: Partial<AppSettings> = {}): AppSettings {
  const base: AppSettings = {
    version: 1,
    defaultModelId: null,
    providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: true } },
    agent: {
      systemPrompt: "Default main agent prompt",
      temperature: null,
      maxTokens: null,
      disabledTools: [],
      bashAlwaysAsk: false,
    },
    kairos: { modelId: null, thinking: "auto" },
  };
  return {
    ...base,
    ...over,
    providers: over.providers ? { ...base.providers, ...over.providers } : base.providers,
    agent: over.agent ? { ...base.agent, ...over.agent } : base.agent,
    kairos: over.kairos ? { ...base.kairos, ...over.kairos } : base.kairos,
  };
}

type ActspaceBridge = NonNullable<typeof window.actspace>;

describe("SettingsPage", () => {
  const getSettings = vi.fn(async () => makeSettings());
  const updateSettings = vi.fn(async (input) => makeSettings(input as Partial<AppSettings>));
  const setProviderKey = vi.fn(async () => ({ ok: true }));
  const clearProviderKey = vi.fn(async () => ({ ok: true }));
  const testProviderConnection = vi.fn(async () => ({ ok: true, message: "连接成功" }));
  const setUiZoom = vi.fn();
  const setNativeTheme = vi.fn();

  beforeEach(() => {
    getSettings.mockClear();
    updateSettings.mockClear();
    setProviderKey.mockClear();
    clearProviderKey.mockClear();
    testProviderConnection.mockClear();
    setUiZoom.mockClear();
    setNativeTheme.mockClear();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    window.actspace = {
      getSettings,
      updateSettings,
      setProviderKey,
      clearProviderKey,
      testProviderConnection,
      setUiZoom,
      setNativeTheme,
    } as unknown as ActspaceBridge;
  });

  afterEach(() => {
    delete (window as { actspace?: ActspaceBridge }).actspace;
  });

  it("loads settings and renders the general section by default", async () => {
    render(<SettingsPage onBack={() => {}} />);
    expect(await screen.findByRole("switch", { name: "自动审查" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "通用" })).toBeInTheDocument();
    expect(screen.getByLabelText("界面语言")).toBeDisabled();
  });

  it("toggling 自动审查 calls updateSettings with bashAlwaysAsk", async () => {
    render(<SettingsPage onBack={() => {}} />);
    const toggle = await screen.findByRole("switch", { name: "自动审查" });
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ agent: { bashAlwaysAsk: true } });
    });
  });

  it("connecting a provider opens the key modal and saves the key", async () => {
    render(<SettingsPage onBack={() => {}} />);
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "模型" }));
    await userEvent.click(await screen.findByRole("button", { name: "连接" }));

    const input = await screen.findByLabelText("DeepSeek API Key");
    await userEvent.type(input, "sk-test-123");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(setProviderKey).toHaveBeenCalledWith({ provider: "deepseek", apiKey: "sk-test-123" });
    });
  });

  it("disabling a tool writes it into disabledTools", async () => {
    render(<SettingsPage onBack={() => {}} />);
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "工具" }));
    const readToggle = await screen.findByRole("switch", { name: "读取文件" });
    expect(readToggle).toHaveAttribute("aria-checked", "true");

    await userEvent.click(readToggle);
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ agent: { disabledTools: ["read_file"] } });
    });
  });

  it("editing 主 Agent 系统提示词 saves it through settings", async () => {
    render(<SettingsPage onBack={() => {}} />);
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "智能体" }));
    const promptInput = await screen.findByLabelText("主 Agent 自定义系统提示词");
    expect(promptInput).toHaveValue("Default main agent prompt");

    await userEvent.clear(promptInput);
    await userEvent.type(promptInput, "Use short Chinese answers.");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        agent: { systemPrompt: "Use short Chinese answers." },
      });
    });
  });

  it("switching to 模型 shows connected state for kimi", async () => {
    render(<SettingsPage onBack={() => {}} />);
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "模型" }));
    expect(await screen.findByRole("button", { name: "断开连接" })).toBeInTheDocument();
    expect(screen.getByLabelText("默认模型")).toBeInTheDocument();
  });

  it("外观分区可改字体与字号并持久化", async () => {
    render(<SettingsPage onBack={() => {}} />);
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "外观" }));

    await userEvent.click(await screen.findByLabelText("界面字体"));
    await userEvent.click(await screen.findByRole("option", { name: "阅读衬线" }));
    expect(document.documentElement.style.getPropertyValue("--act-font-ui")).toContain("Georgia");
    expect(localStorage.getItem("actspace.appearance.v1")).toContain("serif-reading");

    await userEvent.click(screen.getByRole("button", { name: "代码字号增大" }));
    expect(document.documentElement.style.getPropertyValue("--act-font-mono-size")).toBe("14px");

    await userEvent.click(screen.getByRole("button", { name: "界面字号增大" }));
    expect(localStorage.getItem("actspace.appearance.v1")).toContain('"uiFontSize":15');
    expect(setUiZoom).toHaveBeenCalledWith(15 / 14);
  });

  it("外观分区切换主题写 data-theme、同步原生主题并持久化", async () => {
    render(<SettingsPage onBack={() => {}} />);
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "外观" }));

    await userEvent.click(await screen.findByRole("radio", { name: "深色" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(setNativeTheme).toHaveBeenCalledWith("dark");
    expect(localStorage.getItem("actspace.appearance.v1")).toContain('"theme":"dark"');

    await userEvent.click(screen.getByRole("radio", { name: "跟随系统" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("system");
    expect(setNativeTheme).toHaveBeenCalledWith("system");
  });
});
