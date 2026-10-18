import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppSettings } from "@actspace/shared";
import { SearchSettings } from "../components/settings/SearchSettings";
import { SettingsSaveNoticeProvider } from "../components/settings/SettingsPrimitives";

function makeSettings(connected: Array<"zhipu" | "tavily" | "tinyfish" | "exa"> = ["zhipu"], disabledTools: string[] = []): AppSettings {
  return {
    version: 1,
    defaultModelId: null,
    providers: { deepseek: { hasApiKey: false }, kimi: { hasApiKey: false } },
    searchProviders: {
      zhipu: { hasApiKey: connected.includes("zhipu") },
      tavily: { hasApiKey: connected.includes("tavily") },
      tinyfish: { hasApiKey: connected.includes("tinyfish") },
      exa: { hasApiKey: connected.includes("exa") },
    },
    agent: { systemPromptPath: "/tmp/main-agent.md", temperature: null, maxTokens: null, disabledTools, bashAlwaysAsk: false, exploreModelId: null },
    skills: { disabled: [] },
  } as AppSettings;
}

function renderSearch(overrides: Partial<Parameters<typeof SearchSettings>[0]> = {}) {
  const props = {
    settings: makeSettings(),
    settingsV4: null,
    onUpdate: vi.fn(),
    onUpdateNamespace: vi.fn(async () => null),
    onSaveProviderKey: vi.fn(async () => ({ ok: true as const })),
    onClearProvider: vi.fn(async () => {}),
    ...overrides,
  };
  render(<SettingsSaveNoticeProvider><SearchSettings {...props} /></SettingsSaveNoticeProvider>);
  return props;
}


describe("SearchSettings", () => {
  it("lists the five channels without logos and counts connected ones", () => {
    renderSearch();
    expect(screen.getByRole("heading", { name: "搜索通道", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("1 / 5 已连接")).toBeInTheDocument();
    expect(screen.getByText("智谱 Web Search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "管理 智谱 Web Search" })).toBeInTheDocument();
    for (const name of ["DeepSeek", "Tavily", "TinyFish", "Exa"]) {
      expect(screen.getByRole("button", { name: `连接 ${name}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("connects Tavily from an inline key editor", async () => {
    const props = renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "连接 Tavily" }));
    await userEvent.type(screen.getByLabelText("Tavily API Key"), "tvly-test");
    await userEvent.click(screen.getByRole("button", { name: "保存 Tavily Key" }));
    await waitFor(() => expect(props.onSaveProviderKey).toHaveBeenCalledWith("tavily", "tvly-test"));
    await waitFor(() => expect(screen.queryByLabelText("Tavily API Key")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("已连接");
  });

  it("keeps the typed key and shows the error when saving fails", async () => {
    renderSearch({ onSaveProviderKey: vi.fn(async () => ({ ok: false as const, error: "Key 无效" })) });
    await userEvent.click(screen.getByRole("button", { name: "连接 Exa" }));
    await userEvent.type(screen.getByLabelText("Exa API Key"), "exa-bad");
    await userEvent.click(screen.getByRole("button", { name: "保存 Exa Key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Key 无效");
    expect(screen.getByLabelText("Exa API Key")).toHaveValue("exa-bad");
  });

  it("disconnects from the manage menu", async () => {
    const props = renderSearch();
    await userEvent.click(screen.getByRole("button", { name: "管理 智谱 Web Search" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "断开连接" }));
    await waitFor(() => expect(props.onClearProvider).toHaveBeenCalledWith("zhipu"));
  });

  it("turning off web search writes web_search into disabledTools and keeps channels usable", async () => {
    const props = renderSearch();
    await userEvent.click(screen.getByRole("switch", { name: "允许联网搜索" }));
    expect(props.onUpdate).toHaveBeenCalledWith({ agent: { disabledTools: ["web_search"] } });
    expect(screen.getByRole("button", { name: "连接 Tavily" })).toBeEnabled();
  });
});


describe("DeepSeek settings opt-in", () => {
  function snapshot() {
    return { revision: "test", settings: { tools: { disabledTools: [], bash: { alwaysAsk: false }, searchProviders: { zhipu: { enabled: true }, deepseek: { enabled: false } }, deepseekFetchEnabled: false } } } as unknown as import("@actspace/shared").SettingsV4Snapshot;
  }
  it("reuses a model key but keeps both paid capabilities off and writes independent patches", async () => {
    const settings = makeSettings(); settings.providers.deepseek.hasApiKey = true;
    const props = renderSearch({ settings, settingsV4: snapshot(), onUpdateNamespace: vi.fn(async () => snapshot()) });
    expect(screen.getByRole("switch", { name: "启用 DeepSeek 搜索" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "使用 DeepSeek 抓取网页" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "启用 智谱 Web Search 搜索" })).toBeChecked();
    await userEvent.click(screen.getByRole("switch", { name: "启用 DeepSeek 搜索" }));
    await waitFor(() => expect(props.onUpdateNamespace).toHaveBeenCalledWith({ namespace: "tools", patch: { searchProviders: { deepseek: { enabled: true } } } }));
    await userEvent.click(screen.getByRole("switch", { name: "使用 DeepSeek 抓取网页" }));
    expect(props.onUpdateNamespace).toHaveBeenLastCalledWith({ namespace: "tools", patch: { deepseekFetchEnabled: true } });
    expect(screen.getByRole("switch", { name: "启用 智谱 Web Search 搜索" })).toBeChecked();
  });
  it("disables paid fetch without a key and reports failed writes", async () => {
    renderSearch({ settingsV4: snapshot(), onUpdateNamespace: vi.fn(async () => null) });
    expect(screen.getByRole("switch", { name: "使用 DeepSeek 抓取网页" })).toBeDisabled();
    await userEvent.click(screen.getByRole("switch", { name: "启用 智谱 Web Search 搜索" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
    expect(screen.getByRole("switch", { name: "启用 智谱 Web Search 搜索" })).toBeChecked();
  });
});
