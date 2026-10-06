import { useRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock, ResponseAnnotationReference } from "@actspace/shared";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { ResponseSelectionMenu } from "../components/messages/ResponseSelectionMenu";
import { annotatableMessageIds } from "../components/messages/response-annotation-context";
import { clearSelection, selectText, stubRangeRects } from "./fixtures/response-annotation-helpers";

function Reply({ id, content }: { id: string; content: string }) {
  return (
    <article data-assistant-message-id={id} data-testid={id}>
      <div data-annotation-root>
        <MarkdownProse content={content} />
      </div>
    </article>
  );
}

type ReplyFixture = { id: string; content: string; live?: boolean };

function Harness({ onAddAnnotation, replies }: { onAddAnnotation: (annotation: ResponseAnnotationReference) => void; replies: ReplyFixture[] }) {
  const scrollRef = useRef<HTMLElement | null>(null);
  // 和 ConversationView 一样按块判断：durable 回复带 sourceSeq，live 回复没有。
  const blocks: MessageBlock[] = replies.map((reply, index) => ({ kind: "assistant", id: reply.id, content: reply.content, createdAt: "2026-10-06T00:00:00.000Z", ...(reply.live ? {} : { sourceSeq: index }) }));
  const annotatable = annotatableMessageIds(blocks);
  return (
    <section ref={scrollRef} data-testid="scroller">
      {replies.map((reply) => <Reply key={reply.id} {...reply} />)}
      <ResponseSelectionMenu scrollContainerRef={scrollRef} canAnnotate={(id) => annotatable.has(id)} onAddAnnotation={onAddAnnotation} />
    </section>
  );
}

const REPLIES = [
  { id: "v2-3", content: "第一段内容\n\n第二段的正文\n\n```ts\nconst code = 1;\n```" },
  { id: "v2-7", content: "另一条回复" },
];

let restoreRects: () => void;
beforeEach(() => {
  restoreRects = stubRangeRects();
});
afterEach(() => {
  clearSelection();
  restoreRects();
});

function setup(replies = REPLIES) {
  const onAddAnnotation = vi.fn();
  render(<Harness onAddAnnotation={onAddAnnotation} replies={replies} />);
  return { onAddAnnotation };
}

describe("ResponseSelectionMenu", () => {
  it("offers 添加到对话 for a persisted reply and adds the draft with visible-text offsets", async () => {
    const { onAddAnnotation } = setup();
    selectText(screen.getByTestId("v2-3"), "第二段");
    const add = await screen.findByRole("menuitem", { name: "添加到对话" });
    expect(screen.getByRole("menu", { name: "回复选区操作" })).toHaveAttribute("data-placement", "below");

    await userEvent.click(add);
    expect(onAddAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      assistantMessageId: "v2-3",
      selectedText: "第二段",
      startOffset: 6,
      endOffset: 9,
      prefixContext: "第一段内容\n",
      suffixContext: "的正文",
    }));
    expect(document.getSelection()?.rangeCount).toBe(0);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps the native selection when the menu item is pressed", async () => {
    setup();
    selectText(screen.getByTestId("v2-3"), "第二段");
    const add = await screen.findByRole("menuitem", { name: "添加到对话" });
    const pressed = fireEvent.mouseDown(add);
    expect(pressed).toBe(false);
  });

  it.each([
    ["a streaming reply that has no durable sourceSeq yet", [{ id: "turn:run-1:assistant:0", content: "流式中的回复", live: true }], "流式中的回复"],
  ])("does not offer the menu for %s", async (_name, replies, text) => {
    setup(replies);
    selectText(screen.getByTestId(replies[0]!.id), text);
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not offer the menu for a selection that spans two replies", async () => {
    setup();
    selectText(screen.getByTestId("v2-3"), "第二段", "另一条", screen.getByTestId("v2-7"));
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not offer the menu for a selection inside a code block", async () => {
    setup();
    // 代码块被语法高亮拆成多个 token，选中其中一个 token 即可。
    selectText(screen.getByTestId("v2-3").querySelector("pre")!, "code");
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not offer the menu when the selection exceeds the selected-text limit", async () => {
    setup([{ id: "v2-9", content: `${"长".repeat(8001)}尾` }]);
    selectText(screen.getByTestId("v2-9"), "长", "尾");
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape, on scroll and when the selection collapses", async () => {
    setup();
    const reply = screen.getByTestId("v2-3");
    selectText(reply, "第二段");
    await screen.findByRole("menu");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    selectText(reply, "第一段");
    await screen.findByRole("menu");
    fireEvent.scroll(screen.getByTestId("scroller"));
    expect(screen.queryByRole("menu")).toBeNull();

    selectText(reply, "第一段");
    await screen.findByRole("menu");
    clearSelection();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("anchors to the end of the selection and flips above when there is no room below", async () => {
    restoreRects();
    restoreRects = stubRangeRects({ top: 740, left: -200, width: 40, height: 18 });
    setup();
    selectText(screen.getByTestId("v2-3"), "第二段");
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("data-placement", "above");
    expect(menu.style.left).toBe("12px");
  });

  it("waits until the drag ends before offering the menu", async () => {
    setup();
    const reply = screen.getByTestId("v2-3");
    fireEvent.pointerDown(reply);
    selectText(reply, "第二段");
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.pointerUp(reply);
    expect(await screen.findByRole("menuitem", { name: "添加到对话" })).toBeInTheDocument();
  });
});
