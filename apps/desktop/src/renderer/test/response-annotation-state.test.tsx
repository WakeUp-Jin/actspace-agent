import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResponseAnnotationReference } from "@actspace/shared";
import type { ComposerDraftRestore } from "../components/Composer";
import { useResponseAnnotationState } from "../components/messages/useResponseAnnotationState";
import { makeAnnotation } from "./fixtures/response-annotation-helpers";

function setup(initial: { draftKey?: string; draftRestore?: ComposerDraftRestore | null } = {}) {
  const store = new Map<string, ResponseAnnotationReference[]>();
  const readAnnotationDraft = vi.fn((key: string) => store.get(key) ?? []);
  const writeAnnotationDraft = vi.fn((key: string, list: readonly ResponseAnnotationReference[]) => { store.set(key, [...list]); });
  const scrollContainerRef = { current: null as HTMLElement | null };
  const hook = renderHook(
    (props: { draftKey?: string; draftRestore?: ComposerDraftRestore | null }) => useResponseAnnotationState({ ...props, readAnnotationDraft, writeAnnotationDraft, scrollContainerRef, canAnnotate: () => true }),
    { initialProps: { draftKey: initial.draftKey ?? "s1", draftRestore: initial.draftRestore ?? null } },
  );
  return { ...hook, store, writeAnnotationDraft, scrollContainerRef };
}

/** 和 AssistantReply 同结构的回复 DOM：可批注文本是「第一段内容\n第二段的正文」。 */
function mountReply(scrollContainerRef: { current: HTMLElement | null }) {
  const container = document.createElement("section");
  container.innerHTML = '<article data-assistant-message-id="v2-1"><div data-annotation-root><p>第一段内容</p><p>第二段的正文</p></div></article>';
  document.body.append(container);
  scrollContainerRef.current = container;
  const paragraph = container.querySelectorAll("p")[1]!;
  paragraph.scrollIntoView = vi.fn();
  return { container, paragraph };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("useResponseAnnotationState", () => {
  it("adds drafts, dedupes the same range, opens the comment editor and writes them back per draft key", () => {
    const { result, store } = setup();
    act(() => result.current.contextValue.addDraft(makeAnnotation({ annotationId: "a" })));
    expect(result.current.contextValue.editingAnnotationId).toBe("a");
    act(() => result.current.contextValue.setEditingAnnotationId(null));
    act(() => result.current.contextValue.addDraft(makeAnnotation({ annotationId: "dup" })));
    expect(result.current.drafts.map((item) => item.annotationId)).toEqual(["a"]);
    // 重复添加同一段：打开已有那条的评论框。
    expect(result.current.contextValue.editingAnnotationId).toBe("a");
    expect(store.get("s1")?.map((item) => item.annotationId)).toEqual(["a"]);
  });

  it("stops at 20 drafts with a notice and clears the notice on the next change", () => {
    const { result } = setup();
    act(() => {
      for (let index = 0; index < 21; index += 1) {
        result.current.contextValue.addDraft(makeAnnotation({ annotationId: `a${index}`, startOffset: index, endOffset: index + 1 }));
      }
    });
    expect(result.current.drafts).toHaveLength(20);
    expect(result.current.notice).toBe("最多引用 20 段回复");
    act(() => result.current.setDrafts(result.current.drafts.slice(1)));
    expect(result.current.notice).toBeNull();
  });

  it("updates and clears comments, and removing a draft clears its editing and active state", () => {
    const { result } = setup();
    act(() => result.current.contextValue.addDraft(makeAnnotation({ annotationId: "a" })));
    act(() => result.current.contextValue.updateComment("a", "说清楚一点"));
    expect(result.current.drafts[0]).toMatchObject({ comment: "说清楚一点" });
    act(() => result.current.contextValue.updateComment("a", ""));
    expect(result.current.drafts[0]).not.toHaveProperty("comment");

    act(() => result.current.contextValue.setActiveAnnotationId("a"));
    act(() => result.current.contextValue.removeDraft("a"));
    expect(result.current.drafts).toEqual([]);
    expect(result.current.contextValue.editingAnnotationId).toBeNull();
    expect(result.current.contextValue.activeAnnotationId).toBeNull();
  });

  it("switches drafts with the draft key and restores rejected drafts for the matching session", () => {
    const { result, rerender } = setup();
    act(() => result.current.contextValue.addDraft(makeAnnotation({ annotationId: "a" })));
    rerender({ draftKey: "s2", draftRestore: null });
    expect(result.current.drafts).toEqual([]);
    expect(result.current.contextValue.editingAnnotationId).toBeNull();
    rerender({ draftKey: "s1", draftRestore: null });
    expect(result.current.drafts.map((item) => item.annotationId)).toEqual(["a"]);

    act(() => result.current.setDrafts([]));
    const restored = makeAnnotation({ annotationId: "restored" });
    rerender({ draftKey: "s1", draftRestore: { id: 1, sessionId: "other", text: "", responseAnnotations: [restored] } });
    expect(result.current.drafts).toEqual([]);
    rerender({ draftKey: "s1", draftRestore: { id: 2, sessionId: "s1", text: "", responseAnnotations: [restored] } });
    expect(result.current.drafts.map((item) => item.annotationId)).toEqual(["restored"]);
  });

  it("resolves ranges only for rendered replies whose text still matches", () => {
    const { result, scrollContainerRef } = setup();
    mountReply(scrollContainerRef);
    expect(result.current.contextValue.resolveRange(makeAnnotation())?.toString()).toBe("第二段");
    expect(result.current.contextValue.resolveRange(makeAnnotation({ assistantMessageId: "v2-99" }))).toBeNull();
    expect(result.current.contextValue.resolveRange(makeAnnotation({ selectedText: "不存在", prefixContext: "", suffixContext: "" }))).toBeNull();
  });

  it("locates an annotation by scrolling to its text and highlighting it briefly", () => {
    vi.useFakeTimers();
    const { result, scrollContainerRef } = setup();
    const { paragraph } = mountReply(scrollContainerRef);
    act(() => result.current.contextValue.locateAnnotation(makeAnnotation({ annotationId: "loc" })));
    expect(paragraph.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(result.current.contextValue.activeAnnotationId).toBe("loc");
    act(() => { vi.advanceTimersByTime(1600); });
    expect(result.current.contextValue.activeAnnotationId).toBeNull();
  });

  it("edits a draft by scrolling to its text and then opening the comment editor", () => {
    vi.useFakeTimers();
    const { result, scrollContainerRef } = setup();
    const { paragraph } = mountReply(scrollContainerRef);
    act(() => result.current.contextValue.addDraft(makeAnnotation({ annotationId: "a" })));
    act(() => result.current.contextValue.setEditingAnnotationId(null));
    act(() => result.current.contextValue.editAnnotation("a"));
    expect(paragraph.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
    act(() => { vi.advanceTimersByTime(20); });
    expect(result.current.contextValue.editingAnnotationId).toBe("a");
  });
});
