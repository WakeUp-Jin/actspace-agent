import { useRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResponseAnnotationReference } from "@actspace/shared";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { ResponseSelectionToolbar } from "../components/messages/ResponseSelectionToolbar";
import { isAnnotatableMessageId } from "../components/messages/response-annotation-context";
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

function Harness({ onAddAnnotation, replies }: { onAddAnnotation: (annotation: ResponseAnnotationReference) => void; replies: { id: string; content: string }[] }) {
  const scrollRef = useRef<HTMLElement | null>(null);
  return (
    <section ref={scrollRef} data-testid="scroller">
      {replies.map((reply) => <Reply key={reply.id} {...reply} />)}
      <ResponseSelectionToolbar scrollContainerRef={scrollRef} canAnnotate={isAnnotatableMessageId} onAddAnnotation={onAddAnnotation} />
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

describe("ResponseSelectionToolbar", () => {
  it("offers 添加到对话 for a persisted reply and adds the draft with visible-text offsets", async () => {
    const { onAddAnnotation } = setup();
    selectText(screen.getByTestId("v2-3"), "第二段");
    const add = await screen.findByRole("button", { name: "添加到对话" });
    expect(screen.getByRole("toolbar", { name: "回复选区操作" })).toHaveAttribute("data-placement", "above");

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
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("keeps the native selection when the toolbar button is pressed", async () => {
    setup();
    selectText(screen.getByTestId("v2-3"), "第二段");
    const add = await screen.findByRole("button", { name: "添加到对话" });
    const pressed = fireEvent.mouseDown(add);
    expect(pressed).toBe(false);
  });

  it.each([
    ["a streaming reply whose id is still turn-scoped", [{ id: "turn:run-1:assistant:0", content: "流式中的回复" }], "流式中的回复"],
  ])("does not offer the toolbar for %s", async (_name, replies, text) => {
    setup(replies);
    selectText(screen.getByTestId(replies[0]!.id), text);
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("does not offer the toolbar for a selection that spans two replies", async () => {
    setup();
    selectText(screen.getByTestId("v2-3"), "第二段", "另一条", screen.getByTestId("v2-7"));
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("does not offer the toolbar for a selection inside a code block", async () => {
    setup();
    // 代码块被语法高亮拆成多个 token，选中其中一个 token 即可。
    selectText(screen.getByTestId("v2-3").querySelector("pre")!, "code");
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("does not offer the toolbar when the selection exceeds the selected-text limit", async () => {
    setup([{ id: "v2-9", content: `${"长".repeat(8001)}尾` }]);
    selectText(screen.getByTestId("v2-9"), "长", "尾");
    await act(async () => { await new Promise((resolve) => window.requestAnimationFrame(resolve)); });
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("closes on Escape, on scroll and when the selection collapses", async () => {
    setup();
    const reply = screen.getByTestId("v2-3");
    selectText(reply, "第二段");
    await screen.findByRole("toolbar");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("toolbar")).toBeNull();

    selectText(reply, "第一段");
    await screen.findByRole("toolbar");
    fireEvent.scroll(screen.getByTestId("scroller"));
    expect(screen.queryByRole("toolbar")).toBeNull();

    selectText(reply, "第一段");
    await screen.findByRole("toolbar");
    clearSelection();
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  it("flips below the selection when there is no room above", async () => {
    restoreRects();
    restoreRects = stubRangeRects({ top: 4, left: -40, width: 40, height: 18 });
    setup();
    selectText(screen.getByTestId("v2-3"), "第二段");
    const toolbar = await screen.findByRole("toolbar");
    expect(toolbar).toHaveAttribute("data-placement", "below");
    expect(toolbar.style.left).toBe("12px");
  });
});
