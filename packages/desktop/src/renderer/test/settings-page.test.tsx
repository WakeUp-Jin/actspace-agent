import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppSettings } from "@actspace/shared";
import { SettingsPage } from "../components/settings/SettingsPage";

function makeSettings(over: Partial<AppSettings> = {}): AppSettings {
  return {
    version: 1,
    defaultModelId: null,
    providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: true } },
    agent: { temperature: null, maxTokens: null, disabledTools: [], bashAlwaysAsk: false },
    kairos: { modelId: null, thinking: "auto" },
    ...over,
  };
}

type ActspaceBridge = NonNullable<typeof window.actspace>;

describe("SettingsPage", () => {
  const getSettings = vi.fn(async () => makeSettings());
  const updateSettings = vi.fn(async (input) => makeSettings(input as Partial<AppSettings>));
  const setProviderKey = vi.fn(async () => ({ ok: true }));
  const clearProviderKey = vi.fn(async () => ({ ok: true }));
  const testProviderConnection = vi.fn(async () => ({ ok: true, message: "连接成功" }));

  beforeEach(() => {
    getSettings.mockClear();
    updateSettings.mockClear();
    setProviderKey.mockClear();
    clearProviderKey.mockClear();
    testProviderConnection.mockClear();
    window.actspace = {
      getSettings,
      updateSettings,
      setProviderKey,
      clearProviderKey,
      testProviderConnection,
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

  it("switching to 模型 shows connected state for kimi", async () => {
    render(<SettingsPage onBack={() => {}} />);
    await screen.findByRole("switch", { name: "自动审查" });

    await userEvent.click(screen.getByRole("button", { name: "模型" }));
    expect(await screen.findByRole("button", { name: "断开连接" })).toBeInTheDocument();
    expect(screen.getByLabelText("默认模型")).toBeInTheDocument();
  });
});
