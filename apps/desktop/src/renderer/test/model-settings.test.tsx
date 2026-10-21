import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DesktopBridge } from "@actspace/shared/desktop-bridge";
import { SettingsPage } from "../components/settings/SettingsPage";
import { TooltipProvider } from "../components/ui/Tooltip";
import { createModelConnectionsMock } from "../mock/model-connections-fixture";
import { setupBridge, type BridgeOverrides } from "./helpers/bridge";

/**
 * 设置 › 模型：用 mock 的有状态实现（种子：DeepSeek 内置、Claude 中转 ×0.6、未填 Key 的 OpenRouter），
 * 每个方法包一层 vi.fn 方便断言调用参数。
 */
type Api = Required<DesktopBridge["modelConnections"]>;
let api: { [K in keyof Api]: ReturnType<typeof vi.fn<Api[K]>> };

const RELAY = "custom:relay-1";
const relayKey = (apiModel: string) => `custom:connection/${encodeURIComponent(RELAY)}/${encodeURIComponent(apiModel)}`;

beforeEach(() => {
  const mock = createModelConnectionsMock() as Api;
  api = Object.fromEntries(Object.entries(mock).map(([name, fn]) => [name, vi.fn(fn)])) as typeof api;
  setupBridge(Object.fromEntries(Object.entries(api).map(([name, fn]) => [`modelConnections.${name}`, fn])) as BridgeOverrides);
});

function renderModels() {
  render(
    <TooltipProvider delayDuration={0}>
      <SettingsPage onBack={() => {}} initialSection="model" />
    </TooltipProvider>,
  );
  return screen.findByRole("heading", { name: "模型连接", level: 3 });
}

async function openConnection(name: RegExp) {
  await renderModels();
  await userEvent.click(await screen.findByRole("button", { name }));
  return screen.findByRole("heading", { name: "连接", level: 3 });
}

describe("设置 › 模型", () => {
  it("列表页显示用途和连接，中转标出待补充的模型", async () => {
    await renderModels();
    expect(screen.getByRole("button", { name: "会话默认模型" })).toHaveTextContent("Claude Sonnet 4.5");
    expect(screen.getByRole("button", { name: "自动审批模型" })).toHaveTextContent("跟随会话默认");
    const relay = screen.getByRole("button", { name: /^Claude 中转/ });
    expect(relay).toHaveTextContent("3 / 4 个模型");
    expect(relay).toHaveTextContent("1 个待补充");
    expect(screen.getByRole("button", { name: /^OpenRouter/ })).toHaveTextContent("未测试");
  });

  it("用途选择器：选模型保留合法档位，再选档位写入思考", async () => {
    await renderModels();
    await userEvent.click(screen.getByRole("button", { name: "轻量任务模型" }));
    const list = await screen.findByRole("listbox", { name: "轻量任务可选模型" });
    await userEvent.click(within(list).getByRole("option", { name: /Claude Haiku 4\.5/ }));
    await waitFor(() => expect(api.updatePurposes).toHaveBeenLastCalledWith({ utility: { model: relayKey("claude-haiku-4-5"), thinking: null } }));

    await userEvent.click(screen.getByRole("radio", { name: /^开/ }));
    await waitFor(() => expect(api.updatePurposes).toHaveBeenLastCalledWith({ utility: { model: relayKey("claude-haiku-4-5"), thinking: "high" } }));
  });

  it("看图只列能看图的模型；选「跟随」清空绑定", async () => {
    await renderModels();
    await userEvent.click(screen.getByRole("button", { name: "子 Agent 探索模型" }));
    await userEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "跟随会话默认" }));
    await waitFor(() => expect(api.updatePurposes).toHaveBeenLastCalledWith({ explore: { model: null, thinking: null } }));

    await userEvent.click(screen.getByRole("button", { name: "看图模型" }));
    const list = await screen.findByRole("listbox", { name: "看图可选模型" });
    expect(within(list).queryByRole("option", { name: /DeepSeek/ })).not.toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /Claude Sonnet 4\.5/ })).toBeInTheDocument();
  });

  it("添加官方连接：只填 Key，测试后勾选模型并保存", async () => {
    await renderModels();
    await userEvent.click(screen.getByRole("button", { name: /添加连接/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^Anthropic/ }));
    expect(screen.queryByLabelText("服务地址")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("API Key"), "sk-ant-test");
    await userEvent.click(screen.getByRole("button", { name: "测试并获取模型" }));

    expect(await screen.findByText(/连接成功。拿到 3 个模型/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "选择 Claude Opus 4.1" }));
    await userEvent.click(screen.getByRole("button", { name: "保存连接" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      templateId: "anthropic",
      apiKey: "sk-ant-test",
      models: [{ apiModel: "claude-sonnet-4-5", providerFacts: {} }, { apiModel: "claude-haiku-4-5", providerFacts: {} }],
    })));
    expect(await screen.findByRole("heading", { name: "Anthropic", level: 2 })).toBeInTheDocument();
  });

  it("Key 无效时留在填写页并就地提示", async () => {
    await renderModels();
    await userEvent.click(screen.getByRole("button", { name: /添加连接/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^OpenAI/ }));
    await userEvent.type(screen.getByLabelText("API Key"), "badkey");
    await userEvent.click(screen.getByRole("button", { name: "测试并获取模型" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("API Key 无效");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("中转拿不到模型列表时直接展开添加模型，目录命中的模型显示关键信息", async () => {
    await renderModels();
    await userEvent.click(screen.getByRole("button", { name: /添加连接/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^自定义中转/ }));
    await userEvent.type(screen.getByLabelText("服务地址"), "https://relay.test");
    await userEvent.type(screen.getByLabelText("API Key"), "sk-nolist");
    await userEvent.click(screen.getByRole("button", { name: "测试并获取模型" }));

    expect(await screen.findByText(/没有开放模型列表/)).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/模型 ID，例如/), "gpt-5");
    expect(await screen.findByText("400K")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(await screen.findByRole("checkbox", { name: "选择 GPT-5" })).toBeChecked();
  });

  it("连接详情：开关、移除模型、沿用目录模型", async () => {
    await openConnection(/^Claude 中转/);
    await userEvent.click(screen.getByRole("switch", { name: "启用 Claude Sonnet 4.5" }));
    await waitFor(() => expect(api.updateModel).toHaveBeenCalledWith({ key: relayKey("claude-sonnet-4-5"), enabled: false }));

    await userEvent.click(screen.getByRole("button", { name: /qwen3-coder-plus/ }));
    await userEvent.click(await screen.findByRole("button", { name: "移除模型" }));
    await waitFor(() => expect(api.removeModel).toHaveBeenCalledWith({ key: relayKey("qwen3-coder-plus") }));

    await userEvent.click(screen.getByRole("button", { name: /claude-sonnet-4-5-20250929/ }));
    await userEvent.click(await screen.findByRole("button", { name: "沿用 Claude Sonnet 4.5" }));
    await waitFor(() => expect(api.updateModel).toHaveBeenLastCalledWith({ key: relayKey("claude-sonnet-4-5-20250929"), overrides: { canonical: "claude-sonnet-4-5" } }));
    // 沿用后算已知模型：只给关键信息，「取消沿用」收在「更多设置」里。
    await userEvent.click(await screen.findByRole("button", { name: "更多设置" }));
    expect(screen.getByRole("button", { name: "取消沿用 Claude Sonnet 4.5" })).toBeInTheDocument();
  });

  it("倍率填错会退回原值；删除连接要点两次", async () => {
    await openConnection(/^Claude 中转/);
    const multiplier = screen.getByLabelText("价格倍率");
    await userEvent.clear(multiplier);
    await userEvent.type(multiplier, "abc{Enter}");
    expect(multiplier).toHaveValue("0.6");
    expect(api.update).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith({ connectionId: RELAY }));
    expect(await screen.findByRole("heading", { name: "模型连接", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claude 中转/ })).not.toBeInTheDocument();
  });

  it("重新获取：新模型默认不启用", async () => {
    await openConnection(/^Claude 中转/);
    await userEvent.click(screen.getByRole("button", { name: "重新获取" }));
    await waitFor(() => expect(api.addModels).toHaveBeenCalledWith({
      connectionId: RELAY,
      models: expect.arrayContaining([{ apiModel: "gpt-5-mini", providerFacts: {}, enabled: false }]),
    }));
    expect(await screen.findByRole("switch", { name: "启用 GPT-5 mini" })).not.toBeChecked();
  });

  it("官方连接显示余额；OpenRouter 可以填管理 Key", async () => {
    await openConnection(/^DeepSeek/);
    expect(await screen.findByText("余额 ¥86.52")).toBeInTheDocument();
    expect(screen.queryByLabelText("协议")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回模型" }));

    await userEvent.click(await screen.findByRole("button", { name: /^OpenRouter/ }));
    const row = (await screen.findByText("管理 Key")).closest("div")!.parentElement!;
    await userEvent.click(within(row).getByRole("button", { name: "填写" }));
    await userEvent.type(screen.getByLabelText("新的 管理 Key"), "sk-or-mgmt");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith({ connectionId: "openrouter:default", managementKey: "sk-or-mgmt" }));
  });
});
