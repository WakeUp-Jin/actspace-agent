import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import type { TaskSnapshot } from "@actspace/shared/runtime-v2";
import { TestConversationView, type TestConversationViewProps } from "./helpers/workbench";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";
import { preparedAttachments, turnPromptDraft } from "../components/conversation/turn-prompt-draft";
import type { TurnResend } from "../session/active-session-context";

// 编辑提问重发（agent-edit-resend-rewind.md §5.1–5.3、§7）。

const at = "2026-11-07T00:00:00.000Z";
function turns(count: number): MessageBlock[] {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return [
      { kind: "user" as const, id: `v2-${n * 10}`, renderKey: `turn:run-${n}:user:0`, runId: `run-${n}`, sourceSeq: n * 10, content: `第 ${n} 轮提问`, createdAt: at },
      { kind: "assistant" as const, id: `v2-${n * 10 + 1}`, renderKey: `turn:run-${n}:assistant:0`, runId: `run-${n}`, sourceSeq: n * 10 + 1, content: `第 ${n} 轮回复`, createdAt: at },
    ];
  }).flat();
}

function renderConversation(props: TestConversationViewProps) {
  return render(
    <TooltipProvider delayDuration={0}>
      <RightPanelProvider>
        <TestConversationView contextSnapshot={null} sessionId="session-1" {...props} />
      </RightPanelProvider>
    </TooltipProvider>,
  );
}

const card = (text: string) => screen.getByText(text).closest(".turn-prompt-card") as HTMLElement;
const turnOf = (text: string) => screen.getByText(text).closest("[data-conversation-turn-id]") as HTMLElement;

describe("editing a prompt in the message flow", () => {
  afterEach(() => vi.useRealTimers());

  it("turns the clicked card into an editor and dims everything below it; Esc and an outside click cancel", async () => {
    const user = userEvent.setup();
    renderConversation({ messages: turns(3), onResendTurn: vi.fn() });
    expect(card("第 2 轮提问")).toHaveAttribute("data-editable", "true");
    await user.click(screen.getByText("第 2 轮提问"));
    const input = screen.getByRole("textbox", { name: "编辑提问内容" });
    expect(input).toHaveValue("第 2 轮提问");
    expect(input).toHaveFocus();
    // The edited turn's reply and every later turn dim; earlier turns stay.
    expect(screen.getByText("第 2 轮回复").closest(".opacity-30")).not.toBeNull();
    expect(screen.getByText("第 3 轮提问").closest(".opacity-30")).not.toBeNull();
    expect(screen.getByText("第 1 轮回复").closest(".opacity-30")).toBeNull();
    expect(input.closest(".opacity-30")).toBeNull();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "编辑提问内容" })).toBeNull();
    expect(screen.getByText("第 2 轮提问")).toBeInTheDocument();

    await user.click(screen.getByText("第 2 轮提问"));
    fireEvent.pointerDown(screen.getByText("第 1 轮回复"));
    expect(screen.queryByRole("textbox", { name: "编辑提问内容" })).toBeNull();
    // 取消按钮同样收起。
    await user.click(screen.getByText("第 2 轮提问"));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("textbox", { name: "编辑提问内容" })).toBeNull();
  });

  it("does not enter editing while text is selected", async () => {
    renderConversation({ messages: turns(2), onResendTurn: vi.fn() });
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "第 1" } as Selection);
    fireEvent.click(screen.getByText("第 1 轮提问"));
    expect(screen.queryByRole("textbox", { name: "编辑提问内容" })).toBeNull();
    selection.mockRestore();
  });

  it("sends the edit from that turn: fades out, then hands App the run, its durable seq and the new text", async () => {
    const user = userEvent.setup();
    const onResendTurn = vi.fn(async (_edit: TurnResend) => undefined);
    renderConversation({ messages: turns(3), onResendTurn });
    await user.click(screen.getByText("第 2 轮提问"));
    const input = screen.getByRole("textbox", { name: "编辑提问内容" });
    await user.clear(input);
    await user.type(input, "改过的第二问");
    vi.useFakeTimers();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(turnOf("第 3 轮提问").querySelector(".opacity-0")).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(onResendTurn).toHaveBeenCalledOnce();
    expect(onResendTurn.mock.calls[0][0]).toMatchObject({ sessionId: "session-1", runId: "run-2", fromSeq: 20, text: "改过的第二问" });
    expect(screen.queryByRole("textbox", { name: "编辑提问内容" })).toBeNull();
  });

  it("does not send on Enter while an input method is composing, or with nothing to send", async () => {
    const user = userEvent.setup();
    const onResendTurn = vi.fn();
    renderConversation({ messages: turns(1), onResendTurn });
    await user.click(screen.getByText("第 1 轮提问"));
    const input = screen.getByRole("textbox", { name: "编辑提问内容" });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    await user.clear(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "发送修改后的提问" })).toHaveAttribute("aria-disabled", "true");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onResendTurn).not.toHaveBeenCalled();
  });

  it("reopens the editor with what was typed when the resend fails", async () => {
    const user = userEvent.setup();
    const onResendTurn = vi.fn(async () => { throw new Error("这段对话有了新内容，看过最新内容后再编辑。"); });
    renderConversation({ messages: turns(2), onResendTurn });
    await user.click(screen.getByText("第 1 轮提问"));
    const input = screen.getByRole("textbox", { name: "编辑提问内容" });
    await user.type(input, "（补充）");
    await user.click(screen.getByRole("button", { name: "发送修改后的提问" }));
    await waitFor(() => expect(onResendTurn).toHaveBeenCalledOnce());
    expect(await screen.findByRole("textbox", { name: "编辑提问内容" })).toHaveValue("第 1 轮提问（补充）");
  });

  it("is not editable while busy or for an optimistic prompt that has no durable seq yet", async () => {
    const user = userEvent.setup();
    const { unmount } = renderConversation({ messages: turns(2), isStreaming: true, onResendTurn: vi.fn() });
    expect(card("第 1 轮提问")).not.toHaveAttribute("data-editable");
    await user.click(screen.getByText("第 1 轮提问"));
    expect(screen.queryByRole("textbox", { name: "编辑提问内容" })).toBeNull();
    unmount();

    const optimistic: MessageBlock = { kind: "user", id: "turn:run-x:user:0", runId: "run-x", content: "还在发送", createdAt: at };
    renderConversation({ messages: [...turns(1), optimistic], onResendTurn: vi.fn() });
    expect(card("还在发送")).not.toHaveAttribute("data-editable");
    expect(card("第 1 轮提问")).toHaveAttribute("data-editable", "true");
  });

  it("closes the editor once the Session becomes busy", async () => {
    const user = userEvent.setup();
    const props = { messages: turns(2), onResendTurn: vi.fn() };
    const view = renderConversation(props);
    await user.click(screen.getByText("第 1 轮提问"));
    expect(screen.getByRole("textbox", { name: "编辑提问内容" })).toBeInTheDocument();
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <RightPanelProvider>
          <TestConversationView contextSnapshot={null} sessionId="session-1" {...props} isStreaming />
        </RightPanelProvider>
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "编辑提问内容" })).toBeNull());
  });
});

describe("editor initial content", () => {
  const user = { kind: "user" as const, id: "v2-4", runId: "run-1", sourceSeq: 4, content: "原文", createdAt: at,
    attachments: [{ id: "art-img", path: "art-img", kind: "image" as const, name: "shot.png", mimeType: "image/png" }] };

  it("reads the original prompt, references and attachments from the Task, with artifact ids", () => {
    const prepared = [
      { type: "text", text: "原文" },
      { type: "file-reference", relativePath: "src/a.ts", displayName: "a.ts" },
      { type: "artifact", artifact: { artifactId: "art-img", mediaType: "image/png" }, label: "shot.png" },
      { type: "text", text: "Attached file: notes.md (art-file)" },
    ];
    const tasks = { sessionId: "s", revision: 3, paused: false, queue: [], runs: [], tasks: [
      { taskId: "t1", submissionId: "x", acceptedSeq: 1, state: "completed", targetRunId: null, runId: "run-1", continuationOf: null,
        content: { kind: "composer-task", original: { userInput: "原文", fileReferences: [{ relativePath: "src/a.ts", displayName: "a.ts" }], attachments: [{ id: "a", kind: "image", name: "shot.png", path: "/tmp/gone.png" }] }, prepared } },
    ] } as unknown as TaskSnapshot;
    const draft = turnPromptDraft("local-session", user, tasks);
    expect(draft.text).toBe("原文");
    expect(draft.fileReferences).toEqual([{ relativePath: "src/a.ts", displayName: "a.ts" }]);
    // Never the original local path: the screenshot's temp file may be gone.
    expect(draft.attachments).toEqual([
      { id: "art-img", artifactId: "art-img", kind: "image", name: "shot.png", mimeType: "image/png" },
      { id: "art-file", artifactId: "art-file", kind: "file", name: "notes.md" },
    ]);
  });

  it("falls back to the durable user block when the Task is gone", () => {
    expect(turnPromptDraft("local-session", user, undefined)).toEqual({
      text: "原文", fileReferences: [], responseAnnotations: [],
      attachments: [{ id: "art-img", artifactId: "art-img", kind: "image", name: "shot.png", mimeType: "image/png" }],
    });
  });

  it("ignores prepared blocks that are not attachments", () => {
    expect(preparedAttachments("plain text")).toEqual([]);
    expect(preparedAttachments([{ type: "text", text: "Attached file: but not really" }, { type: "response-excerpt" }])).toEqual([]);
  });
});
