import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { TurnView } from "../components/conversation/TurnView";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";

/** 只发回复批注的一轮：只有「N 条批注」胶囊，没有空的提问卡片。 */

type UserBlock = Extract<MessageBlock, { kind: "user" }>;
const user = (partial: Partial<UserBlock>): UserBlock => ({ kind: "user", id: "u1", content: "", createdAt: "2026-11-15T00:00:00.000Z", ...partial } as UserBlock);
const annotation = { annotationId: "a", assistantMessageId: "m1", selectedText: "代理", comment: "为什么", createdAt: "2026-11-15T00:00:00.000Z" } as unknown as NonNullable<UserBlock["responseAnnotations"]>[number];

function view(block: UserBlock) {
  return render(
    <TooltipProvider><RightPanelProvider>
      <TurnView turn={{ id: "t1", user: block, messages: [] }} isActive={false} sessionId="s" setTurnElement={() => {}} />
    </RightPanelProvider></TooltipProvider>,
  );
}

it("renders only the annotation pill for an annotation-only turn, keeping the pin anchor", () => {
  const { container } = view(user({ responseAnnotations: [annotation] }));
  const pill = screen.getByRole("button", { name: "1 条批注" });
  expect(container.querySelector(".user-card")).toBeNull();
  // 批注行顶替卡片做顶部固定行的锚点，但不是可点的编辑卡片。
  const anchor = container.querySelector(".turn-prompt-card");
  expect(anchor).toContainElement(pill);
  expect(anchor).not.toHaveAttribute("data-editable");
});

it("keeps the card when the annotated turn also has text", () => {
  const { container } = view(user({ content: "看一下这里", responseAnnotations: [annotation] }));
  expect(container.querySelector(".user-card")).toHaveTextContent("看一下这里");
});
