import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { PinnedTurnPrompt } from "../components/conversation/PinnedTurnPrompt";
import type { ConversationTurn } from "../components/conversation/turns";

type UserBlock = Extract<MessageBlock, { kind: "user" }>;
type TodoBlock = Extract<MessageBlock, { kind: "todo" }>;

const LONG_QUESTION = "macOS 拿到 profile 之后内核做了什么\n\n第二个问题：配置文件的语法分别对应沙箱什么模块？";

function user(id: string, content: string): UserBlock {
  return { kind: "user", id, content, createdAt: "2026-10-31T00:00:00.000Z" } as UserBlock;
}

function todo(): TodoBlock {
  return {
    kind: "todo",
    id: "todo-1",
    todos: [],
    totalCount: 5,
    completedCount: 2,
    revision: 1,
    displayText: "2 of 5 To-dos Completed",
    status: "running",
    createdAt: "2026-10-31T00:00:00.000Z",
  } as TodoBlock;
}

const TURNS: ConversationTurn[] = [
  { id: "t1", user: user("u1", LONG_QUESTION), messages: [todo()] },
  { id: "t2", user: user("u2", "那 Linux 上对应的机制是什么？"), messages: [] },
];

// jsdom 不排版：每个元素的位置从 data-top / data-bottom 读，测试里改这两个值模拟滚动。
let rectSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const top = Number((this as HTMLElement).dataset?.top ?? 0);
    const bottom = Number((this as HTMLElement).dataset?.bottom ?? 0);
    return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => rectSpy.mockRestore());

function Harness({ onJump }: { onJump?: (turnId: string) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <div>
      <div ref={scrollRef} data-testid="scroller" data-top="0" data-bottom="600">
        {TURNS.map((turn) => (
          <section key={turn.id} data-conversation-turn-id={turn.id} data-testid={`turn-${turn.id}`}>
            <div className="turn-prompt-card" data-testid={`card-${turn.id}`} />
          </section>
        ))}
      </div>
      <PinnedTurnPrompt scrollRef={scrollRef} turns={TURNS} className="w-full" onJump={onJump} />
    </div>
  );
}

function place(testId: string, top: number, bottom: number) {
  const element = screen.getByTestId(testId);
  element.dataset.top = String(top);
  element.dataset.bottom = String(bottom);
}

/** 第一轮从 0 开始、第二轮从 2000 开始；`scrollTop` 是滚过的距离。 */
function scrollTo(scrollTop: number) {
  place("turn-t1", 0 - scrollTop, 2000 - scrollTop);
  place("card-t1", 16 - scrollTop, 140 - scrollTop);
  place("turn-t2", 2000 - scrollTop, 3000 - scrollTop);
  place("card-t2", 2016 - scrollTop, 2070 - scrollTop);
  act(() => {
    fireEvent.scroll(screen.getByTestId("scroller"));
  });
}

describe("PinnedTurnPrompt", () => {
  it("提问卡片还看得见时不叠，滚出视野后叠一行提问和任务进度", async () => {
    render(<Harness />);
    scrollTo(0);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.queryByTestId("pinned-turn-prompt")).not.toBeInTheDocument();

    scrollTo(400);
    const row = await screen.findByRole("button", { name: /^展开提问：macOS 拿到 profile 之后内核做了什么 第二个问题/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("任务 2/5")).toBeInTheDocument();
  });

  it("点开显示全文和跳转，点外面或 Esc 收起", async () => {
    const onJump = vi.fn();
    render(<Harness onJump={onJump} />);
    scrollTo(400);
    await userEvent.click(await screen.findByRole("button", { name: /^展开提问/ }));
    expect(screen.getByRole("button", { name: "收起提问" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText((_, element) => element?.textContent === LONG_QUESTION && element.tagName === "DIV")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("button", { name: /^展开提问/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^展开提问/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: /^展开提问/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^展开提问/ }));
    await userEvent.click(screen.getByRole("button", { name: "跳到这条提问" }));
    expect(onJump).toHaveBeenCalledWith("t1");
  });

  it("滚到下一轮后换成下一轮的提问；一轮快滚完时不叠", async () => {
    render(<Harness />);
    scrollTo(1950);
    await waitFor(() => expect(screen.queryByTestId("pinned-turn-prompt")).not.toBeInTheDocument());

    scrollTo(2200);
    expect(await screen.findByRole("button", { name: "展开提问：那 Linux 上对应的机制是什么？" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^任务/)).not.toBeInTheDocument();
  });
});
