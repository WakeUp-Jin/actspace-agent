import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { TestConversationView } from "./helpers/workbench";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";
import { setupBridge } from "./helpers/bridge";

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
      inputTokens: 4_000,
      cacheReadTokens: 28_000,
      cacheWriteTokens: 0,
      outputTokens: 1_361,
      reasoningTokens: 300,
      routes: ["deepseek/deepseek-flash"],
      costUsd: 0.2321,
      unpricedRequestCount: 0,
      costEstimated: true,
    },
  },
];

const earlierTurnMessages: MessageBlock[] = [
  { kind: "user", id: "user-earlier", content: "第一轮", createdAt: "2026-06-01T23:59:00.000Z" },
  { kind: "assistant", id: "assistant-earlier", content: "第一轮回复", createdAt: "2026-06-01T23:59:01.000Z" },
  ...messages,
];

const messagesWithCompaction: MessageBlock[] = [
  ...messages,
  {
    kind: "context_compaction",
    id: "compact-1",
    status: "completed",
    removedCount: 8,
    createdAt: "2026-06-02T00:00:02.000Z",
  },
];

const navigationMessages: MessageBlock[] = [
  {
    kind: "user",
    id: "user-navigation-1",
    content: "第一轮：分析需求",
    createdAt: "2026-06-02T00:00:00.000Z",
  },
  {
    kind: "assistant",
    id: "assistant-navigation-1",
    content: "第一轮回复：需求已经拆分完成。",
    createdAt: "2026-06-02T00:00:01.000Z",
  },
  {
    kind: "user",
    id: "user-navigation-2",
    content: "第二轮：开始实现",
    createdAt: "2026-06-02T00:00:02.000Z",
  },
  {
    kind: "assistant",
    id: "assistant-navigation-2",
    content: "第二轮回复：核心功能已经完成。",
    createdAt: "2026-06-02T00:00:03.000Z",
  },
  {
    kind: "user",
    id: "user-navigation-3",
    content: "第三轮：验证结果",
    createdAt: "2026-06-02T00:00:04.000Z",
  },
  {
    kind: "assistant",
    id: "assistant-navigation-3",
    content: "第三轮回复：所有检查均已通过。",
    createdAt: "2026-06-02T00:00:05.000Z",
  },
];

function renderConversation(inputMessages: MessageBlock[] = messages) {
  return render(
    <TooltipProvider delayDuration={0}>
      <RightPanelProvider>
        <TestConversationView messages={inputMessages} contextSnapshot={null} sessionId="session-1" />
      </RightPanelProvider>
    </TooltipProvider>,
  );
}

describe("ConversationView tooltips", () => {
  it("opens the turn ⋯ menu from the keyboard, copies the request id and returns focus (16 T16b)", async () => {
    renderConversation();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "更多消息操作" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "分叉会话" })).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).queryByRole("menuitem", { name: "重新生成可视化" })).toBeNull();
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "复制消息" })).toHaveFocus());
    await user.keyboard("{ArrowDown}{Enter}");

    expect(await navigator.clipboard.readText()).toBe("assistant-1");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps Thinking open until the final reply finishes, then collapses Work and Thinking", () => {
    const thinking: MessageBlock = {
      kind: "thinking", id: "thinking-1", title: "Thinking...", content: "Long reasoning content",
      createdAt: messages[0].createdAt, collapsedByDefault: false, status: "running",
    };
    const view = (active: boolean, blocks: MessageBlock[]) => (
      <TooltipProvider><RightPanelProvider>
        <TestConversationView messages={blocks} contextSnapshot={null} sessionId="session-1" isStreaming={active} />
      </RightPanelProvider></TooltipProvider>
    );
    const { rerender } = render(view(true, [messages[0], thinking]));
    expect(screen.getByText("Long reasoning content")).toBeVisible();
    const replying: MessageBlock[] = [messages[0], { ...thinking, status: "completed" }, messages[1]];
    rerender(view(true, replying));
    expect(screen.getByText("Long reasoning content")).toBeVisible();
    rerender(view(false, replying));
    expect(screen.queryByText("Long reasoning content", { selector: "pre" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Worked for/ }));
    expect(screen.getByRole("button", { name: "Thinking..." })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Thinking..." }));
    expect(screen.getByText("Long reasoning content", { selector: "pre" })).toBeVisible();
    rerender(view(false, [...replying]));
    expect(screen.getByText("Long reasoning content", { selector: "pre" })).toBeVisible();
  });

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

      const viewport = screen.getByLabelText("会话消息");
      Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1200 });
      Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
      Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 700 });

      act(() => {
        resizeCallback?.([], {} as ResizeObserver);
      });

      expect(viewport.scrollTop).toBe(1200);
      expect(observe).toHaveBeenCalled();
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });

  it("does not rebuild the ResizeObserver when messages keep updating while streaming", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const OriginalResizeObserver = globalThis.ResizeObserver;
    const Observer = vi.fn(() => ({ observe, unobserve: vi.fn(), disconnect }));
    globalThis.ResizeObserver = Observer as unknown as typeof ResizeObserver;
    try {
      const view = (blocks: MessageBlock[]) => (
        <TooltipProvider><RightPanelProvider>
          <TestConversationView messages={blocks} contextSnapshot={null} sessionId="session-1" isStreaming />
        </RightPanelProvider></TooltipProvider>
      );
      const { rerender } = render(view(messages));
      const viewport = screen.getByLabelText("会话消息");
      const observersAfterMount = Observer.mock.calls.length;
      for (let step = 1; step <= 3; step += 1) {
        rerender(view([messages[0], { ...messages[1], content: `${messages[1].kind === "assistant" ? messages[1].content : ""}${"。更多".repeat(step)}` } as MessageBlock]));
      }
      expect(Observer).toHaveBeenCalledTimes(observersAfterMount);
      // The message viewport is observed once and never re-observed on later updates.
      expect(observe.mock.calls.filter(([target]) => target === viewport)).toHaveLength(1);
      expect(disconnect).not.toHaveBeenCalled();
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });

  it("keeps following the bottom when content grows past the threshold before the scroll event arrives", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const OriginalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = vi.fn((callback: ResizeObserverCallback) => {
      resizeCallback = callback;
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    }) as unknown as typeof ResizeObserver;
    try {
      renderConversation();
      const viewport = screen.getByLabelText("会话消息");
      let scrollHeight = 1200;
      let scrollTop = 500;
      const clientHeight = 400;
      Object.defineProperty(viewport, "scrollHeight", { configurable: true, get: () => scrollHeight });
      Object.defineProperty(viewport, "clientHeight", { configurable: true, value: clientHeight });
      // Like a real browser, scrollTop is clamped to the scrollable range.
      Object.defineProperty(viewport, "scrollTop", {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = Math.min(value, scrollHeight - clientHeight); },
      });

      act(() => { resizeCallback?.([], {} as ResizeObserver); });
      expect(scrollTop).toBe(800);

      // Streaming adds >80px after the write and before the resulting scroll event is dispatched.
      scrollHeight = 1400;
      fireEvent.scroll(viewport);
      expect(screen.queryByRole("button", { name: "滚动到底部" })).toBeNull();

      act(() => { resizeCallback?.([], {} as ResizeObserver); });
      expect(scrollTop).toBe(1000);
      expect(screen.queryByRole("button", { name: "滚动到底部" })).toBeNull();

      // An upward move is the user leaving the bottom: following stops and the button appears.
      scrollTop = 300;
      fireEvent.scroll(viewport);
      expect(screen.getByRole("button", { name: "滚动到底部" })).toBeInTheDocument();
      scrollHeight = 1600;
      act(() => { resizeCallback?.([], {} as ResizeObserver); });
      expect(scrollTop).toBe(300);
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

  it("shows the turn usage pill after the actions and opens token, model, and cost details", async () => {
    const user = userEvent.setup();
    renderConversation();

    const pill = screen.getByRole("button", { name: "用量 33.4K tok，查看本轮用量" });
    const copy = screen.getByRole("button", { name: "复制回复" });
    expect(copy.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(pill);
    const dialog = await screen.findByRole("dialog", { name: "本轮用量" });
    expect(dialog).toHaveTextContent("33,361 tok");
    const rows = Array.from(dialog.querySelectorAll("dt")).map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(rows).toEqual([
      ["提供方 / 模型", "deepseek/deepseek-flash"],
      ["缓存命中", "87.5%"],
      ["未缓存输入", "4,000 tok"],
      ["缓存读取", "28,000 tok"],
      ["缓存写入", "0 tok"],
      ["输出", "1,361 tok（其中推理 300 tok）"],
      ["花费", "$0.2321预估"],
    ]);
  });

  it("keeps the latest turn's actions visible and reveals earlier turns on hover", () => {
    const { container } = renderConversation(earlierTurnMessages);

    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-turn-actions-reveal]"));
    expect(rows.map((row) => row.dataset.turnActionsReveal)).toEqual(["hover", "always"]);
    expect(rows[0]).toHaveClass("opacity-0", "group-hover/assistant-turn:opacity-100");
    expect(rows[1]).not.toHaveClass("opacity-0");
  });

  it("keeps assistant turn actions above a following compaction divider", () => {
    renderConversation(messagesWithCompaction);

    const actionsButton = screen.getByRole("button", { name: "更多消息操作" });
    const divider = screen.getByRole("separator", { name: "以上 8 条消息已压缩" });

    expect(actionsButton.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a turn rail for long conversations, previews the turn, and navigates to it", async () => {
    const { container } = renderConversation(navigationMessages);
    const viewport = screen.getByLabelText("会话消息");
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1800 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 900 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 400 });

    const turnElements = Array.from(container.querySelectorAll<HTMLElement>("[data-conversation-turn-id]"));
    const turnTops = [-120, 100, 720];
    turnElements.forEach((element, index) => {
      element.getBoundingClientRect = vi.fn(() => ({
        top: turnTops[index],
        bottom: turnTops[index] + 200,
        left: 0,
        right: 800,
        width: 800,
        height: 200,
        x: 0,
        y: turnTops[index],
        toJSON: () => ({}),
      }));
    });
    const firstTurnScrollIntoView = vi.fn();
    turnElements[0].scrollIntoView = firstTurnScrollIntoView;
    fireEvent.scroll(viewport);

    const rail = screen.getByRole("navigation", { name: "会话轮次导航" });
    const firstMarker = within(rail).getByRole("button", { name: /第一轮：分析需求/ });
    const secondMarker = within(rail).getByRole("button", { name: /第二轮：开始实现/ });
    const thirdMarker = within(rail).getByRole("button", { name: /第三轮：验证结果/ });
    expect(secondMarker).toHaveAttribute("aria-current", "location");
    expect(firstMarker.firstElementChild).toHaveClass("w-1.5");
    expect(secondMarker.firstElementChild).toHaveClass("w-5");

    const user = userEvent.setup();
    await user.hover(firstMarker);
    expect(firstMarker.firstElementChild).toHaveClass("w-6");
    expect(secondMarker.firstElementChild).toHaveClass("w-5");
    expect(thirdMarker.firstElementChild).toHaveClass("w-4");
    const preview = await screen.findByRole("tooltip");
    expect(preview).toHaveTextContent("第一轮：分析需求");
    expect(preview).toHaveTextContent("第一轮回复：需求已经拆分完成。");

    await user.click(firstMarker);
    expect(firstTurnScrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("shows scroll-to-bottom only while away from the bottom and restores sticky following", async () => {
    renderConversation(navigationMessages);
    const viewport = screen.getByLabelText("会话消息");
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1800 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 900 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 1300 });
    fireEvent.scroll(viewport);
    viewport.scrollTop = 500;
    fireEvent.scroll(viewport);

    const scrollButton = screen.getByRole("button", { name: "滚动到底部" });
    const user = userEvent.setup();
    await user.hover(scrollButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("滚动到底部");

    await user.click(scrollButton);
    expect(viewport.scrollTop).toBe(1800);
    expect(screen.queryByRole("button", { name: "滚动到底部" })).not.toBeInTheDocument();

    viewport.scrollTop = 300;
    fireEvent.scroll(viewport);
    expect(screen.getByRole("button", { name: "滚动到底部" })).toBeInTheDocument();

    viewport.scrollTop = 1300;
    fireEvent.scroll(viewport);
    expect(screen.queryByRole("button", { name: "滚动到底部" })).not.toBeInTheDocument();
  });

  it("visualizes only the final reply and sends an explicit regenerate request", async () => {
    const visualizeReply = vi.fn(async () => ({
      html: "<!doctype html><html><body>generated</body></html>",
      sourceHash: "hash",
      cached: false,
    }));
    setupBridge({ "visualize.convertReply": visualizeReply });
    renderConversation([
      {
        kind: "user",
        id: "user-visualize",
        content: "执行并总结",
        createdAt: "2026-06-02T00:00:00.000Z",
      },
      {
        kind: "assistant",
        id: "assistant-progress",
        content: "正在执行第一步。",
        createdAt: "2026-06-02T00:00:01.000Z",
      },
      {
        kind: "thinking",
        id: "thinking-visualize",
        title: "Thinking",
        content: "检查结果",
        collapsedByDefault: true,
        createdAt: "2026-06-02T00:00:02.000Z",
      },
      {
        kind: "assistant",
        id: "assistant-final",
        content: "这是最终回复。",
        createdAt: "2026-06-02T00:00:03.000Z",
      },
    ]);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "可视化这条回复" }));
    await waitFor(() => expect(visualizeReply).toHaveBeenCalledOnce());
    expect(visualizeReply).toHaveBeenNthCalledWith(1, {
      sessionId: "session-1",
      messageId: "assistant-final",
      content: "这是最终回复。",
      regenerate: false,
    });

    await user.click(screen.getByRole("button", { name: "更多消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "重新生成可视化" }));
    await waitFor(() => expect(visualizeReply).toHaveBeenCalledTimes(2));
    expect(visualizeReply).toHaveBeenNthCalledWith(2, {
      sessionId: "session-1",
      messageId: "assistant-final",
      content: "这是最终回复。",
      regenerate: true,
    });
  });
});

it("hides the trajectory composer without losing the draft and keeps Stop available", async () => {
  const abort = vi.fn();
  const draft = { id: 1, sessionId: "draft-test", text: "initial draft", attachments: [{ id: "att", kind: "file" as const, name: "notes.txt", path: "/fixture/notes.txt" }] };
  const view = (activeView: "chat" | "trajectory") => <TooltipProvider><RightPanelProvider><TestConversationView messages={messages} contextSnapshot={null} activeView={activeView} draftKey="draft-test" draftRestore={draft} selectedModelId="deepseek-v4-flash" isStreaming onAbort={abort} /></RightPanelProvider></TooltipProvider>;
  const rendered = render(view("chat"));
  const input = rendered.container.querySelector("textarea")!;
  const model = screen.getByRole("button", { name: "deepseek-flash" });
  expect(screen.getByRole("button", { name: "移除 notes.txt" })).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "keep this draft" } });
  rendered.rerender(view("trajectory"));
  expect(rendered.container.querySelector(".composer-zone")).toHaveStyle({ display: "none" });
  fireEvent.click(screen.getByRole("button", { name: "停止" }));
  expect(abort).toHaveBeenCalledTimes(1);
  rendered.rerender(view("chat"));
  expect(rendered.container.querySelector("textarea")).toBe(input);
  expect(input.value).toBe("keep this draft");
  expect(screen.getByRole("button", { name: "移除 notes.txt" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "deepseek-flash" })).toBe(model);
});

it("shows and resumes accepted tasks even before the first conversation turn exists", async () => {
  const resume = vi.fn();
  render(<TooltipProvider><RightPanelProvider><TestConversationView messages={[]} contextSnapshot={null} sessionId="recovered" isSessionReady
    messageQueue={{ queue: { paused: true, steering: [], items: [{ id: "pending", kind: "message", text: "Accepted before startup failure", options: {} }] }, running: false, steerBlockedReason: null,
      onSteer: vi.fn(), onUnsteer: vi.fn(), onRemove: vi.fn(), onMoveUp: vi.fn(), onEdit: vi.fn(), onResume: resume }}
  /></RightPanelProvider></TooltipProvider>);
  expect(screen.getByText("Accepted before startup failure")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "继续发送" }));
  expect(resume).toHaveBeenCalledOnce();
});

it("does not present a fragment's usage as a complete turn total", () => {
  const thinking: MessageBlock = { kind: "thinking", id: "partial-work", title: "Thinking...", content: "Visible fragment", createdAt: messages[0].createdAt, collapsedByDefault: true, status: "completed" };
  const view = renderConversation([thinking, messages[1]]);
  expect(screen.getByRole("button", { name: "Worked" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Worked for/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /用量 33.4K tok/ })).not.toBeInTheDocument();
  expect(screen.getByText(messages[1].kind === "assistant" ? messages[1].content : "")).toBeVisible();
  view.unmount();
  renderConversation([messages[0], thinking, messages[1]]);
  expect(screen.getByRole("button", { name: /Worked for 1s/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /用量 33.4K tok/ })).toBeVisible();
});
