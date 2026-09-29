import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock, ResponseAnnotationReference } from "@actspace/shared";
import type { ComposerDraftRestore } from "../components/Composer";
import { useResponseAnnotationState } from "../components/messages/useResponseAnnotationState";
import { makeAnnotation } from "./fixtures/response-annotation-helpers";

const REPLY: MessageBlock = { kind: "assistant", id: "v2-1", content: "第一段内容\n\n第二段的正文", createdAt: "2026-09-28T00:00:00.000Z" };

function setup(initial: { draftKey?: string; messages?: MessageBlock[]; draftRestore?: ComposerDraftRestore | null } = {}) {
  const store = new Map<string, ResponseAnnotationReference[]>();
  const readAnnotationDraft = vi.fn((key: string) => store.get(key) ?? []);
  const writeAnnotationDraft = vi.fn((key: string, list: readonly ResponseAnnotationReference[]) => { store.set(key, [...list]); });
  const scrollContainerRef = { current: null as HTMLElement | null };
  const hook = renderHook(
    (props: { draftKey?: string; messages: MessageBlock[]; draftRestore?: ComposerDraftRestore | null }) => useResponseAnnotationState({ ...props, readAnnotationDraft, writeAnnotationDraft, scrollContainerRef }),
    { initialProps: { draftKey: initial.draftKey ?? "s1", messages: initial.messages ?? [REPLY], draftRestore: initial.draftRestore ?? null } },
  );
  return { ...hook, store, writeAnnotationDraft, scrollContainerRef };
}

describe("useResponseAnnotationState", () => {
  it("adds drafts, dedupes the same range and writes them back per draft key", () => {
    const { result, store } = setup();
    act(() => result.current.contextValue.onAddAnnotation(makeAnnotation({ annotationId: "a" })));
    act(() => result.current.contextValue.onAddAnnotation(makeAnnotation({ annotationId: "dup" })));
    expect(result.current.drafts.map((item) => item.annotationId)).toEqual(["a"]);
    expect(store.get("s1")?.map((item) => item.annotationId)).toEqual(["a"]);
  });

  it("stops at 20 drafts with a notice and clears the notice on the next change", () => {
    const { result } = setup();
    act(() => {
      for (let index = 0; index < 21; index += 1) {
        result.current.contextValue.onAddAnnotation(makeAnnotation({ annotationId: `a${index}`, startOffset: index, endOffset: index + 1 }));
      }
    });
    expect(result.current.drafts).toHaveLength(20);
    expect(result.current.notice).toBe("最多引用 20 段回复");
    act(() => result.current.setDrafts(result.current.drafts.slice(1)));
    expect(result.current.notice).toBeNull();
  });

  it("copies a sent annotation into the draft with a fresh id and asks the tray to edit it", () => {
    const { result } = setup();
    const sent = makeAnnotation({ annotationId: "sent", comment: "原评论" });
    act(() => result.current.contextValue.onCopyToDraft(sent));
    const [copy] = result.current.drafts;
    expect(copy).toMatchObject({ comment: "原评论", selectedText: "第二段" });
    expect(copy!.annotationId).not.toBe("sent");
    expect(result.current.editRequest?.annotationId).toBe(copy!.annotationId);
  });

  it("switches drafts with the draft key and restores rejected drafts for the matching session", () => {
    const { result, rerender } = setup();
    act(() => result.current.contextValue.onAddAnnotation(makeAnnotation({ annotationId: "a" })));
    rerender({ draftKey: "s2", messages: [REPLY], draftRestore: null });
    expect(result.current.drafts).toEqual([]);
    rerender({ draftKey: "s1", messages: [REPLY], draftRestore: null });
    expect(result.current.drafts.map((item) => item.annotationId)).toEqual(["a"]);

    act(() => result.current.setDrafts([]));
    const restored = makeAnnotation({ annotationId: "restored" });
    rerender({ draftKey: "s1", messages: [REPLY], draftRestore: { id: 1, sessionId: "other", text: "", responseAnnotations: [restored] } });
    expect(result.current.drafts).toEqual([]);
    rerender({ draftKey: "s1", messages: [REPLY], draftRestore: { id: 2, sessionId: "s1", text: "", responseAnnotations: [restored] } });
    expect(result.current.drafts.map((item) => item.annotationId)).toEqual(["restored"]);
  });

  it("reports availability from loaded replies and resolution results", () => {
    const { result } = setup();
    const loaded = makeAnnotation({ annotationId: "loaded" });
    const missing = makeAnnotation({ annotationId: "missing", assistantMessageId: "v2-99" });
    expect(result.current.contextValue.isAnnotationAvailable(loaded)).toBe(true);
    expect(result.current.contextValue.isAnnotationAvailable(missing)).toBe(false);
    act(() => result.current.contextValue.reportResolution("loaded", false));
    expect(result.current.contextValue.isAnnotationAvailable(loaded)).toBe(false);
    act(() => result.current.contextValue.reportResolution("loaded", true));
    expect(result.current.contextValue.isAnnotationAvailable(loaded)).toBe(true);
  });

  it("locates a reply by scrolling it into view and activating the annotation", () => {
    const { result, scrollContainerRef } = setup();
    const container = document.createElement("section");
    const reply = document.createElement("article");
    reply.dataset.assistantMessageId = "v2-1";
    reply.scrollIntoView = vi.fn();
    container.append(reply);
    scrollContainerRef.current = container;
    act(() => result.current.contextValue.locateAnnotation(makeAnnotation({ annotationId: "loc" })));
    expect(reply.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(result.current.contextValue.activeAnnotationId).toBe("loc");
  });
});
