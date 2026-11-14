import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { TurnView } from "../components/conversation/TurnView";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";

// 一轮还在跑时，只有本轮最后一项正在写的回复带末尾渐显和光标；中间已写完的回复按普通正文显示（聊天区规范 §7.1）。

const user: Extract<MessageBlock, { kind: "user" }> = {
  kind: "user",
  id: "u",
  content: "看看子智能体",
  createdAt: "now",
};
const reply = (id: string, content: string): MessageBlock => ({ kind: "assistant", id, content, createdAt: "now" });
const read = (id: string): MessageBlock => ({
  kind: "read",
  id,
  displayText: "Read a.ts",
  createdAt: "now",
  status: "completed",
  filePath: "a.ts",
});

function caretsIn(container: HTMLElement, id: string) {
  return container.querySelector(`[data-assistant-message-id="${id}"]`)!.querySelectorAll(".md-caret").length;
}

function renderTurn(messages: MessageBlock[], isActive: boolean) {
  return render(
    <TooltipProvider>
      <RightPanelProvider>
        <TurnView turn={{ id: "t", user, messages }} isActive={isActive} sessionId="s" setTurnElement={() => {}} />
      </RightPanelProvider>
    </TooltipProvider>,
  );
}

it("only the reply still being written gets the streaming tail while the turn runs", () => {
  const { container } = renderTurn([reply("a", "我先看一下工作区。"), read("r1"), reply("b", "正在读核心源码")], true);
  expect(caretsIn(container, "a")).toBe(0);
  expect(caretsIn(container, "b")).toBe(1);
});

it("a finished reply followed by a running tool has no streaming tail", () => {
  const { container } = renderTurn([reply("a", "我先看一下工作区。"), read("r1")], true);
  expect(caretsIn(container, "a")).toBe(0);
});

it("no reply has a streaming tail once the turn is over", () => {
  const { container } = renderTurn([reply("a", "我先看一下工作区。"), read("r1"), reply("b", "结论")], false);
  // 过程区收起成「Worked for」，整轮都不应再有光标。
  expect(container.querySelectorAll(".md-caret")).toHaveLength(0);
  expect(caretsIn(container, "b")).toBe(0);
});
