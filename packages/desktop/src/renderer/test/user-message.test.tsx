import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { UserMessage } from "../components/messages/UserMessage";

function makeUserBlock(content: string): Extract<MessageBlock, { kind: "user" }> {
  return {
    kind: "user",
    id: "user-1",
    content,
    createdAt: "2026-07-05T00:00:00.000Z",
  };
}

const LONG_CONTENT = Array.from({ length: 200 }, (_, i) => `第 ${i} 行超长输入`).join("\n");

// jsdom 不做真实布局，scrollHeight 恒为 0；用原型 getter 模拟内容完整高度。
function mockScrollHeight(value: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
});

describe("UserMessage", () => {
  it("renders short content without collapse interaction", () => {
    mockScrollHeight(40);
    render(<UserMessage message={makeUserBlock("短消息")} />);

    const content = screen.getByText("短消息");
    expect(content.className).toContain("overflow-y-auto");
    expect(content.className).not.toContain("cursor-pointer");
    expect(content).not.toHaveAttribute("aria-expanded");
    expect(document.querySelector(".user-content-fade")).toBeNull();
  });

  it("collapses long content by default with a fade and no scrollbar", () => {
    mockScrollHeight(600);
    render(<UserMessage message={makeUserBlock(LONG_CONTENT)} />);

    const content = screen.getByText(/第 0 行超长输入/);
    expect(content.className).toContain("overflow-hidden");
    expect(content.className).toContain("cursor-pointer");
    expect(content).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".user-content-fade")).not.toBeNull();
  });

  it("expands on click and stays expanded when clicking the card again", async () => {
    const user = userEvent.setup();
    mockScrollHeight(600);
    render(<UserMessage message={makeUserBlock(LONG_CONTENT)} />);

    const content = screen.getByText(/第 0 行超长输入/);
    await user.click(content);

    expect(content.className).toContain("overflow-y-auto");
    expect(content.className).toContain("max-h-");
    expect(content).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".user-content-fade")).toBeNull();

    // 再点卡片不收起——收起只通过点击卡片外部触发
    await user.click(content);
    expect(content).toHaveAttribute("aria-expanded", "true");
    expect(content.className).toContain("overflow-y-auto");
  });

  it("collapses only when clicking outside the card", async () => {
    const user = userEvent.setup();
    mockScrollHeight(600);
    render(
      <div>
        <UserMessage message={makeUserBlock(LONG_CONTENT)} />
        <button type="button">elsewhere</button>
      </div>,
    );

    const content = screen.getByText(/第 0 行超长输入/);
    await user.click(content);
    expect(content).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(content).toHaveAttribute("aria-expanded", "false");
    expect(content.className).toContain("overflow-hidden");
  });
});
