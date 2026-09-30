import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock, ResponseAnnotationReference } from "@actspace/shared";
import { AssistantReply } from "../components/messages/AssistantReply";
import {
  ResponseAnnotationContext,
  indexSentAnnotations,
  isAnnotatableMessageId,
  reuseUnchangedAnnotationLists,
  type ResponseAnnotationContextValue,
} from "../components/messages/response-annotation-context";
import { makeAnnotation, stubRangeRects } from "./fixtures/response-annotation-helpers";

const REPLY: Extract<MessageBlock, { kind: "assistant" }> = {
  kind: "assistant",
  id: "v2-1",
  content: "第一段内容\n\n第二段的正文",
  createdAt: "2026-09-28T00:00:00.000Z",
};

function userMessageWith(annotations: ResponseAnnotationReference[], id = "v2-2"): MessageBlock {
  return { kind: "user", id, content: "", createdAt: "2026-09-28T00:00:01.000Z", responseAnnotations: annotations };
}

type Spies = Pick<ResponseAnnotationContextValue, "reportResolution" | "onCopyToDraft">;

function Harness({ annotations, spies }: { annotations: ResponseAnnotationReference[]; spies: Spies }) {
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const value: ResponseAnnotationContextValue = {
    sentByMessageId: indexSentAnnotations([userMessageWith(annotations)]),
    canAnnotate: isAnnotatableMessageId,
    onAddAnnotation: vi.fn(),
    onCopyToDraft: spies.onCopyToDraft,
    activeAnnotationId,
    setActiveAnnotationId,
    reportResolution: spies.reportResolution,
    isAnnotationAvailable: () => true,
    locateAnnotation: vi.fn(),
  };
  return (
    <ResponseAnnotationContext.Provider value={value}>
      <AssistantReply message={REPLY} />
      <button type="button">回复外部</button>
    </ResponseAnnotationContext.Provider>
  );
}

function setup(annotations: ResponseAnnotationReference[]) {
  const spies = { reportResolution: vi.fn(), onCopyToDraft: vi.fn() };
  render(<Harness annotations={annotations} spies={spies} />);
  return spies;
}

let restoreRects: () => void;
beforeEach(() => {
  restoreRects = stubRangeRects();
});
afterEach(() => {
  restoreRects();
  Reflect.deleteProperty(globalThis, "Highlight");
  Reflect.deleteProperty(CSS, "highlights");
});

describe("ResponseAnnotationMarkers", () => {
  it("draws a numbered marker for a resolvable annotation and reports resolution", () => {
    const spies = setup([makeAnnotation()]);
    const marker = screen.getByRole("button", { name: "回复批注 1" });
    expect(marker).toHaveTextContent("1");
    expect(marker).toHaveAttribute("aria-pressed", "false");
    expect(spies.reportResolution).toHaveBeenCalledWith("ann_fixture_1", true);
  });

  it("does not draw an annotation that no longer resolves and reports it as unresolved", () => {
    const spies = setup([
      makeAnnotation(),
      makeAnnotation({ annotationId: "ann_gone", selectedText: "不存在的原文", startOffset: 0, endOffset: 6, prefixContext: "", suffixContext: "" }),
    ]);
    expect(screen.getAllByRole("button", { name: /^回复批注/ })).toHaveLength(1);
    expect(spies.reportResolution).toHaveBeenCalledWith("ann_gone", false);
  });

  it("caps markers per reply at 20", () => {
    const many = Array.from({ length: 22 }, (_, index) => makeAnnotation({ annotationId: `ann_${index}` }));
    setup(many);
    expect(screen.getAllByRole("button", { name: /^回复批注/ })).toHaveLength(20);
  });

  it("lines markers on the same line up side by side instead of covering the next line", () => {
    setup([makeAnnotation(), makeAnnotation({ annotationId: "ann_same_line" })]);
    const [a, b] = screen.getAllByRole("button", { name: /^回复批注/ });
    expect(b!.style.top).toBe(a!.style.top);
    expect(parseFloat(b!.style.left) - parseFloat(a!.style.left)).toBeGreaterThanOrEqual(20);
  });

  it("keeps markers inside the content box and stacks them down along the right edge", () => {
    const layerWidth = 230;
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      return (this.hasAttribute("data-annotation-exclude") ? { top: 0, left: 0, width: layerWidth, height: 400, right: layerWidth, bottom: 400, x: 0, y: 0 } : original.call(this)) as DOMRect;
    };
    try {
      setup([makeAnnotation(), makeAnnotation({ annotationId: "ann_same_line" })]);
      const [a, b] = screen.getAllByRole("button", { name: /^回复批注/ });
      // 选区右缘 220 + 2 已贴近 230 - 16 = 214：两个都夹到 214，第二个向下排开。
      expect(a!.style.left).toBe("214px");
      expect(b!.style.left).toBe("214px");
      expect(parseFloat(b!.style.top) - parseFloat(a!.style.top)).toBe(20);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  it("places the marker at the end of the selection's last line", () => {
    const tail = { top: 200, left: 220, width: 80, height: 18 };
    restoreRects();
    const proto = Range.prototype as unknown as Record<string, unknown>;
    const originalRects = proto.getClientRects;
    const originalBounding = proto.getBoundingClientRect;
    const toRect = (rect: typeof tail) => ({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height }) as DOMRect;
    // 选区本身在 100..220，同一行后面还有文字到 300；marker 应放在 300 之后。
    proto.getClientRects = function (this: Range) {
      return [this.toString() === "第二段" ? toRect({ ...tail, left: 100, width: 120 }) : toRect(tail)];
    };
    proto.getBoundingClientRect = () => toRect({ top: 0, left: 0, width: 0, height: 0 });
    restoreRects = () => { proto.getClientRects = originalRects; proto.getBoundingClientRect = originalBounding; };
    setup([makeAnnotation()]);
    expect(screen.getByRole("button", { name: "回复批注 1" }).style.left).toBe("302px");
  });

  it("previews selected text and comment as plain text and copies to the draft", async () => {
    const spies = setup([makeAnnotation({ comment: "<img src=x onerror=alert(1)>" })]);
    const marker = screen.getByRole("button", { name: "回复批注 1" });
    await userEvent.click(marker);
    const card = await screen.findByRole("dialog", { name: "回复批注 1" });
    expect(within(card).getByText("第二段")).toBeVisible();
    expect(within(card).getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(card.querySelector("img")).toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: "复制到草稿" }));
    expect(spies.onCopyToDraft).toHaveBeenCalledWith(expect.objectContaining({ annotationId: "ann_fixture_1" }));
  });

  it("omits the comment section when there is no comment", async () => {
    setup([makeAnnotation()]);
    await userEvent.click(screen.getByRole("button", { name: "回复批注 1" }));
    const card = await screen.findByRole("dialog", { name: "回复批注 1" });
    expect(within(card).queryByText("用户评论")).toBeNull();
  });

  it("moves keyboard focus into the card with Tab and returns it with Escape", async () => {
    setup([makeAnnotation()]);
    const marker = screen.getByRole("button", { name: "回复批注 1" });
    await userEvent.click(marker);
    const card = await screen.findByRole("dialog", { name: "回复批注 1" });
    fireEvent.keyDown(marker, { key: "Tab" });
    expect(within(card).getByRole("button", { name: "复制到草稿" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(marker).toHaveFocus());
    // Wait beyond HoverCard's delayed focus-open, not just its immediate dismissal.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    expect(screen.queryByRole("dialog", { name: "回复批注 1" })).toBeNull();
    await userEvent.click(marker);
    expect(await screen.findByRole("dialog", { name: "回复批注 1" })).toBeVisible();
  });

  it.each(["focus", "pointer"])("allows a new %s interaction after Escape dismissal", async (interaction) => {
    setup([makeAnnotation()]);
    const marker = screen.getByRole("button", { name: "回复批注 1" });
    await userEvent.click(marker);
    expect(await screen.findByRole("dialog", { name: "回复批注 1" })).toBeVisible();
    fireEvent.keyDown(marker, { key: "Tab" });
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    expect(screen.queryByRole("dialog", { name: "回复批注 1" })).toBeNull();
    if (interaction === "focus") {
      act(() => { screen.getByRole("button", { name: "回复外部" }).focus(); marker.focus(); });
    } else {
      fireEvent.pointerLeave(marker, { pointerType: "mouse" });
      fireEvent.pointerEnter(marker, { pointerType: "mouse" });
    }
    expect(await screen.findByRole("dialog", { name: "回复批注 1" })).toBeVisible();
  });

  it("highlights the active annotation with the Custom Highlight API and clears it outside or on Escape", async () => {
    const registry = new Map<string, unknown>();
    class HighlightStub { ranges: Range[]; constructor(...ranges: Range[]) { this.ranges = ranges; } }
    Object.defineProperty(globalThis, "Highlight", { configurable: true, value: HighlightStub });
    Object.defineProperty(CSS, "highlights", { configurable: true, value: registry });
    setup([makeAnnotation()]);
    const marker = screen.getByRole("button", { name: "回复批注 1" });

    await userEvent.click(marker);
    expect(marker).toHaveAttribute("aria-pressed", "true");
    const highlight = registry.get("act-annotation") as HighlightStub;
    expect(highlight.ranges[0]!.toString()).toBe("第二段");

    fireEvent.pointerDown(screen.getByRole("button", { name: "回复外部" }));
    expect(marker).toHaveAttribute("aria-pressed", "false");
    expect(registry.has("act-annotation")).toBe(false);

    await userEvent.click(marker);
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(marker).toHaveAttribute("aria-pressed", "false");
  });

  it("does not throw when the Custom Highlight API is unavailable", async () => {
    setup([makeAnnotation()]);
    const marker = screen.getByRole("button", { name: "回复批注 1" });
    await userEvent.click(marker);
    expect(marker).toHaveAttribute("aria-pressed", "true");
  });
});

describe("sent annotation index", () => {
  it("numbers annotations per reply in user-message order", () => {
    const index = indexSentAnnotations([
      userMessageWith([makeAnnotation({ annotationId: "a" }), makeAnnotation({ annotationId: "b", assistantMessageId: "v2-9" })], "v2-2"),
      userMessageWith([makeAnnotation({ annotationId: "c" })], "v2-5"),
    ]);
    expect(index.get("v2-1")!.map((item) => [item.annotation.annotationId, item.label, item.sourceUserMessageId])).toEqual([["a", 1, "v2-2"], ["c", 2, "v2-5"]]);
    expect(index.get("v2-9")!.map((item) => item.label)).toEqual([1]);
  });

  it("keeps list identity for replies whose annotations did not change", () => {
    const messages = [userMessageWith([makeAnnotation({ annotationId: "a" })])];
    const before = reuseUnchangedAnnotationLists(new Map(), indexSentAnnotations(messages));
    const rebuilt = reuseUnchangedAnnotationLists(before, indexSentAnnotations(structuredClone(messages)));
    expect(rebuilt.get("v2-1")).toBe(before.get("v2-1"));
    const changed = reuseUnchangedAnnotationLists(before, indexSentAnnotations([...messages, userMessageWith([makeAnnotation({ annotationId: "b" })], "v2-4")]));
    expect(changed.get("v2-1")).not.toBe(before.get("v2-1"));
  });

  it("only accepts persisted reply ids", () => {
    expect(isAnnotatableMessageId("v2-12")).toBe(true);
    expect(isAnnotatableMessageId("turn:run-1:assistant:0")).toBe(false);
    expect(isAnnotatableMessageId("v2-")).toBe(false);
  });
});
