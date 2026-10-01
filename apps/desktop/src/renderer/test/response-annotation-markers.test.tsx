import { useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock, ResponseAnnotationReference } from "@actspace/shared";
import { AssistantReply } from "../components/messages/AssistantReply";
import { ResponseAnnotationCommentPopover } from "../components/messages/ResponseAnnotationCommentPopover";
import { ResponseAnnotationHighlights } from "../components/messages/ResponseAnnotationHighlights";
import { ResponseAnnotationContext, isAnnotatableMessageId } from "../components/messages/response-annotation-context";
import { resolveAnnotationRange } from "../components/messages/response-annotation-text";
import { TooltipProvider } from "../components/ui/Tooltip";
import { createAnnotationContextValue, makeAnnotation, stubRangeRects } from "./fixtures/response-annotation-helpers";

const REPLY: Extract<MessageBlock, { kind: "assistant" }> = {
  kind: "assistant",
  id: "v2-1",
  content: "第一段内容\n\n第二段的正文",
  createdAt: "2026-09-28T00:00:00.000Z",
};

type HarnessState = {
  drafts: ResponseAnnotationReference[];
  editingAnnotationId?: string | null;
  activeAnnotationId?: string | null;
  messages?: MessageBlock[];
  /** 回复晚于高亮组件出现（列表首帧后才渲染）。 */
  deferReply?: boolean;
};

let current: {
  drafts: readonly ResponseAnnotationReference[];
  activeAnnotationId: string | null;
  setActive: (id: string | null) => void;
  setDrafts: (next: ResponseAnnotationReference[]) => void;
  showReply: () => void;
};

/** 用真实 state 驱动的批注 context：圆点、评论框和高亮都读同一份草稿。 */
function Harness({ initial, onClose }: { initial: HarnessState; onClose?: () => void }) {
  const [drafts, setDrafts] = useState<ResponseAnnotationReference[]>(initial.drafts);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(initial.editingAnnotationId ?? null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(initial.activeAnnotationId ?? null);
  const [replyVisible, setReplyVisible] = useState(!initial.deferReply);
  current = { drafts, activeAnnotationId, setActive: setActiveAnnotationId, setDrafts, showReply: () => setReplyVisible(true) };
  const messagesRef = useRef<HTMLElement | null>(null);
  // 评论框不给消息区：jsdom 里容器没有尺寸，会被当成原文滚出视口而隐藏。
  const popoverScrollRef = useRef<HTMLElement | null>(null);
  const value = createAnnotationContextValue({
    drafts,
    editingAnnotationId,
    setEditingAnnotationId,
    activeAnnotationId,
    setActiveAnnotationId,
    updateComment: (id, comment) =>
      setDrafts((list) =>
        list.map((item) => {
          if (item.annotationId !== id) return item;
          const { comment: _previous, ...rest } = item;
          return comment ? { ...rest, comment } : rest;
        }),
      ),
    removeDraft: (id) => setDrafts((list) => list.filter((item) => item.annotationId !== id)),
    resolveRange: (annotation) => resolveAnnotationRange(document.body, annotation),
  });
  return (
    <TooltipProvider delayDuration={0}>
      <ResponseAnnotationContext.Provider value={value}>
        <section ref={messagesRef}>{replyVisible ? <AssistantReply message={REPLY} /> : null}</section>
        <ResponseAnnotationHighlights messages={initial.messages ?? []} scrollContainerRef={messagesRef} />
        <ResponseAnnotationCommentPopover scrollContainerRef={popoverScrollRef} onClose={onClose} />
        <button type="button">回复外部</button>
      </ResponseAnnotationContext.Provider>
    </TooltipProvider>
  );
}

let restoreRects: () => void;
beforeEach(() => {
  restoreRects = stubRangeRects();
});
afterEach(() => {
  restoreRects();
});

describe("draft annotation marks", () => {
  it("numbers resolved drafts and skips drafts whose text no longer matches", () => {
    render(
      <Harness
        initial={{
          drafts: [
            makeAnnotation({ annotationId: "a" }),
            makeAnnotation({ annotationId: "gone", selectedText: "不存在", prefixContext: "", suffixContext: "" }),
            makeAnnotation({ annotationId: "c", selectedText: "正文", startOffset: 10, endOffset: 12, prefixContext: "第二段的", suffixContext: "" }),
          ],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "批注 1，编辑评论" })).toHaveTextContent("1");
    expect(screen.queryByRole("button", { name: "批注 2，编辑评论" })).toBeNull();
    // 序号跟 Composer 卡片一致：跳过的那条仍占第 2 号。
    expect(screen.getByRole("button", { name: "批注 3，编辑评论" })).toHaveTextContent("3");
  });

  it("draws nothing for replies without drafts", () => {
    render(<Harness initial={{ drafts: [makeAnnotation({ annotationId: "x", assistantMessageId: "v2-9" })] }} />);
    expect(document.querySelector("[data-annotation-mark]")).toBeNull();
  });

  it("opens the comment popover when a mark is clicked", async () => {
    render(<Harness initial={{ drafts: [makeAnnotation({ annotationId: "a", comment: "旧评论" })] }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "批注 1，编辑评论" }));
    const input = screen.getByRole("textbox", { name: "第 1 条批注的评论" });
    expect(input).toHaveValue("旧评论");
    expect(input).toHaveFocus();
  });
});

describe("comment popover", () => {
  it("saves the trimmed comment with Enter and hands focus back", async () => {
    const onClose = vi.fn();
    render(<Harness initial={{ drafts: [makeAnnotation({ annotationId: "a" })], editingAnnotationId: "a" }} onClose={onClose} />);
    const popover = screen.getByRole("dialog", { name: "第 1 条批注的评论" });
    expect(popover).toHaveAttribute("data-anchored", "true");
    await userEvent.type(screen.getByRole("textbox", { name: "第 1 条批注的评论" }), "  说清楚一点  {Enter}");
    expect(current.drafts[0]).toMatchObject({ comment: "说清楚一点" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not submit while an IME composition is active", () => {
    render(<Harness initial={{ drafts: [makeAnnotation({ annotationId: "a" })], editingAnnotationId: "a" }} />);
    const input = screen.getByRole("textbox", { name: "第 1 条批注的评论" });
    fireEvent.change(input, { target: { value: "拼音" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(current.drafts[0]).not.toHaveProperty("comment");
  });

  it("cancels with Escape without changing the comment", () => {
    const onClose = vi.fn();
    const outerKeyDown = vi.fn();
    document.addEventListener("keydown", outerKeyDown);
    render(<Harness initial={{ drafts: [makeAnnotation({ annotationId: "a", comment: "原评论" })], editingAnnotationId: "a" }} onClose={onClose} />);
    const input = screen.getByRole("textbox", { name: "第 1 条批注的评论" });
    fireEvent.change(input, { target: { value: "改了一半" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(current.drafts[0]).toMatchObject({ comment: "原评论" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outerKeyDown).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outerKeyDown);
  });

  it("saves typed text on an outside click without stealing focus", () => {
    const onClose = vi.fn();
    render(<Harness initial={{ drafts: [makeAnnotation({ annotationId: "a" })], editingAnnotationId: "a" }} onClose={onClose} />);
    fireEvent.change(screen.getByRole("textbox", { name: "第 1 条批注的评论" }), { target: { value: "外部保存" } });
    fireEvent.pointerDown(screen.getByRole("button", { name: "回复外部" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(current.drafts[0]).toMatchObject({ comment: "外部保存" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks over-long comments and keeps the original on an outside click", () => {
    render(<Harness initial={{ drafts: [makeAnnotation({ annotationId: "a", comment: "原评论" })], editingAnnotationId: "a" }} />);
    fireEvent.change(screen.getByRole("textbox", { name: "第 1 条批注的评论" }), { target: { value: "长".repeat(2001) } });
    expect(screen.getByRole("alert")).toHaveTextContent("评论超过 2,000 个字符");
    expect(screen.getByRole("button", { name: "保存评论" })).toBeDisabled();
    fireEvent.pointerDown(screen.getByRole("button", { name: "回复外部" }));
    expect(current.drafts[0]).toMatchObject({ comment: "原评论" });
  });

  it("closes when its draft is removed", () => {
    render(<Harness initial={{ drafts: [makeAnnotation({ annotationId: "a" })], editingAnnotationId: "a" }} />);
    act(() => current.setDrafts([]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("annotation highlights", () => {
  let registry: Map<string, { ranges: Range[] }>;
  beforeEach(() => {
    registry = new Map();
    vi.stubGlobal("CSS", { highlights: registry });
    vi.stubGlobal(
      "Highlight",
      class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers drafts normally, moves the active one to the active highlight and cleans up", () => {
    const sent = makeAnnotation({ annotationId: "sent", selectedText: "正文", startOffset: 10, endOffset: 12, prefixContext: "第二段的", suffixContext: "" });
    const { unmount } = render(
      <Harness
        initial={{
          drafts: [makeAnnotation({ annotationId: "a" }), makeAnnotation({ annotationId: "b", selectedText: "第一段", startOffset: 0, endOffset: 3, prefixContext: "", suffixContext: "内容\n" })],
          messages: [{ kind: "user", id: "v2-2", content: "", createdAt: "2026-09-28T00:00:01.000Z", responseAnnotations: [sent] }],
        }}
      />,
    );
    expect(registry.get("act-annotation")?.ranges.map(String)).toEqual(["第二段", "第一段"]);
    expect(registry.has("act-annotation-active")).toBe(false);

    act(() => current.setActive("a"));
    expect(registry.get("act-annotation")?.ranges.map(String)).toEqual(["第一段"]);
    expect(registry.get("act-annotation-active")?.ranges.map(String)).toEqual(["第二段"]);

    // 已发送批注也能加深（悬停用户消息上的卡片条目或定位时）。
    act(() => current.setActive("sent"));
    expect(registry.get("act-annotation")?.ranges).toHaveLength(2);
    expect(registry.get("act-annotation-active")?.ranges.map(String)).toEqual(["正文"]);

    act(() => {
      current.setActive(null);
      current.setDrafts([]);
    });
    expect(registry.has("act-annotation")).toBe(false);
    expect(registry.has("act-annotation-active")).toBe(false);

    act(() => current.setDrafts([makeAnnotation({ annotationId: "a" })]));
    expect(registry.has("act-annotation")).toBe(true);
    unmount();
    expect(registry.size).toBe(0);
  });
});

describe("annotation highlights for late replies", () => {
  let registry: Map<string, { ranges: Range[] }>;
  beforeEach(() => {
    registry = new Map();
    vi.stubGlobal("CSS", { highlights: registry });
    vi.stubGlobal("Highlight", class { ranges: Range[]; constructor(...ranges: Range[]) { this.ranges = ranges; } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers drafts once their reply is rendered after the highlight layer", async () => {
    render(<Harness initial={{ drafts: [makeAnnotation({ annotationId: "a" })], deferReply: true }} />);
    expect(registry.has("act-annotation")).toBe(false);
    act(() => current.showReply());
    await act(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    expect(registry.get("act-annotation")?.ranges.map(String)).toEqual(["第二段"]);
  });
});

describe("isAnnotatableMessageId", () => {
  it("accepts only persisted v2 reply ids", () => {
    expect(isAnnotatableMessageId("v2-12")).toBe(true);
    expect(isAnnotatableMessageId("turn:abc:assistant")).toBe(false);
    expect(isAnnotatableMessageId("v2-")).toBe(false);
  });
});
