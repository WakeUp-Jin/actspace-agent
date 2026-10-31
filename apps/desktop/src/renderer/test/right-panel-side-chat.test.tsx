import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { App } from "../App";
import { setupBridge } from "./helpers/bridge";

const MAIN_TITLE = "梳理 runtime 插件加载";
const OTHER_TITLE = "梳理 preload 接口";

// 右栏打开时窗口窄会自动收起侧栏；给足宽度，侧栏、会话区、右栏同时在。
const initialWidth = window.innerWidth;
beforeEach(() => { Object.defineProperty(window, "innerWidth", { configurable: true, value: 1800 }); });
afterEach(() => { Object.defineProperty(window, "innerWidth", { configurable: true, value: initialWidth }); });

async function clickSession(user: ReturnType<typeof userEvent.setup>, title: string) {
  const row = await waitFor(() => {
    const found = screen.getAllByText(title).find((element) => element.closest("[data-session-id]"));
    if (!found) throw new Error(`no sidebar row for ${title}`);
    return found;
  });
  await user.click(row);
}

async function openMainSessionPanel(user: ReturnType<typeof userEvent.setup>) {
  await clickSession(user, MAIN_TITLE);
  await user.click(await screen.findByRole("button", { name: "打开面板" }));
}

it("opens a side chat from the right panel, answers there, and keeps it out of the sidebar", async () => {
  const user = userEvent.setup();
  const { db } = setupBridge({}, "side-chat");
  render(<App />);

  expect(await screen.findByLabelText("2 个侧边对话")).toBeInTheDocument();
  expect(document.querySelectorAll("[data-session-id]")).toHaveLength(2);
  await openMainSessionPanel(user);

  const collapsed = await screen.findByRole("region", { name: "本会话的侧边对话 · 已收起" });
  expect(within(collapsed).getAllByRole("button")).toHaveLength(2);

  await user.click(screen.getByRole("button", { name: "侧边对话" }));
  const panel = await screen.findByRole("region", { name: /^侧边对话：/ });
  // 主会话第 4 轮还在跑：分叉只带前 3 轮，也不显示继承来的消息。
  expect(within(panel).getByTestId("side-chat-divider")).toHaveTextContent("继承主会话 3 轮，不含进行中的第 4 轮");
  expect(await within(panel).findByText("在这里另起一条线问，不打断主会话")).toBeInTheDocument();
  expect(within(panel).queryByText("runtime 是怎么发现插件包的？")).not.toBeInTheDocument();

  await user.type(within(panel).getByLabelText("消息输入框"), "插件之间能共享状态吗？{Enter}");
  expect(await within(panel).findByText(/这条回复只在右侧面板里/, undefined, { timeout: 3000 })).toBeInTheDocument();
  expect(screen.getAllByText(/这条回复只在右侧面板里/)).toHaveLength(1);
  const sideChats = [...db.sessions.values()].filter((session) => session.sideChat);
  expect(sideChats).toHaveLength(3);
  expect(sideChats.at(-1)?.messages.some((message) => message.content === "插件之间能共享状态吗？")).toBe(true);
  expect(db.sessions.get(sideChats[0]!.sideChat!.parentId)?.messages.some((message) => message.content === "插件之间能共享状态吗？")).toBe(false);
  // tab 标题换成第一条问题；侧栏里还是只有两个主会话。
  expect(await screen.findByRole("tab", { name: /插件之间能共享状态吗？/ })).toBeInTheDocument();
  expect(document.querySelectorAll("[data-session-id]")).toHaveLength(2);
  // 第一条问题存成了会话标题：收起后列表里认得出它。
  await waitFor(() => expect(sideChats.at(-1)?.title).toBe("插件之间能共享状态吗？"));
  await user.click(within(screen.getByRole("tablist", { name: "右侧面板" })).getByRole("button", { name: /^收起 / }));
  const collapsed2 = await screen.findByRole("region", { name: "本会话的侧边对话 · 已收起" });
  expect(await within(collapsed2).findByRole("button", { name: "插件之间能共享状态吗？" })).toBeInTheDocument();
});

it("hides a main session's side chats after switching sessions and reopens collapsed ones", async () => {
  const user = userEvent.setup();
  setupBridge({}, "side-chat");
  render(<App />);
  await openMainSessionPanel(user);

  await user.click(await screen.findByRole("button", { name: "侧边对话" }));
  expect(await screen.findByRole("region", { name: /^侧边对话：/ })).toBeInTheDocument();

  await clickSession(user, OTHER_TITLE);
  await waitFor(() => expect(screen.queryByRole("region", { name: /^侧边对话：/ })).not.toBeInTheDocument());
  expect(screen.queryByRole("tab", { name: /侧边对话/ })).not.toBeInTheDocument();

  await clickSession(user, MAIN_TITLE);
  expect(await screen.findByRole("region", { name: /^侧边对话：/ })).toBeInTheDocument();

  await user.click(within(screen.getByRole("tablist", { name: "右侧面板" })).getByRole("button", { name: /^收起 侧边对话/ }));
  const collapsed = await screen.findByRole("region", { name: "本会话的侧边对话 · 已收起" });
  expect(within(collapsed).getAllByRole("button")).toHaveLength(3);
  await user.click(within(collapsed).getByRole("button", { name: "ctx.plugin 和 ctx.inject 的区别" }));

  const panel = await screen.findByRole("region", { name: "侧边对话：ctx.plugin 和 ctx.inject 的区别" });
  expect(await within(panel).findByText(/服务就绪后才调用 apply/)).toBeInTheDocument();
  expect(within(panel).queryByText("runtime 是怎么发现插件包的？")).not.toBeInTheDocument();
  expect(within(panel).getByTestId("side-chat-divider")).toHaveTextContent("继承主会话 3 轮");
});

it("sends `/side 问题` from the main composer to a new side chat that can be stopped", async () => {
  const user = userEvent.setup();
  const { db } = setupBridge({}, "side-chat");
  render(<App />);
  await clickSession(user, MAIN_TITLE);

  const mainInput = await screen.findByLabelText("消息输入框");
  await user.type(mainInput, "/side 插件热更新怎么做？");
  await user.keyboard("{Enter}");

  const panel = await screen.findByRole("region", { name: /^侧边对话：/ });
  await user.click(await within(panel).findByRole("button", { name: "停止 Agent" }));
  await waitFor(() => expect(within(panel).queryByRole("button", { name: "停止 Agent" })).not.toBeInTheDocument());
  expect(await within(panel).findByText("插件热更新怎么做？")).toBeInTheDocument();
  expect(within(panel).getByTestId("side-chat-divider")).toHaveTextContent("继承主会话 3 轮，不含进行中的第 4 轮");

  const main = [...db.sessions.values()].find((session) => session.title === MAIN_TITLE && !session.sideChat);
  expect(main?.messages.some((message) => message.content.includes("插件热更新"))).toBe(false);
  expect(mainInput).toHaveValue("");
});
