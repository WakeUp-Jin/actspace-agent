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
  it("returns focus to the stable fetch button after an automatically opened picker closes", async () => {
    await renderModels();
    await userEvent.click(screen.getByRole("button", { name: /添加连接/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^Anthropic/ }));
    await userEvent.type(screen.getByLabelText("API Key"), "sk-ant-test");
    await userEvent.click(screen.getByRole("button", { name: "连接" }));
    await screen.findByRole("dialog", { name: "选择要添加的模型" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "获取可用模型" })).toHaveFocus());
  });

  it("列表页显示用途和连接，中转标出待补充的模型", async () => {
    await renderModels();
    expect(screen.getByRole("button", { name: "会话默认模型" })).toHaveTextContent("Claude Sonnet 4.5");
    expect(screen.getByRole("button", { name: "自动审批模型" })).toHaveTextContent("跟随会话默认");
    const relay = screen.getByRole("button", { name: /^Claude 中转/ });
    expect(relay).toHaveTextContent("4 个模型");
    expect(relay).toHaveTextContent("2 个待补充");
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

  it("添加官方连接：填 Key 后直接建好，弹窗里一个都不预选，勾了才添加", async () => {
    await renderModels();
    await userEvent.click(screen.getByRole("button", { name: /添加连接/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^Anthropic/ }));
    expect(screen.queryByLabelText("服务地址")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("API Key"), "sk-ant-test");
    await userEvent.click(screen.getByRole("button", { name: "连接" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ templateId: "anthropic", apiKey: "sk-ant-test", models: [] })));
    // 弹窗打开时页面其余部分对读屏隐藏，所以标题用 hidden 查。
    expect(await screen.findByRole("heading", { name: "Anthropic", level: 2, hidden: true })).toBeInTheDocument();
    const dialog = await screen.findByRole("dialog", { name: "选择要添加的模型" });
    expect(dialog).toHaveTextContent("连接好了。Anthropic 一共有 3 个模型");
    expect(within(dialog).getAllByRole("checkbox").every((box) => box.getAttribute("aria-checked") === "false")).toBe(true);
    expect(within(dialog).getByRole("button", { name: "添加所选" })).toBeDisabled();

    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Claude Opus 4.1" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "添加 1 个" }));
    await waitFor(() => expect(api.addModels).toHaveBeenCalledWith({ connectionId: "anthropic:default", models: [{ apiModel: "claude-opus-4-1", providerFacts: {} }] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "展开 Claude Opus 4.1" })).toBeInTheDocument();
  });

  it("Key 无效时留在填写页并就地提示", async () => {
    await renderModels();
    await userEvent.click(screen.getByRole("button", { name: /添加连接/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^OpenAI/ }));
    await userEvent.type(screen.getByLabelText("API Key"), "badkey");
    await userEvent.click(screen.getByRole("button", { name: "连接" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("API Key 无效");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("中转拿不到模型列表：说明原因并展开手动添加，目录认出的模型自动填好", async () => {
    await renderModels();
    await userEvent.click(screen.getByRole("button", { name: /添加连接/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^自定义中转/ }));
    await userEvent.type(screen.getByLabelText("服务地址"), "https://relay.test");
    await userEvent.type(screen.getByLabelText("API Key"), "sk-nolist");
    await userEvent.click(screen.getByRole("button", { name: "连接" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("没拿到模型列表：这个服务没有开放模型列表。");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("模型 ID"), "gpt-5");
    expect(await screen.findByText(/认出来了，是 GPT-5/)).toBeInTheDocument();
    expect(screen.getByLabelText("上下文")).toHaveValue("400K");
    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() => expect(api.addModels).toHaveBeenCalledWith({ connectionId: "custom:relay-2", models: [{ apiModel: "gpt-5" }] }));
    expect(await screen.findByRole("button", { name: "展开 GPT-5" })).toBeInTheDocument();
  });

  it("手动添加：变体按最接近的目录模型填，重复的不能加", async () => {
    await openConnection(/^Claude 中转/);
    await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
    await userEvent.type(screen.getByLabelText("模型 ID"), "claude-sonnet-4-5");
    expect(await screen.findByText("这个模型已经在列表里了。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();

    await userEvent.clear(screen.getByLabelText("模型 ID"));
    await userEvent.type(screen.getByLabelText("模型 ID"), "claude-haiku-4-5-20251001{Enter}");
    expect(await screen.findByText(/按 Claude Haiku 4\.5 填好了/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() => expect(api.addModels).toHaveBeenCalledWith({ connectionId: RELAY, models: [{ apiModel: "claude-haiku-4-5-20251001", overrides: { canonical: "claude-haiku-4-5" } }] }));
  });

  it("模型卡片：失焦保存字段，改过的可以恢复；认不出的给提示，可以按相近模型填", async () => {
    await openConnection(/^Claude 中转/);
    await userEvent.click(screen.getByRole("button", { name: "展开 Claude Sonnet 4.5" }));
    const context = screen.getByLabelText("上下文");
    expect(context).toHaveValue("200K");
    await userEvent.clear(context);
    await userEvent.type(context, "180K{Enter}");
    await waitFor(() => expect(api.updateModel).toHaveBeenLastCalledWith({ key: relayKey("claude-sonnet-4-5"), overrides: { contextWindow: 180_000 } }));
    await userEvent.click(await screen.findByRole("button", { name: "恢复" }));
    await waitFor(() => expect(api.updateModel).toHaveBeenLastCalledWith({ key: relayKey("claude-sonnet-4-5"), overrides: null }));
    await userEvent.click(screen.getByRole("button", { name: "收起 Claude Sonnet 4.5" }));

    await userEvent.click(screen.getByRole("button", { name: "展开 claude-sonnet-4-5-20250929" }));
    expect(screen.getByText(/没认出这个模型/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "按 Claude Sonnet 4.5 填" }));
    await waitFor(() => expect(api.updateModel).toHaveBeenLastCalledWith({ key: relayKey("claude-sonnet-4-5-20250929"), overrides: { canonical: "claude-sonnet-4-5" } }));
    expect(await screen.findByRole("button", { name: "不按 Claude Sonnet 4.5 填" })).toBeInTheDocument();
  });

  it("移除模型：原位给撤销，撤销后不调用移除；关掉撤销条才真正移除", async () => {
    await openConnection(/^Claude 中转/);
    await userEvent.click(screen.getByRole("button", { name: "移除 Claude Sonnet 4.5" }));
    const undoBar = () => screen.getByText(/^已移除/).closest("[role=status]") as HTMLElement;
    expect(undoBar()).toHaveTextContent("已移除 Claude Sonnet 4.5，「会话默认」需要重新选一个模型。");
    expect(screen.queryByRole("button", { name: "展开 Claude Sonnet 4.5" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.getByRole("button", { name: "展开 Claude Sonnet 4.5" })).toBeInTheDocument();
    expect(api.removeModel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "移除 qwen3-coder-plus" }));
    await userEvent.click(within(undoBar()).getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(api.removeModel).toHaveBeenCalledWith({ key: relayKey("qwen3-coder-plus") }));
    expect(screen.queryByRole("button", { name: "展开 qwen3-coder-plus" })).not.toBeInTheDocument();
  });

  it("获取可用模型：已添加的打勾置灰，全选只选没加过的", async () => {
    await openConnection(/^Claude 中转/);
    await userEvent.click(screen.getByRole("button", { name: "获取可用模型" }));
    const dialog = await screen.findByRole("dialog", { name: "选择要添加的模型" });
    expect(dialog).toHaveTextContent("以下是 Claude 中转 的可用模型，已添加的不会重复添加。");
    const added = within(dialog).getByRole("checkbox", { name: "Claude Sonnet 4.5" });
    expect(added).toHaveAttribute("aria-checked", "true");
    expect(added).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: "全选" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "添加 1 个" }));
    await waitFor(() => expect(api.addModels).toHaveBeenCalledWith({ connectionId: RELAY, models: [{ apiModel: "gpt-5-mini", providerFacts: {} }] }));
    expect(await screen.findByRole("button", { name: "展开 GPT-5 mini" })).toBeInTheDocument();
  });

  it("连接字段失焦即保存；倍率填错会退回原值；删除连接要点两次", async () => {
    await openConnection(/^Claude 中转/);
    const name = screen.getByLabelText("名称");
    await userEvent.clear(name);
    await userEvent.type(name, "我的中转{Enter}");
    await waitFor(() => expect(api.update).toHaveBeenCalledWith({ connectionId: RELAY, label: "我的中转" }));
    expect(await screen.findByText("已保存")).toBeInTheDocument();

    const multiplier = screen.getByLabelText("价格倍率");
    await userEvent.clear(multiplier);
    await userEvent.type(multiplier, "abc{Enter}");
    expect(multiplier).toHaveValue("0.6");
    expect(api.update).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith({ connectionId: RELAY }));
    expect(await screen.findByRole("heading", { name: "模型连接", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^我的中转/ })).not.toBeInTheDocument();
  });

  it("余额读取失败时就地反馈，并可重试恢复", async () => {
    api.getBalance.mockRejectedValueOnce(new Error("deepseek balance request failed."));
    await openConnection(/^DeepSeek/);
    expect(await screen.findByRole("alert")).toHaveTextContent("余额读取失败");
    expect(screen.queryByText(/deepseek balance request failed/)).not.toBeInTheDocument();
    expect(screen.queryByText("余额 ¥86.52")).not.toBeInTheDocument();

    const restored = await (createModelConnectionsMock() as Api).getBalance({ connectionId: "deepseek:default" });
    let finishRetry!: (value: typeof restored) => void;
    api.getBalance.mockImplementationOnce(() => new Promise((resolve) => { finishRetry = resolve; }));
    await userEvent.click(screen.getByRole("button", { name: "重试余额" }));
    const retry = screen.getByRole("button", { name: "重试余额" });
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("余额读取中…")).toHaveAttribute("role", "status");
    await userEvent.click(retry);
    expect(api.getBalance).toHaveBeenCalledTimes(2);
    finishRetry(restored);
    expect(await screen.findByText("余额 ¥86.52")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getBalance).toHaveBeenCalledTimes(2);
  });

  it("离开连接详情后忽略迟到的余额失败", async () => {
    let failBalance!: (reason: Error) => void;
    api.getBalance.mockImplementationOnce(() => new Promise((_resolve, reject) => { failBalance = reject; }));
    await openConnection(/^DeepSeek/);
    expect(screen.getByText("余额读取中…")).toHaveAttribute("role", "status");
    await userEvent.click(screen.getByRole("button", { name: "返回模型" }));
    await userEvent.click(await screen.findByRole("button", { name: /^OpenRouter/ }));
    failBalance(new Error("late balance failure"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "OpenRouter", level: 2 })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/余额读取/)).not.toBeInTheDocument();
  });

  it("官方连接显示余额、名称只读、没有计费；OpenRouter 可以填管理 Key", async () => {
    await openConnection(/^DeepSeek/);
    expect(await screen.findByText("余额 ¥86.52")).toBeInTheDocument();
    expect(screen.queryByLabelText("协议")).not.toBeInTheDocument();
    expect(screen.getByLabelText("名称")).toBeDisabled();
    expect(screen.queryByLabelText("价格倍率")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回模型" }));

    await userEvent.click(await screen.findByRole("button", { name: /^OpenRouter/ }));
    await userEvent.type(await screen.findByLabelText("管理 Key"), "sk-or-mgmt");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith({ connectionId: "openrouter:default", managementKey: "sk-or-mgmt" }));
  });
});
