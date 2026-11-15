import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { ToolLogLine } from "../components/messages/ToolLogLine";
import { renderMessageList } from "../components/conversation/render-message";

/** 通用工具行失败时写「标题 · 失败」，原始报错收进展开项；只有标点的回复段不渲染。 */

function toolBlock(partial: Partial<Extract<MessageBlock, { kind: "tool" }>>): Extract<MessageBlock, { kind: "tool" }> {
  return { kind: "tool", id: "t1", title: "查看可选模型", content: "", createdAt: "2026-11-15T00:00:00.000Z", ...partial };
}

describe("failed generic tool line", () => {
  it("keeps the raw error out of the title row and shows it on expand", async () => {
    render(<ToolLogLine message={toolBlock({ content: "Invalid tool argument at $/_call: Unknown property.", isError: true })} />);
    expect(screen.queryByText(/查看可选模型: Invalid/)).toBeNull();
    const toggle = screen.getByRole("button", { name: /查看可选模型 · 失败/ });
    expect(screen.queryByText(/Unknown property/)).toBeNull();
    await userEvent.click(toggle);
    expect(screen.getByText("Invalid tool argument at $/_call: Unknown property.")).toBeInTheDocument();
  });

  it("still shows a successful row with content on one line", () => {
    render(<ToolLogLine message={toolBlock({ title: "task_stop", content: "Background task stopped" })} />);
    expect(screen.getByText("task_stop: Background task stopped")).toBeInTheDocument();
  });
});

describe("punctuation-only assistant text", () => {
  it("is not rendered between tool rows", () => {
    const assistant = (id: string, content: string): MessageBlock => ({ kind: "assistant", id, content, createdAt: "2026-11-15T00:00:00.000Z" });
    const { container } = render(<>{renderMessageList([assistant("a1", "."), toolBlock({ id: "t2" }), assistant("a2", "好的。")])}</>);
    expect(container.querySelectorAll(".message-flow-item")).toHaveLength(2);
    expect(container).toHaveTextContent("好的。");
  });
});
