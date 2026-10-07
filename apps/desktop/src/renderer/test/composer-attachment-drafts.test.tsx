import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MessageBlock } from "@actspace/shared";
import { Composer, type ComposerDraftRestore } from "../components/Composer";
import { useSessionDrafts } from "../components/composer/composer-context";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";
import { createSessionLocalStore, type SessionLocalStore } from "../session/session-local-store";
import { mockContextSnapshot } from "./fixtures/workbenchFixture";
import { setupBridge } from "./helpers/bridge";
import { TestConversationView } from "./helpers/workbench";

// 16 T14：附件按会话存在 SessionLocalStore 里；图片预览的 blob URL 在发送、移除、evict 时释放。

const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  setupBridge({ "dialogs.getPathForFile": (file: File) => `/Users/test/${file.name}` });
});

afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

function SessionComposer({ store, sessionId, onSend, draftRestore }: { store: SessionLocalStore; sessionId: string; onSend: () => Promise<void>; draftRestore?: ComposerDraftRestore }) {
  const { draftKey, readDraft, writeDraft, readAttachmentDraft, writeAttachmentDraft } = useSessionDrafts(store, sessionId);
  return (
    <TooltipProvider delayDuration={0}>
      <Composer
        contextSnapshot={mockContextSnapshot}
        sessionId={sessionId}
        onSend={onSend}
        onAbort={vi.fn()}
        draftKey={draftKey}
        readDraft={readDraft}
        writeDraft={writeDraft}
        readAttachmentDraft={readAttachmentDraft}
        writeAttachmentDraft={writeAttachmentDraft}
        draftRestore={draftRestore}
      />
    </TooltipProvider>
  );
}

function dropImage(name: string) {
  fireEvent.drop(screen.getByLabelText("消息输入面板"), {
    dataTransfer: { files: [new File(["image"], name, { type: "image/png" })], types: ["Files"] },
  });
}

describe("Composer attachment drafts", () => {
  it("keeps each session's attachments to itself and brings them back when switching back", () => {
    const store = createSessionLocalStore();
    const onSend = vi.fn(async () => {});
    const view = render(<SessionComposer store={store} sessionId="session-a" onSend={onSend} />);
    dropImage("photo.png");
    expect(screen.getByLabelText("已附加的图片 photo.png")).toBeInTheDocument();

    view.rerender(<SessionComposer store={store} sessionId="session-b" onSend={onSend} />);
    expect(screen.queryByLabelText("已附加的图片 photo.png")).toBeNull();
    expect(store.get("session-b").attachments).toBeUndefined();

    view.rerender(<SessionComposer store={store} sessionId="session-a" onSend={onSend} />);
    expect(screen.getByLabelText("已附加的图片 photo.png")).toBeInTheDocument();

    // 离开会话页（卸载 Composer）再回来，附件和预览都还在。
    view.unmount();
    render(<SessionComposer store={store} sessionId="session-a" onSend={onSend} />);
    expect(screen.getByLabelText("已附加的图片 photo.png")).toBeInTheDocument();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("clears the attachments and releases their previews after sending", async () => {
    const store = createSessionLocalStore();
    const onSend = vi.fn(async () => {});
    render(<SessionComposer store={store} sessionId="session-a" onSend={onSend} />);
    dropImage("photo.png");
    expect(store.get("session-a").attachments).toEqual([expect.objectContaining({ name: "photo.png", previewUrl: "blob:photo.png" })]);

    await userEvent.setup().click(screen.getByRole("button", { name: "发送消息" }));
    expect(onSend).toHaveBeenCalledWith("", expect.objectContaining({ attachments: [expect.objectContaining({ name: "photo.png" })] }));
    expect(screen.queryByLabelText("已附加的图片 photo.png")).toBeNull();
    expect(store.get("session-a").attachments).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo.png");
  });

  it("releases the preview when an attachment is removed", async () => {
    const store = createSessionLocalStore();
    render(<SessionComposer store={store} sessionId="session-a" onSend={vi.fn(async () => {})} />);
    dropImage("photo.png");
    await userEvent.setup().click(screen.getByRole("button", { name: "移除 photo.png" }));
    expect(store.get("session-a").attachments).toBeUndefined();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo.png");
  });

  it("releases the replaced previews when a restored draft takes over, keeping the ones it reuses", () => {
    const store = createSessionLocalStore();
    const onSend = vi.fn(async () => {});
    const view = render(<SessionComposer store={store} sessionId="session-a" onSend={onSend} />);
    dropImage("photo.png");
    dropImage("other.png");
    const [photo] = store.get("session-a").attachments!;
    view.rerender(<SessionComposer store={store} sessionId="session-a" onSend={onSend} draftRestore={{ id: 1, sessionId: "session-a", text: "重试", attachments: [photo!] }} />);
    expect(screen.getByLabelText("已附加的图片 photo.png")).toBeInTheDocument();
    expect(screen.queryByLabelText("已附加的图片 other.png")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:other.png");
    expect(store.get("session-a").attachments).toEqual([photo]);
  });

  it("releases the previews of an evicted session's attachments", () => {
    const store = createSessionLocalStore();
    const onSend = vi.fn(async () => {});
    const view = render(<SessionComposer store={store} sessionId="session-a" onSend={onSend} />);
    dropImage("photo.png");
    view.rerender(<SessionComposer store={store} sessionId="session-b" onSend={onSend} />);
    dropImage("other.png");

    act(() => store.evict("session-a"));
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo.png");

    act(() => store.evictWhere((id) => id === "session-b"));
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:other.png");
  });

  it("also releases the previews held by a failed send's restore draft", () => {
    const store = createSessionLocalStore();
    store.update("session-a", (state) => ({
      ...state,
      draft: { id: 1, sessionId: "session-a", text: "", attachments: [{ id: "att", kind: "image", name: "photo.png", previewUrl: "blob:photo.png" }] },
    }));
    store.evict("session-a");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo.png");
  });
});

describe("ConversationView composer mount", () => {
  it("keeps the same Composer when the conversation leaves the blank state", () => {
    const firstMessage: MessageBlock = { kind: "user", id: "user-1", content: "你好", createdAt: "2026-06-02T00:00:00.000Z" };
    const view = (messages: MessageBlock[]) => (
      <TooltipProvider delayDuration={0}>
        <RightPanelProvider>
          <TestConversationView messages={messages} contextSnapshot={null} sessionId="session-1" isSessionReady />
        </RightPanelProvider>
      </TooltipProvider>
    );
    const rendered = render(view([]));
    const input = screen.getByLabelText("消息输入框");
    expect(rendered.container.querySelector(".composer-panel-initial")).not.toBeNull();
    input.focus();

    rendered.rerender(view([firstMessage]));
    expect(screen.getByLabelText("消息输入框")).toBe(input);
    expect(input).toHaveFocus();
    expect(rendered.container.querySelector(".composer-panel-initial")).toBeNull();
    expect(screen.getAllByLabelText("消息输入框")).toHaveLength(1);
  });
});
