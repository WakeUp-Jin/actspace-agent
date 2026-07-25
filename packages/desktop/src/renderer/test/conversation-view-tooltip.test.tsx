import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { ConversationView } from "../components/ConversationView";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";

const messages: MessageBlock[] = [
  {
    kind: "user",
    id: "user-1",
    content: "请把这条回复可视化",
    createdAt: "2026-06-02T00:00:00.000Z",
  },
  {
    kind: "assistant",
    id: "assistant-1",
    content: "这是一条可以被转换成可视化 HTML 的回复。",
    createdAt: "2026-06-02T00:00:01.000Z",
    usage: {
      totalTokens: 33_361,
      costUsd: 0.2321,
    },
  },
];

const messagesWithCompaction: MessageBlock[] = [
  ...messages,
  {
    kind: "context_compaction",
    id: "compact-1",
    status: "completed",
    trigger: "manual",
    summaryText: "Context compacted · 8 messages",
    createdAt: "2026-06-02T00:00:02.000Z",
  },
];

function renderConversation(inputMessages: MessageBlock[] = messages) {
  return render(
    <TooltipProvider delayDuration={0}>
      <RightPanelProvider>
        <ConversationView messages={inputMessages} contextSnapshot={null} sessionId="session-1" />
      </RightPanelProvider>
    </TooltipProvider>,
  );
}

describe("ConversationView tooltips", () => {
  it("keeps the message viewport pinned when streaming content resizes at the bottom", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const OriginalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = vi.fn((callback: ResizeObserverCallback) => {
      resizeCallback = callback;
      return { observe, unobserve: vi.fn(), disconnect };
    }) as unknown as typeof ResizeObserver;

    try {
      renderConversation([
        ...messages,
        {
          kind: "write_diff",
          id: "write-running",
          filePath: "notes.md",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
          streamingContent: "# Notes\n\nDraft",
          status: "running",
          createdAt: "2026-06-02T00:00:02.000Z",
        },
      ]);

      const viewport = screen.getByLabelText("Conversation messages");
      Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1200 });
      Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
      Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 800 });

      act(() => {
        resizeCallback?.([], {} as ResizeObserver);
      });

      expect(viewport.scrollTop).toBe(1200);
      expect(observe).toHaveBeenCalled();
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });

  it("shows a readable label for the visualize action", async () => {
    const user = userEvent.setup();
    renderConversation();

    await user.hover(screen.getByRole("button", { name: "可视化这条回复" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("用主模型把这条回复转成可视化 HTML");
  });

  it("shows a readable label for the more actions button", async () => {
    const user = userEvent.setup();
    renderConversation();

    await user.hover(screen.getByRole("button", { name: "更多消息操作" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("更多操作");
  });

  it("renders a hover-revealed turn footer with tokens, USD cost, and copy action", () => {
    renderConversation();

    const usageMeta = screen.getByLabelText("本轮消耗：33,361 tokens · $0.2321");
    expect(usageMeta).toHaveTextContent("33,361 tokens · $0.2321");
    expect(usageMeta.parentElement).toHaveClass("opacity-0");
    expect(usageMeta.parentElement).toHaveClass("group-hover/assistant-turn:opacity-100");
    expect(screen.getByRole("button", { name: "复制回复" })).toBeInTheDocument();
  });

  it("keeps assistant turn actions above a following compaction divider", () => {
    renderConversation(messagesWithCompaction);

    const actionsButton = screen.getByRole("button", { name: "更多消息操作" });
    const divider = screen.getByRole("separator", { name: "Context compacted · 8 messages" });

    expect(actionsButton.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
