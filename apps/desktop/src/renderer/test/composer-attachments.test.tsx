import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { useComposerAttachments, type ComposerAttachmentsOptions } from "../components/composer/ComposerAttachments";
import { setupBridge } from "./helpers/bridge";

function renderAttachments(overrides: Partial<ComposerAttachmentsOptions> = {}) {
  return renderHook(() => useComposerAttachments({
    isChatForm: false,
    isRemoteTarget: false,
    inputLocked: false,
    onBeforePick: () => {},
    onRemoved: () => {},
    ...overrides,
  }));
}

function dropEvent(files: File[]) {
  return {
    preventDefault: () => {},
    stopPropagation: () => {},
    dataTransfer: { files, types: ["Files"] },
  } as unknown as DragEvent<HTMLElement>;
}

describe("useComposerAttachments", () => {
  it("drops the same file only once", () => {
    const { result } = renderAttachments();

    act(() => result.current.dropTarget.onDrop(dropEvent([new File(["a"], "notes.md")])));
    act(() => result.current.dropTarget.onDrop(dropEvent([new File(["a"], "notes.md")])));

    expect(result.current.attachments.map((attachment) => attachment.name)).toEqual(["notes.md"]);
  });

  it("ignores drops while the input is locked", () => {
    const { result } = renderAttachments({ inputLocked: true });

    act(() => result.current.dropTarget.onDrop(dropEvent([new File(["a"], "notes.md")])));

    expect(result.current.attachments).toEqual([]);
  });

  it("rejects the whole drop in Chat when one file type is unsupported", () => {
    const { result } = renderAttachments({ isChatForm: true });

    act(() => result.current.dropTarget.onDrop(dropEvent([new File(["a"], "notes.md"), new File(["b"], "app.zip")])));

    expect(result.current.attachments).toEqual([]);
    expect(result.current.error).toBe("Chat 仅支持图片、TXT、Markdown、JSON 和 CSV 文件。");
  });

  it("asks the remote file picker when the run target is remote", async () => {
    const selectFiles = vi.fn(async () => ({ canceled: true, attachments: [] }));
    setupBridge({ "dialogs.selectFiles": selectFiles });
    const { result } = renderAttachments({ isRemoteTarget: true });

    await act(() => result.current.selectFiles());

    expect(selectFiles).toHaveBeenCalledWith({ remote: true });
  });
});
