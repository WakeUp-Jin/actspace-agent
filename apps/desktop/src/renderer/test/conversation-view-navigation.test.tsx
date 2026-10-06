import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { MessageBlock, ResponseAnnotationReference } from "@actspace/shared";
import { TestConversationView, type TestConversationViewProps } from "./helpers/workbench";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";

// ConversationView 拆分（16 T13）后，轮次导航与两处 Composer 的接线。
// jsdom 没有布局：视口尺寸用 defineProperty 模拟。

function turnMessages(count: number): MessageBlock[] {
  return Array.from({ length: count }, (_, index) => [
    { kind: "user" as const, id: `user-${index + 1}`, content: `第 ${index + 1} 轮提问`, createdAt: `2026-06-02T00:00:0${index * 2}.000Z` },
    { kind: "assistant" as const, id: `assistant-${index + 1}`, content: `第 ${index + 1} 轮回复`, createdAt: `2026-06-02T00:00:0${index * 2 + 1}.000Z` },
  ]).flat();
}

function renderConversation(props: TestConversationViewProps) {
  return render(
    <TooltipProvider delayDuration={0}>
      <RightPanelProvider>
        <TestConversationView contextSnapshot={null} sessionId="session-1" {...props} />
      </RightPanelProvider>
    </TooltipProvider>,
  );
}

function scrollViewport(width: number) {
  const viewport = screen.getByLabelText("会话消息");
  Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1800 });
  Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 500 });
  Object.defineProperty(viewport, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 400 });
  fireEvent.scroll(viewport);
}

describe("ConversationView turn navigation", () => {
  it("shows the turn rail only with at least three turns and a wide enough viewport", () => {
    const twoTurns = renderConversation({ messages: turnMessages(2) });
    scrollViewport(900);
    expect(screen.queryByRole("navigation", { name: "会话轮次导航" })).toBeNull();
    twoTurns.unmount();

    const narrow = renderConversation({ messages: turnMessages(3) });
    scrollViewport(639);
    expect(screen.queryByRole("navigation", { name: "会话轮次导航" })).toBeNull();
    narrow.unmount();

    renderConversation({ messages: turnMessages(3) });
    scrollViewport(640);
    const rail = screen.getByRole("navigation", { name: "会话轮次导航" });
    expect(within(rail).getAllByRole("button")).toHaveLength(3);
  });
});

describe("ConversationView composer slots", () => {
  it("gives the followup composer the earlier prompts as input history", async () => {
    renderConversation({ messages: turnMessages(2) });
    const input = screen.getByRole("textbox");
    const user = userEvent.setup();
    await user.click(input);
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("第 2 轮提问");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("第 1 轮提问");
  });

  it("shows the review summary in the followup composer and opens Review from it", async () => {
    const onOpenReview = vi.fn();
    renderConversation({ messages: turnMessages(1), reviewSummary: { status: "changes", additions: 3, deletions: 1 }, onOpenReview });
    await userEvent.setup().click(screen.getByRole("button", { name: "审查待处理变更 +3 -1" }));
    expect(onOpenReview).toHaveBeenCalledOnce();
  });

  it("passes the permission control to the followup composer's status row", () => {
    renderConversation({ messages: turnMessages(1), permissionControl: <button type="button">权限模式</button> });
    expect(screen.getByRole("button", { name: "权限模式" })).toBeInTheDocument();
  });

  it("shows the session's draft annotations in the composer", () => {
    const annotation: ResponseAnnotationReference = {
      annotationId: "annotation-1",
      assistantMessageId: "assistant-1",
      selectedText: "第 1 轮回复",
      startOffset: 0,
      endOffset: 6,
      prefixContext: "",
      suffixContext: "",
      comment: "展开说说",
    };
    renderConversation({ messages: turnMessages(1), draftKey: "session-1", readAnnotationDraft: () => [annotation] });
    expect(screen.getByRole("button", { name: "1 条批注" })).toBeInTheDocument();
  });
});
