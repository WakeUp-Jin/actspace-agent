import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComposerAttachment, ResponseAnnotationReference, SkillCatalogItem, UsableModelView } from "@actspace/shared";
import { mockContextSnapshot, mockContextState } from "./fixtures/workbenchFixture";
import { Composer } from "../components/Composer";
import { TooltipProvider } from "../components/ui/Tooltip";
import { ResponseAnnotationContext } from "../components/messages/response-annotation-context";
import { createAnnotationContextValue } from "./fixtures/response-annotation-helpers";
import { setupBridge } from "./helpers/bridge";
import { legacyRunTarget } from "./helpers/workbench";
import { RunTargetContext } from "../target/run-target-context";
import type { RunTargetReadiness } from "../target/readiness";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn();
  const onAbort = vi.fn();
  const onOpenAttachmentPreview = vi.fn();

  // 与 App 相同：本机能力（新建工作树等）按 executionContext 的 Git 状态算。rerender 也包同一个 Provider，Composer 不会重新挂载。
  const runTarget = legacyRunTarget({ executionContext: overrides.executionContext });
  const withRunTarget = (ui: ReactElement) => <RunTargetContext.Provider value={runTarget}>{ui}</RunTargetContext.Provider>;
  const result = render(withRunTarget(
    <TooltipProvider delayDuration={0}>
      <Composer
        contextSnapshot={mockContextSnapshot}
        onSend={onSend}
        onAbort={onAbort}
        onOpenAttachmentPreview={onOpenAttachmentPreview}
        {...overrides}
      />
    </TooltipProvider>,
  ));

  return { onSend, onAbort, onOpenAttachmentPreview, ...result, rerender: (ui: ReactElement) => result.rerender(withRunTarget(ui)) };
}

function createSkill(overrides: Partial<SkillCatalogItem> = {}): SkillCatalogItem {
  return {
    name: "frontend-design",
    description: "Build polished interfaces",
    scope: "project",
    source: ".agents",
    location: "/work/.agents/skills/frontend-design/SKILL.md",
    directory: "/work/.agents/skills/frontend-design",
    status: "available",
    removable: false,
    enabledForAgent: true,
    shadowed: false,
    ...overrides,
  };
}

describe("Composer Git status evidence", () => {
  it.each(["not_repository", "failed", "git_not_found", "loading"] as const)(
    "does not claim detached HEAD for a locked session with %s context",
    (status) => {
      renderComposer({ surface: "followup", executionContext: {
        runLocation: "this_mac",
        gitContext: status === "loading" ? null : { status, workspaceRoot: "/work/notes", branches: [] },
      } });
      expect(screen.getByText("本机")).toBeVisible();
      expect(screen.queryByText("分离的 HEAD")).not.toBeInTheDocument();
    },
  );

  it("shows detached HEAD only with confirmed commit evidence", () => {
    renderComposer({ surface: "followup", executionContext: {
      runLocation: "this_mac",
      gitContext: { status: "ready", workspaceRoot: "/work/repo", branches: [], detachedCommit: "01234567", headCommit: "0123456789abcdef" },
    } });
    expect(screen.getByText("分离的 HEAD")).toBeVisible();
  });

  it("keeps the known worktree branch while Git context is absent", () => {
    renderComposer({ surface: "followup", executionContext: {
      runLocation: "worktree", selectedBranch: "actspace/12345678", gitContext: null,
    } });
    expect(screen.getByText("actspace/12345678")).toBeVisible();
  });
});

const reasoningModels: UsableModelView[] = [
  {
    key: "deepseek:deepseek-v4-pro",
    label: "deepseek-flash",
    provider: "deepseek",
    apiModel: "deepseek-v4-pro",
    contextWindow: 1_000_000,
    thinkingDefault: true,
    capabilities: {
      input: ["text"],
      toolUse: "verified",
      reasoning: true,
      thinkingToggle: true,
      reasoningEfforts: ["high", "max"],
      reasoningDefaultEffort: "max",
    },
  },
  {
    key: "openrouter:openai/gpt-5",
    label: "GPT-5 High",
    provider: "openrouter",
    apiModel: "openai/gpt-5",
    contextWindow: 400_000,
    thinkingDefault: true,
    capabilities: {
      input: ["text"],
      toolUse: "declared",
      reasoning: true,
      thinkingToggle: true,
      reasoningEfforts: ["low", "medium", "high", "max"],
      reasoningDefaultEffort: "medium",
    },
  },
];

const duplicateNamedModels: UsableModelView[] = [
  reasoningModels[0],
  {
    key: "openrouter:deepseek/deepseek-v4-pro",
    label: "deepseek-flash",
    provider: "openrouter",
    apiModel: "deepseek/deepseek-v4-pro",
    contextWindow: 1_000_000,
    thinkingDefault: true,
    capabilities: {
      input: ["text"],
      toolUse: "declared",
      reasoning: true,
      thinkingToggle: true,
    },
  },
];

describe("Composer follow-up bar", () => {
  it("navigates the current session input history from an empty composer", async () => {
    const user = userEvent.setup();
    renderComposer({ inputHistory: ["first prompt", "second prompt"] });
    const input = screen.getByLabelText("消息输入框");

    await user.click(input);
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("second prompt");

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("first prompt");

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("first prompt");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("second prompt");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveValue("");
  });

  it("keeps native arrow behavior for fresh text and IME composition", async () => {
    const user = userEvent.setup();
    renderComposer({ inputHistory: ["older prompt"] });
    const input = screen.getByLabelText("消息输入框");

    await user.type(input, "current draft");
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("current draft");

    await user.clear(input);
    fireEvent.keyDown(input, { key: "ArrowUp", code: "ArrowUp", keyCode: 229, isComposing: true });
    expect(input).toHaveValue("");
  });

  it("does not restore a failed draft into a different session", async () => {
    renderComposer({
      draftKey: "session-b",
      readDraft: () => "draft for B",
      writeDraft: vi.fn(),
      draftRestore: {
        id: 1,
        sessionId: "session-a",
        text: "failed draft for A",
        error: "Preparation failed",
      },
    });

    await waitFor(() => expect(screen.getByLabelText("消息输入框")).toHaveValue("draft for B"));
  });

  it("writes a restored draft back to its session", async () => {
    const writeDraft = vi.fn();
    renderComposer({ draftKey: "session-a", readDraft: () => "", writeDraft, draftRestore: { id: 1, sessionId: "session-a", text: "retry me", error: "failed" } });

    await waitFor(() => expect(screen.getByLabelText("消息输入框")).toHaveValue("retry me"));
    expect(writeDraft).toHaveBeenCalledWith("session-a", "retry me");
  });

  it("prefers the restored draft when the session and the restore arrive together", async () => {
    const readDraft = (key: string) => key === "session-b" ? "stale draft for B" : "";
    const readAttachmentDraft = () => [];
    const photo: ComposerAttachment = { id: "photo", kind: "file", name: "notes.txt", path: "/tmp/notes.txt" };
    const view = (draftKey: string, draftRestore?: Parameters<typeof Composer>[0]["draftRestore"]) => (
      <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} draftKey={draftKey} readDraft={readDraft} writeDraft={vi.fn()} readAttachmentDraft={readAttachmentDraft} writeAttachmentDraft={vi.fn()} draftRestore={draftRestore} onSend={vi.fn()} /></TooltipProvider>
    );
    const { rerender } = renderComposer({ draftKey: "session-a", readDraft, readAttachmentDraft, writeAttachmentDraft: vi.fn() });

    rerender(view("session-b", { id: 1, sessionId: "session-b", text: "restored B", error: "上传失败", attachments: [photo] }));

    await waitFor(() => expect(screen.getByLabelText("消息输入框")).toHaveValue("restored B"));
    expect(screen.getByLabelText("已附加的文件 notes.txt")).toBeInTheDocument();
    expect(screen.getByText("上传失败")).toBeInTheDocument();
  });

  it("describes the rejected attachment with the send error", async () => {
    renderComposer({
      draftKey: "session-a",
      draftRestore: {
        id: 1,
        sessionId: "session-a",
        text: "keep this",
        error: "文件太大",
        attachmentIssue: { code: "text_too_large", attachmentId: "large" },
        attachments: [{ id: "large", kind: "file", name: "big.txt", path: "/tmp/big.txt" }],
      },
    });

    expect(await screen.findByLabelText("已附加的文件 big.txt")).toHaveAccessibleDescription("文件太大");
  });

  it("forgets the stacked layout when the session changes", async () => {
    const drafts: Record<string, string> = { "session-a": "line 1\nline 2", "session-b": "hi" };
    const readDraft = (key: string) => drafts[key] ?? "";
    const writeDraft = vi.fn();
    const view = (draftKey: string) => <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} draftKey={draftKey} readDraft={readDraft} writeDraft={writeDraft} onSend={vi.fn()} /></TooltipProvider>;
    const { container, rerender } = renderComposer({ draftKey: "session-a", readDraft, writeDraft });
    expect(container.querySelector("[data-layout]")).toHaveAttribute("data-layout", "stacked");

    rerender(view("session-b"));
    await waitFor(() => expect(container.querySelector("[data-layout]")).toHaveAttribute("data-layout", "inline"));
  });

  it("does not leak an asynchronous send failure into the newly selected session", async () => {
    let rejectSend!: (error: Error) => void;
    const onSend = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSend = reject; }));
    const readDraft = (key: string) => key === "session-a" ? "message for A" : "";
    const writeDraft = vi.fn();
    const view = (draftKey: string) => <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} draftKey={draftKey} readDraft={readDraft} writeDraft={writeDraft} onSend={onSend} /></TooltipProvider>;
    const { rerender } = render(view("session-a"));
    await userEvent.click(screen.getByRole("button", { name: "发送消息" }));
    expect(onSend).toHaveBeenCalledOnce();
    rerender(view("session-b"));
    rejectSend(new Error("A upload failed"));
    await waitFor(() => expect(writeDraft).toHaveBeenCalledWith("session-a", "message for A"));
    expect(screen.getByLabelText("消息输入框")).toHaveValue("");
    expect(screen.queryByText("A upload failed")).not.toBeInTheDocument();
  });

  it("closes its menus and the context popup when the session changes (16 review)", async () => {
    // Composer 只挂一次（16 T14），换会话不再重挂；开着的菜单和上下文用量不能带到下一个会话。
    const user = userEvent.setup();
    const readDraft = () => "";
    const view = (draftKey: string) => <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} draftKey={draftKey} readDraft={readDraft} writeDraft={vi.fn()} onSend={vi.fn()} /></TooltipProvider>;
    const { rerender } = render(view("session-a"));
    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    expect(screen.getByRole("listbox", { name: "添加上下文或工具" })).toBeInTheDocument();
    rerender(view("session-b"));
    expect(screen.queryByRole("listbox", { name: "添加上下文或工具" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^上下文用量/ }));
    expect(screen.getByRole("dialog", { name: "上下文用量" })).toBeInTheDocument();
    rerender(view("session-a"));
    expect(screen.queryByRole("dialog", { name: "上下文用量" })).not.toBeInTheDocument();
  });

  it("allows removing a rejected attachment and retrying the retained text", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockRejectedValueOnce(new Error("单个文件不能超过 20 MiB。"));
    renderComposer({ draftKey: "remote", onSend, draftRestore: { id: 1, sessionId: "remote", text: "keep this", attachments: [{ id: "large", kind: "file", name: "too-large.txt", path: "/tmp/too-large.txt" }] } });
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    await screen.findByText("单个文件不能超过 20 MiB。");
    await user.click(screen.getByRole("button", { name: "移除 too-large.txt" }));
    expect(screen.queryByLabelText("已附加的文件 too-large.txt")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    expect(onSend.mock.calls[1]?.[0]).toBe("keep this");
    expect(onSend.mock.calls[1]?.[1].attachments).toBeUndefined();
  });

  it("renders the follow-up shell with review preview and status row", () => {
    renderComposer({
      reviewSummary: {
        status: "changes",
        additions: 4253,
        deletions: 5,
      },
    });

    const reviewButton = screen.getByRole("button", { name: /审查待处理变更/ });
    const reviewOverflowButton = screen.getByRole("button", { name: "更多审查操作" });
    expect(reviewButton).toHaveTextContent("Review+4253-5");
    expect(reviewButton).toHaveClass("rounded-act-pill", "enabled:hover:bg-surface-subtle", "enabled:hover:border-line-strong");
    expect(reviewOverflowButton).toHaveClass("rounded-act-pill", "enabled:hover:bg-surface-subtle", "enabled:hover:border-line-strong");
    expect(screen.getByPlaceholderText("继续追问…")).toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
    expect(screen.getByText("本机")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上下文用量 36%" })).toBeInTheDocument();
  });

  it("uses the same request estimate for the footer and popup despite stale usage", async () => {
    const user = userEvent.setup();
    renderComposer({
      contextSnapshot: { ...mockContextSnapshot, totalTokens: 549_000, maxTokens: 1_000_000, percentUsed: 54.9 },
      contextState: { ...mockContextState, totalEstimatedTokens: 49_000, maxTokens: 1_000_000, percentUsed: 4.9 },
    });
    await user.click(screen.getByRole("button", { name: "上下文用量 5%" }));
    expect(screen.getByText("5% 已用")).toBeVisible();
    expect(screen.getByText("≈49K / 1M Token")).toBeVisible();
  });

  it("shows a fractional context estimate as <1% in the footer and popup", async () => {
    const user = userEvent.setup();
    renderComposer({ contextState: { ...mockContextState, totalEstimatedTokens: 4_200, maxTokens: 1_000_000, percentUsed: 0.42 } });
    await user.click(screen.getByRole("button", { name: "上下文用量 <1%" }));
    expect(screen.getByText("<1% 已用")).toBeVisible();
  });

  it("rounds the context usage status to an integer", () => {
    renderComposer({
      contextSnapshot: { ...mockContextSnapshot, totalTokens: 76_092, maxTokens: 1_000_000, percentUsed: 7.6092 },
    });

    expect(screen.getByRole("button", { name: "上下文用量 8%" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上下文用量 7.6092%" })).not.toBeInTheDocument();
  });

  it("keeps unknown capacity distinct from a known empty context", () => {
    renderComposer({
      contextSnapshot: { ...mockContextSnapshot, maxTokens: 0, percentUsed: 0 },
    });

    expect(screen.getByRole("button", { name: "上下文用量 —" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上下文用量 0%" })).not.toBeInTheDocument();
  });

  it("shows zero for an empty context with known capacity", () => {
    renderComposer({ contextSnapshot: { ...mockContextSnapshot, totalTokens: 0, maxTokens: 1_000_000, percentUsed: 0 } });
    expect(screen.getByRole("button", { name: "上下文用量 0%" })).toBeInTheDocument();
  });

  it("hides the review action when no review summary is available", () => {
    renderComposer();

    expect(screen.queryByRole("button", { name: /Review/ })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("继续追问…")).toBeInTheDocument();
  });

  it("keeps selected images in the attachment area above the input bar", async () => {
    const user = userEvent.setup();
    const selectedAttachments: ComposerAttachment[] = [
      {
        id: "selected-image",
        kind: "image",
        name: "screenshot.png",
        path: "/Users/test/screenshot.png",
        mimeType: "image/png",
        previewUrl: "data:image/png;base64,preview",
      },
    ];
    const selectImages = vi.fn(async () => ({ canceled: false, attachments: selectedAttachments }));
    setupBridge({ "dialogs.selectImages": selectImages });

    renderComposer();

    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("option", { name: "图片" }));

    const panel = screen.getByLabelText("消息输入面板");
    const attachmentList = within(panel).getByLabelText("已附加的文件");
    const toolbar = screen.getByLabelText("输入框工具栏");
    const input = screen.getByLabelText("消息输入框");
    const toolbarButtons = within(toolbar).getAllByRole("button");
    expect(within(attachmentList).getByLabelText("已附加的图片 screenshot.png")).toBeInTheDocument();
    expect(within(attachmentList).getByRole("button", { name: "预览附加图片 screenshot.png" }))
      .toHaveStyle({ backgroundImage: 'url("data:image/png;base64,preview")' });
    expect(panel).toContainElement(attachmentList);
    expect(panel).toContainElement(input);
    expect(toolbar).not.toContainElement(input);
    expect(toolbarButtons[0]).toHaveAccessibleName("添加 Agent、上下文或工具");
    expect(toolbarButtons[1]).toHaveAccessibleName(/deepseek-flash/i);
    expect(within(panel).queryByRole("button", { name: "Show context usage" })).not.toBeInTheDocument();
    expect(panel).not.toContainElement(screen.queryByRole("button", { name: /审查待处理变更/ }));
    expect(input).toHaveValue("");
  });

  // 输入布局对齐 Cursor：单行内容 inline（同一行），内容折行自动切 stacked（控件行贴底）；
  // 进入 stacked 后删到一个字仍是 stacked，只有清空才回到 inline。切换只改 grid-template-areas，textarea 不 remount。
  it("switches between inline and stacked layout as content wraps", async () => {
    const user = userEvent.setup();
    renderComposer();

    const panel = screen.getByLabelText("消息输入面板");
    const body = panel.querySelector(".composer-body") as HTMLElement;
    const input = screen.getByLabelText("消息输入框") as HTMLTextAreaElement;

    // jsdom 不做真实布局，scrollHeight 恒为 0；用 getter 模拟内容高度。
    let mockScrollHeight = 34;
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => mockScrollHeight);

    expect(body.dataset.layout).toBe("inline");

    mockScrollHeight = 74;
    await user.click(input);
    await user.paste("line1\nline2\nline3");
    expect(body.dataset.layout).toBe("stacked");

    mockScrollHeight = 34;
    await user.clear(input);
    await user.type(input, "x");
    expect(body.dataset.layout).toBe("inline");

    mockScrollHeight = 74;
    await user.type(input, "这段文字在单行里会折行");
    expect(body.dataset.layout).toBe("stacked");

    // 删到一个字：内容已经能放进一行，但仍保持 stacked，避免边输边删时来回跳。
    mockScrollHeight = 34;
    await user.type(input, "{Backspace}".repeat(11));
    expect(input).toHaveValue("x");
    expect(body.dataset.layout).toBe("stacked");

    await user.type(input, "{Backspace}");
    expect(body.dataset.layout).toBe("inline");

    // 切换过程 textarea 是同一个 DOM 节点（不 remount）
    expect(screen.getByLabelText("消息输入框")).toBe(input);
  });

  it.each(["agent", "plan", "chat"] as const)("keeps wrapped content stacked when the wider stacked layout would fit on one line (%s)", async (mode) => {
    const user = userEvent.setup();
    renderComposer({ mode });

    const panel = screen.getByLabelText("消息输入面板");
    const body = panel.querySelector(".composer-body") as HTMLElement;
    const input = screen.getByLabelText("消息输入框") as HTMLTextAreaElement;

    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(function () {
      // 同一个固定 inline 网格决定折行，不能随真实布局的判定结果变化。
      const measuredBody = this.parentElement!;
      if (this.style.width) return body.dataset.layout === "stacked" ? 34 : 74;
      return /\[grid-template-areas:'plus_(?:mode_)?input_model_send'\]/.test(measuredBody.className) ? 74 : 34;
    });

    await user.click(input);
    await user.paste("这段文字在宽的 stacked 输入框里只有一行，但在带模型和发送按钮的 inline 输入框里会折行");

    expect(body.dataset.layout).toBe("stacked");
    expect(input.style.height).toBe("34px");

    // 模拟中文输入法按 Enter 确认候选后 message 再次变化：仍应按 inline 宽度判定，不能缩回 inline。
    await user.type(input, "啦");
    expect(body.dataset.layout).toBe("stacked");
  });

  it("does not resize the editing textarea temporarily during IME commit", async () => {
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(314);
    renderComposer({ surface: "initial" });
    const input = screen.getByLabelText("消息输入框") as HTMLTextAreaElement;
    const body = input.parentElement!;
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(body, { attributes: true, attributeOldValue: true, subtree: true });
    input.focus();
    input.scrollTop = 134.5;
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "长文本末尾的候选词" } });
    fireEvent.compositionEnd(input, { data: "候选词" });
    await Promise.resolve();
    observer.disconnect();
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.scrollTop).toBe(134.5);
    expect(changes.filter((record) => record.target === body && record.attributeName === "class")).toEqual([]);
    expect(changes.filter((record) => record.target === input && record.attributeName === "style")).toEqual([]);
    expect(screen.getAllByLabelText("消息输入框")).toEqual([input]);
  });

  // 新建页输入框始终多行（输入在上、控件行在下），空内容也不收成单行胶囊。
  it("keeps the initial surface stacked even when empty", () => {
    renderComposer({ surface: "initial" });

    const body = screen.getByLabelText("消息输入面板").querySelector(".composer-body") as HTMLElement;
    expect(body.dataset.layout).toBe("stacked");
  });

  it("forces stacked layout when attachments exist", async () => {
    const user = userEvent.setup();
    const selectImages = vi.fn(async () => ({
      canceled: false,
      attachments: [
        { id: "att-1", kind: "image" as const, name: "notes.png", path: "/Users/test/notes.png" },
      ],
    }));
    setupBridge({ "dialogs.selectImages": selectImages });
    renderComposer();

    const panel = screen.getByLabelText("消息输入面板");
    const body = panel.querySelector(".composer-body") as HTMLElement;
    expect(body.dataset.layout).toBe("inline");

    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("option", { name: "图片" }));

    expect(body.dataset.layout).toBe("stacked");
  });

  it("returns to inline once the last attachment is removed and the input is empty", async () => {
    const user = userEvent.setup();
    setupBridge({
      "dialogs.selectImages": vi.fn(async () => ({
        canceled: false,
        attachments: [{ id: "att-1", kind: "image" as const, name: "notes.png", path: "/Users/test/notes.png" }],
      })),
    });
    renderComposer();
    const body = screen.getByLabelText("消息输入面板").querySelector(".composer-body") as HTMLElement;

    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("option", { name: "图片" }));
    expect(body.dataset.layout).toBe("stacked");

    await user.click(screen.getByRole("button", { name: /移除 notes\.png/ }));
    expect(body.dataset.layout).toBe("inline");
  });

  it("stacks text with a line break even when every line is short", async () => {
    const user = userEvent.setup();
    renderComposer();
    const body = screen.getByLabelText("消息输入面板").querySelector(".composer-body") as HTMLElement;
    const input = screen.getByLabelText("消息输入框");

    await user.click(input);
    await user.paste("a\nb");
    expect(body.dataset.layout).toBe("stacked");
  });

  it("keeps the model button next to send in the inline layout and moves it to the bottom row when stacked", async () => {
    const user = userEvent.setup();
    renderComposer();
    const body = screen.getByLabelText("消息输入面板").querySelector(".composer-body") as HTMLElement;
    const modelGroup = screen.getByRole("button", { name: /deepseek-flash/i }).parentElement!;

    expect(body.dataset.layout).toBe("inline");
    expect(body).toHaveClass("group/composer-body");
    expect(modelGroup).toHaveClass("[grid-area:model]");
    expect(modelGroup.className).not.toContain("hidden");
    expect(body.className).toMatch(/'plus_input_model_send'/);

    await user.click(screen.getByLabelText("消息输入框"));
    await user.paste("a\nb");
    expect(body.dataset.layout).toBe("stacked");
    expect(body.className).toMatch(/'plus_(?:mode_)?model_\._send'/);
  });

  it("always stacks in a narrow window", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query === "(max-width: 600px)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList);
    renderComposer();
    const body = screen.getByLabelText("消息输入面板").querySelector(".composer-body") as HTMLElement;
    expect(body.dataset.layout).toBe("stacked");
  });

  it("renders the send button as an accent round arrow button", () => {
    renderComposer();

    // bg-accent 在默认调色板下回落为 action 反色，其它调色板取强调色（front-accent-palette.md）。
    const sendButton = screen.getByRole("button", { name: "输入消息后发送" });
    expect(sendButton).toHaveClass("bg-accent", "text-on-accent", "rounded-act-pill", "size-7");
    expect(sendButton).toHaveAttribute("data-mode", "agent");
    expect(sendButton.className).not.toContain("bg-operational");
  });

  it.each([
    ["plan", "bg-warning", "text-on-warning-solid"],
    ["chat", "bg-operational", "text-on-operational"],
  ] as const)("colors the send button for %s mode", (mode, background, foreground) => {
    renderComposer({ mode });
    const sendButton = screen.getByRole("button", { name: "输入消息后发送" });
    expect(sendButton).toHaveAttribute("data-mode", mode);
    expect(sendButton).toHaveClass(background, foreground);
    expect(sendButton.className).not.toContain("bg-accent");
  });

  it("keeps the stop button neutral in every mode", () => {
    renderComposer({ mode: "plan", isStreaming: true, onAbort: vi.fn() });
    const stopButton = screen.getByRole("button", { name: "停止 Agent" });
    expect(stopButton).toHaveClass("bg-action");
    expect(stopButton.className).not.toContain("bg-warning");
  });

  it("explains why sending is unavailable when no provider model can be used", async () => {
    const user = userEvent.setup();
    renderComposer({
      models: [],
      selectedModelId: "deepseek:deepseek-v4-pro",
    });

    await user.type(screen.getByLabelText("消息输入框"), "hello");

    expect(screen.getByText("未连接模型")).toBeInTheDocument();
    const sendButton = screen.getByRole("button", {
      name: "暂无可用模型，请在设置中连接服务商",
    });
    expect(sendButton).toHaveAttribute("aria-disabled", "true");
    await user.hover(sendButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("请先在设置中连接模型服务");
  });

  it("grows the input height to fit pasted multi-line content", async () => {
    const user = userEvent.setup();
    renderComposer();

    const input = screen.getByLabelText("消息输入框") as HTMLTextAreaElement;
    // jsdom 不做真实布局，scrollHeight 恒为 0；用 getter 模拟粘贴大段文本后内容撑高。
    let mockScrollHeight = 20;
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => mockScrollHeight);

    mockScrollHeight = 96;
    await user.click(input);
    await user.paste("line1\nline2\nline3\nline4");

    expect(input.style.height).toBe("96px");
  });

  it("opens the plus panel of a started Agent session with Plan, Image, Skills, and the model", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));

    // 已开始的 Agent 会话只列 Plan；默认的 Agent 不列。
    const menu = screen.getByRole("listbox", { name: "添加上下文或工具" });
    expect(within(menu).getByRole("option", { name: "Plan" })).toBeInTheDocument();
    expect(within(menu).queryByRole("option", { name: "Agent" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("option", { name: "Chat" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("option", { name: "图片" })).toBeInTheDocument();
    expect(within(menu).getByRole("option", { name: "Skills" })).toBeInTheDocument();
    expect(within(menu).queryByRole("option", { name: "模型" })).not.toBeInTheDocument();
    expect(within(menu).queryByText(/Debug|Multitask|Ask|MCP Servers|Attach files/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "搜索" })).toHaveFocus();
  });

  it("opens the slash menu with Functions and workspace Skills", async () => {
    const user = userEvent.setup();
    const listSkills = vi.fn(async () => ({ items: [createSkill()], warnings: [] }));
    setupBridge({ "skills.list": listSkills });
    renderComposer({ selectedWorkspaceRoot: "/work" });

    const input = screen.getByLabelText("消息输入框");
    await user.type(input, "/");

    const menu = await screen.findByRole("listbox", { name: "斜杠命令" });
    expect(within(menu).getByText("功能")).toBeInTheDocument();
    const planCommand = within(menu).getByRole("option", { name: /^plan:/ });
    expect(planCommand).toHaveTextContent("plan使用只读工具进行调研和规划。");
    expect(planCommand).toHaveClass("min-h-9", "items-center");
    expect(within(menu).queryByRole("option", { name: /^chat:/ })).not.toBeInTheDocument();
    const compactCommand = within(menu).getByRole("option", { name: /^compact:/ });
    expect(compactCommand.querySelector("svg")).toHaveClass("lucide-asterisk");
    const statusCommand = within(menu).getByRole("option", { name: /^status:/ });
    expect(statusCommand.querySelector("svg")).toHaveClass("lucide-chart-pie");
    const skillOption = await within(menu).findByRole("option", { name: /frontend-design/i });
    expect(skillOption).toHaveClass("min-h-9", "items-center");
    expect(skillOption).toHaveTextContent("frontend-designBuild polished interfaces");
    expect(listSkills).toHaveBeenCalledWith({ workspaceRoot: "/work" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", menu.id);
    expect(menu).toHaveClass("w-[min(520px,calc(100vw_-_36px))]");
  });

  it("opens the initial Composer slash menu below the input with a viewport-safe height", async () => {
    const user = userEvent.setup();
    renderComposer({ surface: "initial" });

    await user.type(screen.getByLabelText("消息输入框"), "/");

    const menu = await screen.findByRole("listbox", { name: "斜杠命令" });
    expect(menu).toHaveClass(
      "top-[calc(100%_+_8px)]",
      "max-h-[min(280px,calc(50vh_-_90px))]",
    );
    expect(menu).not.toHaveClass("bottom-[calc(100%_+_8px)]");
  });

  it("refreshes slash Skills when the selected workspace changes", async () => {
    const user = userEvent.setup();
    let resolveFirstLoad: ((value: { items: SkillCatalogItem[]; warnings: string[] }) => void) | undefined;
    const listSkills = vi.fn(({ workspaceRoot }: { workspaceRoot?: string }) => {
      if (workspaceRoot === "/work/a") {
        return new Promise<{ items: SkillCatalogItem[]; warnings: string[] }>((resolve) => {
          resolveFirstLoad = resolve;
        });
      }
      return Promise.resolve({
        items: [createSkill({ name: "workspace-b-skill", location: "/work/b/.agents/skills/workspace-b-skill/SKILL.md" })],
        warnings: [],
      });
    });
    setupBridge({ "skills.list": listSkills });
    const { rerender } = renderComposer({ selectedWorkspaceRoot: "/work/a" });

    await user.type(screen.getByLabelText("消息输入框"), "/");
    await waitFor(() => expect(listSkills).toHaveBeenCalledWith({ workspaceRoot: "/work/a" }));

    rerender(
      <TooltipProvider delayDuration={0}>
        <Composer contextSnapshot={mockContextSnapshot} selectedWorkspaceRoot="/work/b" />
      </TooltipProvider>,
    );

    expect(await screen.findByRole("option", { name: /workspace-b-skill/i })).toBeInTheDocument();
    resolveFirstLoad?.({
      items: [createSkill({ name: "stale-workspace-a-skill" })],
      warnings: [],
    });
    await waitFor(() => expect(screen.queryByText("stale-workspace-a-skill")).not.toBeInTheDocument());
  });

  it("navigates slash results with arrows and switches modes without sending", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const { onSend } = renderComposer({ mode: "agent", onModeChange });
    const input = screen.getByLabelText("消息输入框");

    await user.type(input, "/");
    expect(input).toHaveAttribute("aria-activedescendant", "composer-slash-function-plan");
    await user.keyboard("{Enter}");

    expect(onModeChange).toHaveBeenCalledWith("plan");
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox", { name: "斜杠命令" })).not.toBeInTheDocument();
  });

  it("runs compact immediately without consuming attachments or selected Skills", async () => {
    const user = userEvent.setup();
    const attachments: ComposerAttachment[] = [{
      id: "selected-image",
      kind: "image",
      name: "screenshot.png",
      path: "/Users/test/screenshot.png",
      mimeType: "image/png",
      previewUrl: "file:///Users/test/screenshot.png",
    }];
    setupBridge({
      "skills.list": vi.fn(async () => ({ items: [], warnings: [] })),
      "dialogs.selectImages": vi.fn(async () => ({ canceled: false, attachments })),
    });
    const { onSend } = renderComposer({ selectedSkills: ["frontend-design"] });

    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("option", { name: "图片" }));
    expect(screen.getByLabelText("已附加的图片 screenshot.png")).toBeInTheDocument();

    const input = screen.getByLabelText("消息输入框");
    await user.type(input, "/compact");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("/compact", {
      mode: "agent",
      model: "deepseek-v4-flash",
      selectedSkills: ["frontend-design"],
      thinkingEnabled: true,
    });
    expect(screen.getByLabelText("已附加的图片 screenshot.png")).toBeInTheDocument();
    expect(screen.getByLabelText("已选择的 Skill frontend-design")).toBeInTheDocument();
  });

  it("keeps /compact in the menu while no model is available", async () => {
    const user = userEvent.setup();
    setupBridge({ "skills.list": vi.fn(async () => ({ items: [], warnings: [] })) });
    const { onSend } = renderComposer({ models: [] });

    await user.type(screen.getByLabelText("消息输入框"), "/compact");
    await user.keyboard("{Enter}");

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText("斜杠命令")).toBeInTheDocument();
  });

  it("turns /side into a side chat question instead of sending it to the current session", async () => {
    const user = userEvent.setup();
    setupBridge({ "skills.list": vi.fn(async () => ({ items: [], warnings: [] })) });
    const onOpenSideChat = vi.fn(async () => {});
    const { onSend } = renderComposer({ onOpenSideChat });
    const input = screen.getByLabelText("消息输入框");

    await user.type(input, "/side");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("/side ");
    expect(screen.queryByLabelText("斜杠命令")).not.toBeInTheDocument();

    await user.type(input, "这个函数为什么慢？");
    await user.keyboard("{Enter}");

    expect(onOpenSideChat).toHaveBeenCalledWith("这个函数为什么慢？", expect.objectContaining({ mode: "agent" }));
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("puts the /side draft back when the side chat does not open", async () => {
    const user = userEvent.setup();
    setupBridge({ "skills.list": vi.fn(async () => ({ items: [], warnings: [] })) });
    const onOpenSideChat = vi.fn(async () => { throw new Error("主会话还没有完成的一轮，暂时不能开侧边对话。"); });
    renderComposer({ onOpenSideChat });
    const input = screen.getByLabelText("消息输入框");

    await user.type(input, "/side 问一下");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(input).toHaveValue("/side 问一下"));
    expect(screen.getByText("主会话还没有完成的一轮，暂时不能开侧边对话。")).toBeInTheDocument();
  });

  it("does not offer /side without a side chat handler or in Chat", async () => {
    const user = userEvent.setup();
    setupBridge({ "skills.list": vi.fn(async () => ({ items: [], warnings: [] })) });
    const { onSend, rerender } = renderComposer();
    const input = screen.getByLabelText("消息输入框");

    await user.type(input, "/si");
    expect(screen.queryByRole("option", { name: /^side:/ })).not.toBeInTheDocument();

    rerender(<TooltipProvider delayDuration={0}><Composer contextSnapshot={mockContextSnapshot} onSend={onSend} mode="chat" onOpenSideChat={vi.fn(async () => {})} /></TooltipProvider>);
    expect(screen.queryByRole("option", { name: /^side:/ })).not.toBeInTheDocument();
  });

  it("opens Context and Review from slash functions and binds a filtered Skill", async () => {
    const user = userEvent.setup();
    const onExpandContext = vi.fn();
    const onOpenReview = vi.fn();
    const onSelectedSkillsChange = vi.fn();
    setupBridge({ "skills.list": vi.fn(async () => ({ items: [createSkill()], warnings: [] })) });
    renderComposer({ onExpandContext, onOpenReview, onSelectedSkillsChange });
    const input = screen.getByLabelText("消息输入框");

    await user.type(input, "/status");
    await user.keyboard("{Enter}");
    expect(onExpandContext).toHaveBeenCalledTimes(1);

    await user.type(input, "/review");
    await user.keyboard("{Enter}");
    expect(onOpenReview).toHaveBeenCalledTimes(1);

    await user.type(input, "/polished");
    const skillOption = await screen.findByRole("option", { name: /frontend-design/i });
    await user.click(skillOption);
    expect(onSelectedSkillsChange).toHaveBeenCalledWith(["frontend-design"]);
  });

  it("keeps slash selection inert while an IME composition is active", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const { onSend } = renderComposer({ onModeChange });
    const input = screen.getByLabelText("消息输入框");

    await user.type(input, "/plan");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 229, isComposing: true });

    expect(onModeChange).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("/plan");
  });

  it("switches modes and renders the selected mode pill with semantic colors", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const { rerender } = renderComposer({ mode: "agent", onModeChange });

    expect(screen.queryByRole("button", { name: /Agent 模式/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("option", { name: "Plan" }));
    expect(onModeChange).toHaveBeenCalledWith("plan");

    rerender(
      <TooltipProvider delayDuration={0}>
        <Composer contextSnapshot={mockContextSnapshot} mode="plan" onModeChange={onModeChange} />
      </TooltipProvider>,
    );
    const exitPlan = screen.getByRole("button", { name: "退出 Plan 模式" });
    const planChip = exitPlan.closest(".mode-chip") as HTMLElement;
    expect(planChip).toHaveClass("bg-warning-soft", "text-on-warning");
    // 名称区只是标签，不是按钮。
    expect(within(planChip).getAllByRole("button")).toEqual([exitPlan]);
    expect(planChip).toHaveTextContent("Plan");
    expect(screen.getByPlaceholderText("描述要规划的改动…")).toBeInTheDocument();
    await user.click(exitPlan);
    expect(onModeChange).toHaveBeenLastCalledWith("agent");
    expect(screen.getByLabelText("消息输入框")).toHaveFocus();
  });

  it.each([
    ["agent", "initial", false, "描述你要做的事，@ 引用文件，/ 调用命令"],
    ["agent", "followup", false, "继续追问…"],
    ["plan", "initial", false, "描述要规划的改动…"],
    ["plan", "followup", false, "描述要规划的改动…"],
    ["chat", "initial", false, "问点什么…"],
    ["chat", "followup", false, "问点什么…"],
    ["agent", "followup", true, "继续追问，运行中发送会进入队列…"],
    ["chat", "followup", true, "继续追问，运行中发送会进入队列…"],
  ] as const)("uses the final placeholder for %s on the %s surface (queueing: %s)", (mode, surface, queueing, text) => {
    renderComposer({
      mode,
      surface,
      ...(queueing
        ? {
            isStreaming: true,
            messageQueue: {
              queue: { paused: false, steering: [], items: [] },
              running: true,
              steerBlockedReason: null,
              onSteer: vi.fn(), onUnsteer: vi.fn(), onRemove: vi.fn(), onMoveUp: vi.fn(), onEdit: vi.fn(), onResume: vi.fn(),
            },
          }
        : {}),
    });
    expect(screen.getByRole("textbox", { name: "消息输入框" })).toHaveAttribute("placeholder", text);
  });

  it("returns to Agent when Backspace is pressed on the mode chip", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    renderComposer({ mode: "chat", onModeChange });

    const exitChat = screen.getByRole("button", { name: "退出 Chat 模式" });
    expect(exitChat.closest(".mode-chip")).toHaveClass("bg-operational-soft", "text-operational");
    exitChat.focus();
    await user.keyboard("{Backspace}");
    expect(onModeChange).toHaveBeenCalledWith("agent");
  });

  it("keeps the mode while a run is streaming", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    renderComposer({ mode: "plan", onModeChange, isStreaming: true });

    const exitPlan = screen.getByRole("button", { name: "退出 Plan 模式" });
    expect(exitPlan).toBeDisabled();
    fireEvent.keyDown(exitPlan, { key: "Backspace" });
    expect(onModeChange).not.toHaveBeenCalled();
    await user.click(exitPlan);
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("lists enabled Skills, selects one, and keeps it visible as a pill", async () => {
    const user = userEvent.setup();
    const onSelectedSkillsChange = vi.fn();
    const skill: SkillCatalogItem = {
      name: "frontend-design",
      description: "Build polished interfaces",
      scope: "project",
      source: ".agents",
      location: "/work/.agents/skills/frontend-design/SKILL.md",
      directory: "/work/.agents/skills/frontend-design",
      status: "available",
      removable: false,
      enabledForAgent: true,
      shadowed: false,
    };
    const listSkills = vi.fn(async () => ({ items: [skill], warnings: [] }));
    setupBridge({ "skills.list": listSkills });

    const { rerender } = renderComposer({
      selectedWorkspaceRoot: "/work",
      selectedSkills: [],
      onSelectedSkillsChange,
    });
    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("option", { name: "Skills" }));
    const skillsMenu = await screen.findByRole("listbox", { name: "Skills" });
    expect(screen.queryByRole("listbox", { name: "添加上下文或工具" })).not.toBeInTheDocument();
    await user.click(await within(skillsMenu).findByRole("option", { name: /frontend-design/i }));
    expect(listSkills).toHaveBeenCalledWith({ workspaceRoot: "/work" });
    expect(onSelectedSkillsChange).toHaveBeenCalledWith(["frontend-design"]);

    rerender(
      <TooltipProvider delayDuration={0}>
        <Composer
          contextSnapshot={mockContextSnapshot}
          selectedSkills={["frontend-design"]}
          onSelectedSkillsChange={onSelectedSkillsChange}
        />
      </TooltipProvider>,
    );
    expect(screen.getByLabelText("已选择的 Skill frontend-design")).toBeInTheDocument();
  });

  it("shows a tooltip for the add menu button", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.hover(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("添加上下文、工具或附件");
  });

  it("keeps the disabled send button explainable without sending", async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer();

    const sendButton = screen.getByRole("button", { name: "输入消息后发送" });
    expect(sendButton).toHaveAttribute("aria-disabled", "true");

    await user.hover(sendButton);
    expect((await screen.findAllByText("输入消息后发送")).length).toBeGreaterThan(0);
    await user.click(sendButton);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("adds selected images from the Image menu", async () => {
    const user = userEvent.setup();
    const attachments: ComposerAttachment[] = [
      {
        id: "selected-image",
        kind: "image",
        name: "screenshot.png",
        path: "/Users/test/screenshot.png",
        mimeType: "image/png",
        previewUrl: "file:///Users/test/screenshot.png",
      },
    ];
    const selectImages = vi.fn(async () => ({ canceled: false, attachments }));
    setupBridge({ "dialogs.selectImages": selectImages });

    renderComposer();

    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("option", { name: "图片" }));

    expect(selectImages).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("已附加的图片 screenshot.png")).toBeInTheDocument();
  });

  it("opens a selected image preview and keeps the remove control compact", async () => {
    const user = userEvent.setup();
    const attachment: ComposerAttachment = {
      id: "selected-image",
      kind: "image",
      name: "screenshot.png",
      path: "/Users/test/screenshot.png",
      mimeType: "image/png",
      previewUrl: "data:image/png;base64,preview",
    };
    setupBridge({
      "dialogs.selectImages": vi.fn(async () => ({ canceled: false, attachments: [attachment] })),
    });
    const { onOpenAttachmentPreview } = renderComposer();

    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("option", { name: "图片" }));
    await user.click(screen.getByRole("button", { name: "预览附加图片 screenshot.png" }));

    expect(onOpenAttachmentPreview).toHaveBeenCalledWith(attachment);
    expect(screen.getByRole("button", { name: "移除 screenshot.png" })).toHaveClass("h-[18px]", "w-[18px]");
  });

  it("imports pasted images and lets a text-only model send them without persisting preview data", async () => {
    const pastedAttachment: ComposerAttachment = {
      id: "pasted-image",
      kind: "image",
      name: "pasted-image.png",
      path: "/tmp/composer-attachments/pasted-image.png",
      mimeType: "image/png",
      previewUrl: "data:image/png;base64,preview",
    };
    const importComposerImage = vi.fn(async () => ({ ok: true as const, attachment: pastedAttachment }));
    setupBridge({ "dialogs.importComposerImage": importComposerImage });
    const { onSend } = renderComposer();
    const input = screen.getByLabelText("消息输入框");
    const file = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    fireEvent.paste(input, {
      clipboardData: {
        items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
      },
    });

    await waitFor(() => expect(importComposerImage).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText("已附加的图片 pasted-image.png")).toBeInTheDocument();
    await userEvent.type(input, "看看这张图");
    await userEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onSend).toHaveBeenCalledWith("看看这张图", expect.objectContaining({
      model: "deepseek-v4-flash",
      attachments: [{
        id: "pasted-image",
        kind: "image",
        name: "pasted-image.png",
        path: "/tmp/composer-attachments/pasted-image.png",
        mimeType: "image/png",
        previewUrl: "data:image/png;base64,preview",
      }],
    }));
  });

  it("does not add fake attachments when the Electron file bridge is unavailable", async () => {
    const user = userEvent.setup();

    renderComposer();

    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await user.click(screen.getByRole("option", { name: "图片" }));

    expect(screen.queryByLabelText("已附加的文件")).not.toBeInTheDocument();
  });

  it("adds dropped files, removes attachments, and sends only remaining attachments", async () => {
    const user = userEvent.setup();
    const getPathForFile = vi.fn((file: File) => file.name === "photo.png" ? "/Users/test/photo.png" : "/Users/test/report.pdf");
    setupBridge({ "dialogs.getPathForFile": getPathForFile });
    const { onSend } = renderComposer();

    const panel = screen.getByLabelText("消息输入面板");
    fireEvent.drop(panel, {
      dataTransfer: {
        files: [
          new File(["image"], "photo.png", { type: "image/png" }),
          new File(["report"], "report.pdf", { type: "application/pdf" }),
        ],
        types: ["Files"],
      },
    });

    expect(screen.getByLabelText("已附加的图片 photo.png")).toBeInTheDocument();
    expect(screen.getByLabelText("已附加的文件 report.pdf")).toBeInTheDocument();

    const removePhoto = screen.getByRole("button", { name: "移除 photo.png" });
    await user.hover(removePhoto);
    expect((await screen.findAllByText("移除 photo.png")).length).toBeGreaterThan(0);

    await user.click(removePhoto);
    expect(screen.queryByLabelText("已附加的图片 photo.png")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("消息输入框"), "analyze this");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onSend).toHaveBeenCalledWith("analyze this", {
      mode: "agent",
      model: "deepseek-v4-flash",
      selectedSkills: [],
      thinkingEnabled: true,
      attachments: [
        expect.objectContaining({
          kind: "file",
          name: "report.pdf",
          path: "/Users/test/report.pdf",
          mimeType: "application/pdf",
        }),
      ],
    });
    expect(screen.queryByLabelText("已附加的文件 report.pdf")).not.toBeInTheDocument();
  });

  it("keeps command menu, model menu, and context popup mutually exclusive", async () => {
    const user = userEvent.setup();
    const { container } = renderComposer();

    await user.type(screen.getByLabelText("消息输入框"), "/");
    expect(await screen.findByRole("listbox", { name: "斜杠命令" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    expect(screen.queryByRole("listbox", { name: "斜杠命令" })).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "添加上下文或工具" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /deepseek-flash/i }));
    expect(screen.queryByRole("listbox", { name: "添加上下文或工具" })).not.toBeInTheDocument();
    expect(screen.getAllByText("deepseek-flash").at(-1)!).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "上下文用量 36%" }));
    expect(document.querySelector(".model-menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "上下文用量" })).toBeInTheDocument();
  });

  it("toggles the initial selectors from their own buttons and closes them and the slash menu outside the composer", async () => {
    // 09 T18：三个菜单都是 ui/Menu，点外面和 Esc 由 Radix 处理；Composer 只管同一时间只开一个、和斜杠菜单互斥。
    const user = userEvent.setup();
    renderComposer({
      surface: "initial",
      selectedWorkspaceRoot: "/work/actspace-agent",
      workspaceOptions: [{ value: "/work/actspace-agent", label: "actspace-agent" }],
      executionContext: { runLocation: "this_mac", selectedBranch: "main", gitContext: null },
    });
    const outside = document.createElement("button");
    outside.textContent = "外部";
    document.body.append(outside);
    const workspace = screen.getByRole("button", { name: "选择工作区" });
    const runtime = screen.getByRole("button", { name: "选择运行位置" });

    const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await user.click(workspace);
    expect(screen.getByRole("menu", { name: "选择工作区" })).toBeInTheDocument();
    await settle();
    await user.click(runtime);
    expect(screen.queryByRole("menu", { name: "选择工作区" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "选择运行位置" })).toBeInTheDocument();
    expect(runtime).toHaveAttribute("aria-expanded", "true");
    await settle();
    await user.click(runtime);
    expect(screen.queryByRole("menu", { name: "选择运行位置" })).not.toBeInTheDocument();

    // 斜杠菜单开着时打开下拉：斜杠菜单收起。
    await user.type(screen.getByLabelText("消息输入框"), "/");
    expect(await screen.findByRole("listbox", { name: "斜杠命令" })).toBeInTheDocument();
    await user.click(workspace);
    expect(screen.queryByRole("listbox", { name: "斜杠命令" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "选择工作区" })).toBeInTheDocument();
    await settle();
    await user.click(outside);
    expect(screen.queryByRole("menu", { name: "选择工作区" })).not.toBeInTheDocument();

    // 斜杠菜单仍由 Composer 自己在点外面时收起。
    await user.clear(screen.getByLabelText("消息输入框"));
    await user.type(screen.getByLabelText("消息输入框"), "/");
    expect(await screen.findByRole("listbox", { name: "斜杠命令" })).toBeInTheDocument();
    await user.click(outside);
    expect(screen.queryByRole("listbox", { name: "斜杠命令" })).not.toBeInTheDocument();

    await user.click(workspace);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "选择工作区" })).not.toBeInTheDocument();
    expect(workspace).toHaveAttribute("aria-expanded", "false");
    outside.remove();
  });

  it("switches between the plus panel and the model menu without the closing one taking focus back", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    expect(screen.getByRole("listbox", { name: "添加上下文或工具" })).toBeInTheDocument();
    // 点模型按钮：模型菜单先打开，`+` 面板的点外关闭随后才到，不能把模型菜单一起关掉。
    await user.click(screen.getByRole("button", { name: /deepseek-flash/i }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByRole("listbox", { name: "添加上下文或工具" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "模型" })).toBeInTheDocument();

    // 反过来：模型菜单开着时点 `+`，模型菜单关闭时不把焦点抢回模型按钮，面板留着。
    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByRole("menu", { name: "模型" })).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "添加上下文或工具" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "搜索" })).toHaveFocus();
  });

  it("keeps the context popup open for clicks inside it or the composer, and closes it on Escape or an outside click", async () => {
    const user = userEvent.setup();
    renderComposer();
    const outside = document.createElement("button");
    outside.textContent = "外部";
    document.body.append(outside);
    const toggle = screen.getByRole("button", { name: "上下文用量 36%" });

    await user.click(toggle);
    const popup = screen.getByRole("dialog", { name: "上下文用量" });
    expect(popup).toHaveFocus();
    const bucket = popup.querySelector<HTMLButtonElement>(".context-bucket")!;
    await user.click(bucket);
    expect(bucket).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("textbox"));
    expect(screen.getByRole("dialog", { name: "上下文用量" })).toBeInTheDocument();

    await user.click(bucket);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "上下文用量" })).not.toBeInTheDocument();
    await waitFor(() => expect(toggle).toHaveFocus());

    await user.click(toggle);
    expect(screen.getByRole("dialog", { name: "上下文用量" })).toBeInTheDocument();
    await user.click(outside);
    expect(screen.queryByRole("dialog", { name: "上下文用量" })).not.toBeInTheDocument();
    // 点外部关闭不还焦点。Radix 在 setTimeout(0) 里处理关闭后的焦点。
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it("shows edit for deepseek-v4-flash and clicking it does not select another model", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: /deepseek-flash/i }));
    await user.hover(screen.getAllByText("deepseek-flash").at(-1)!);
    await user.click(screen.getByRole("button", { name: "编辑 deepseek-v4-flash 选项" }));

    expect(screen.getByLabelText("deepseek-v4-flash Thinking")).toBeInTheDocument();
    const toolbar = screen.getByLabelText("输入框工具栏");
    expect(toolbar.querySelector(".model-button")).toHaveTextContent("deepseek-flash");
  });

  it("keeps model rows compact and reveals Edit only on row interaction", async () => {
    const user = userEvent.setup();
    const { container } = renderComposer();

    await user.click(screen.getByRole("button", { name: /deepseek-flash/i }));

    const menu = document.querySelector(".model-menu");
    const selectedEdit = screen.getByRole("button", { name: "编辑 deepseek-v4-flash 选项" });
    const selectedRow = selectedEdit.closest(".model-menu-row");

    expect(menu).toHaveClass("w-[244px]");
    expect(selectedRow).toHaveClass("hover:bg-hover-overlay", "focus-within:bg-selected", "is-selected-row");
    expect(selectedRow).not.toHaveClass("bg-hover-overlay");
    expect(selectedEdit).toHaveStyle({ opacity: "0" });

    if (!selectedRow) throw new Error("selected model row was not rendered");
    await user.hover(selectedRow);
    expect(selectedEdit).toHaveStyle({ opacity: "1" });
  });

  it("opens the model menu focused on search, closes on Escape back to the model button, and forgets the search", async () => {
    const user = userEvent.setup();
    renderComposer({ models: reasoningModels, defaultModelId: "deepseek:deepseek-v4-pro" });
    const modelButton = screen.getByRole("button", { name: /deepseek-flash/i });

    await user.click(modelButton);
    expect(modelButton).toHaveAttribute("aria-expanded", "true");
    const search = within(screen.getByRole("menu", { name: "模型" })).getByRole("searchbox", { name: "搜索模型" });
    expect(search).toHaveFocus();
    await user.keyboard("gpt");
    await user.hover(within(screen.getByRole("menu", { name: "模型" })).getByText("GPT-5 High"));
    await user.click(screen.getByRole("button", { name: "编辑 openrouter:openai/gpt-5 选项" }));
    expect(document.querySelector(".model-options-menu")).toBeInTheDocument();
    // 改搜索词会收起 Options（它贴着的那一行可能已经不在了）。
    await user.type(search, "-");
    expect(document.querySelector(".model-options-menu")).not.toBeInTheDocument();
    await user.clear(search);
    await user.hover(within(screen.getByRole("menu", { name: "模型" })).getByText("GPT-5 High"));
    await user.click(screen.getByRole("button", { name: "编辑 openrouter:openai/gpt-5 选项" }));
    expect(document.querySelector(".model-options-menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "模型" })).not.toBeInTheDocument();
    expect(document.querySelector(".model-options-menu")).not.toBeInTheDocument();
    await waitFor(() => expect(modelButton).toHaveFocus());

    await user.click(modelButton);
    expect(within(screen.getByRole("menu", { name: "模型" })).getByRole("searchbox", { name: "搜索模型" })).toHaveValue("");
    expect(document.querySelector(".model-options-menu")).not.toBeInTheDocument();
  });

  it("closes the model menu on an outside click and after picking a model", async () => {
    const user = userEvent.setup();
    renderComposer({ models: reasoningModels, defaultModelId: "deepseek:deepseek-v4-pro" });
    const modelButton = screen.getByRole("button", { name: /deepseek-flash/i });

    await user.click(modelButton);
    await user.click(screen.getByLabelText("消息输入框"));
    expect(screen.queryByRole("menu", { name: "模型" })).not.toBeInTheDocument();

    await user.click(modelButton);
    await user.click(within(screen.getByRole("menu", { name: "模型" })).getByRole("button", { name: "GPT-5 High" }));
    expect(screen.queryByRole("menu", { name: "模型" })).not.toBeInTheDocument();
    expect(modelButton).toHaveTextContent("GPT-5 High");
  });

  it("filters usable models from the search field", async () => {
    const user = userEvent.setup();
    renderComposer({
      models: reasoningModels,
      defaultModelId: "deepseek:deepseek-v4-pro",
    });

    await user.click(screen.getByRole("button", { name: /deepseek-flash/i }));
    const menu = screen.getByRole("menu", { name: "模型" });
    const search = within(menu).getByRole("searchbox", { name: "搜索模型" });
    await user.type(search, "openai/gpt");

    expect(within(menu).getByText("GPT-5 High")).toBeInTheDocument();
    expect(within(menu).queryByText("deepseek-flash")).not.toBeInTheDocument();
    expect(search).toHaveFocus();
  });

  it("groups models by provider and disambiguates duplicate selected labels", async () => {
    const user = userEvent.setup();
    const onSelectedModelChange = vi.fn();
    renderComposer({
      models: duplicateNamedModels,
      defaultModelId: "deepseek:deepseek-v4-pro",
      onSelectedModelChange,
    });

    const modelButton = screen.getByRole("button", { name: /deepseek-flash · DeepSeek/i });
    expect(modelButton).toHaveTextContent("deepseek-flash · DeepSeek");
    await user.click(modelButton);

    const menu = screen.getByRole("menu", { name: "模型" });
    const deepSeekGroup = within(menu).getByRole("group", { name: "DeepSeek" });
    const openRouterGroup = within(menu).getByRole("group", { name: "OpenRouter" });
    expect(within(deepSeekGroup).getByRole("button", { name: "deepseek-flash" })).toBeInTheDocument();
    expect(within(openRouterGroup).getByRole("button", { name: "deepseek-flash" })).toBeInTheDocument();

    await user.click(within(openRouterGroup).getByRole("button", { name: "deepseek-flash" }));
    expect(onSelectedModelChange).toHaveBeenCalledWith("openrouter:deepseek/deepseek-v4-pro");
    expect(modelButton).toHaveTextContent("deepseek-flash · OpenRouter");
  });

  it("groups models from custom connections under their connection name", async () => {
    const user = userEvent.setup();
    renderComposer({
      models: [
        { ...reasoningModels[1], key: "openrouter:openai/gpt-5" },
        { ...reasoningModels[1], key: "openrouter:connection/relay/gpt-5", connectionId: "relay", connectionLabel: "Team Relay" },
      ],
      defaultModelId: "openrouter:openai/gpt-5",
    });
    await user.click(screen.getByRole("button", { name: /GPT-5 High/i }));
    const menu = screen.getByRole("menu", { name: "模型" });
    expect(within(menu).getByRole("group", { name: "OpenRouter" })).toBeInTheDocument();
    expect(within(menu).getByRole("group", { name: "Team Relay" })).toBeInTheDocument();

    // 搜索也匹配分组名和供应商 id。
    const search = within(menu).getByRole("searchbox", { name: "搜索模型" });
    await user.type(search, "team");
    expect(within(menu).queryByRole("group", { name: "OpenRouter" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("group", { name: "Team Relay" })).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "openrouter");
    expect(within(menu).getByRole("group", { name: "OpenRouter" })).toBeInTheDocument();
    expect(within(menu).getByRole("group", { name: "Team Relay" })).toBeInTheDocument();
  });

  it("sends a supported OpenRouter reasoning effort and animates both popovers", async () => {
    const user = userEvent.setup();
    const { onSend, container } = renderComposer({
      models: reasoningModels,
      defaultModelId: "openrouter:openai/gpt-5",
    });

    await user.click(screen.getByRole("button", { name: /GPT-5 High/i }));
    const menu = document.querySelector(".model-menu");
    expect(menu).toHaveClass("duration-(--motion-fast)");

    const modelMenu = screen.getByRole("menu", { name: "模型" });
    await user.hover(within(modelMenu).getByText("GPT-5 High"));
    await user.click(screen.getByRole("button", { name: "编辑 openrouter:openai/gpt-5 选项" }));
    const options = document.querySelector(".model-options-menu");
    expect(options).toHaveClass("duration-(--motion-fast)");
    expect(screen.getByRole("button", { name: "Auto" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "High" }));

    await user.type(screen.getByLabelText("消息输入框"), "reason carefully");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onSend).toHaveBeenCalledWith("reason carefully", {
      mode: "agent",
      model: "openrouter:openai/gpt-5",
      selectedSkills: [],
      thinkingEnabled: true,
      reasoningEffort: "high",
    });
  });

  it("shows only High and Max for DeepSeek and sends Max by default", async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer({
      models: reasoningModels,
      defaultModelId: "deepseek:deepseek-v4-pro",
    });

    await user.click(screen.getByRole("button", { name: /deepseek-flash/i }));
    const modelMenu = screen.getByRole("menu", { name: "模型" });
    await user.hover(within(modelMenu).getByText("deepseek-flash"));
    await user.click(screen.getByRole("button", { name: "编辑 deepseek:deepseek-v4-pro 选项" }));

    expect(screen.queryByRole("button", { name: "Auto" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Max" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Light" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Medium" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("消息输入框"), "use maximum reasoning");
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    expect(onSend).toHaveBeenCalledWith("use maximum reasoning", {
      mode: "agent",
      model: "deepseek:deepseek-v4-pro",
      selectedSkills: [],
      thinkingEnabled: true,
      reasoningEffort: "max",
    });
  });

  it("toggles the Thinking option and reflects it in the track visual", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: /deepseek-flash/i }));
    await user.hover(screen.getAllByText("deepseek-flash").at(-1)!);
    await user.click(screen.getByRole("button", { name: "编辑 deepseek-v4-flash 选项" }));

    const toggle = screen.getByLabelText("deepseek-v4-flash Thinking") as HTMLInputElement;
    const track = toggle.parentElement?.querySelector(".toggle-track");
    expect(toggle.checked).toBe(true);
    expect(track).toHaveClass("bg-toggle-on");

    await user.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(track).not.toHaveClass("bg-toggle-on");

    await user.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(track).toHaveClass("bg-toggle-on");
  });

  it("sends follow-up text with the selected model", async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer();

    await user.type(screen.getByLabelText("消息输入框"), "continue polishing");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onSend).toHaveBeenCalledWith("continue polishing", {
      mode: "agent",
      model: "deepseek-v4-flash",
      selectedSkills: [],
      thinkingEnabled: true,
    });
  });

  it("renders initial composer selectors with the input above the toolbar", async () => {
    const user = userEvent.setup();
    const onSelectWorkspace = vi.fn();
    setupBridge({
      "workspaces.getEnvironment": vi.fn(async () => ({
        workspaceRoot: "/work/actspace-agent",
        workspaceLabel: "actspace-agent",
        locationKind: "worktree" as const,
        git: {
          available: true,
          repository: true,
          branch: "feature/ui",
          branches: [{ name: "feature/ui", current: true }],
          detached: false,
          hasHead: true,
          remotes: [],
        },
      })),
    });
    const { onSend } = renderComposer({
      surface: "initial",
      selectedWorkspaceRoot: "/work/actspace-agent",
      workspaceOptions: [
        { value: "/work/wakeup-Jin-wiki", label: "wakeup-Jin-wiki" },
        { value: "/work/code-tool-work", label: "code-tool-work" },
        { value: "/work/actspace-agent", label: "actspace-agent" },
      ],
      onSelectWorkspace,
      executionContext: {
        runLocation: "this_mac",
        selectedBranch: "main",
        gitContext: {
          status: "ready",
          workspaceRoot: "/work/actspace-agent",
          repositoryRoot: "/work/actspace-agent",
          currentBranch: "main",
          headCommit: "0123456789abcdef",
          branches: [{ name: "main", current: true }],
        },
      },
    });
    const panel = screen.getByLabelText("消息输入面板");
    const toolbar = screen.getByLabelText("输入框工具栏");
    const input = screen.getByLabelText("消息输入框");
    const toolbarButtons = within(toolbar).getAllByRole("button");

    expect(screen.getByLabelText("初始工作区与运行位置选择")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择工作区" })).toHaveTextContent("actspace-agent");
    expect(screen.getByRole("button", { name: "选择分支" })).toHaveTextContent("main");
    expect(screen.getByRole("button", { name: "选择运行位置" })).toHaveTextContent("本机");
    expect(screen.queryByRole("button", { name: "审查待处理变更" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上下文用量 36%" })).not.toBeInTheDocument();
    expect(panel).toContainElement(input);
    expect(toolbar).not.toContainElement(input);
    expect(toolbarButtons[0]).toHaveAccessibleName("添加 Agent、上下文或工具");
    expect(toolbarButtons[1]).toHaveAccessibleName(/deepseek-flash/i);
    expect(within(panel).queryByRole("button", { name: "Show context usage" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择工作区" }));
    const workspaceMenu = screen.getByRole("menu", { name: "选择工作区" });
    expect(within(workspaceMenu).getByRole("menuitemradio", { name: /^wakeup-Jin-wiki/ })).toBeInTheDocument();
    // 名称在第一行，路径是第二行的 faint 小字。
    expect(within(workspaceMenu).getByRole("menuitemradio", { name: /^code-tool-work/ })).toHaveTextContent("/work/code-tool-work");
    await user.click(within(workspaceMenu).getByRole("menuitemradio", { name: /^code-tool-work/ }));
    expect(onSelectWorkspace).toHaveBeenCalledWith("/work/code-tool-work");
    expect(onSend).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "选择分支" }));
    const branchMenu = screen.getByRole("menu", { name: "选择分支" });
    expect(within(branchMenu).getByRole("menuitemradio", { name: "main" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "选择运行位置" }));
    const runtimeMenu = screen.getByRole("menu", { name: "选择运行位置" });
    expect(within(runtimeMenu).getByRole("menuitemradio", { name: "本机" })).toHaveAttribute("aria-checked", "true");
    expect(within(runtimeMenu).getByRole("menuitemradio", { name: /^新建工作树/ })).toHaveTextContent("从 main 创建隔离分支");
    expect(within(runtimeMenu).queryByText("即将推出")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.type(screen.getByLabelText("消息输入框"), "start a new idea");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onSend).toHaveBeenCalledWith("start a new idea", {
      mode: "agent",
      model: "deepseek-v4-flash",
      selectedSkills: [],
      thinkingEnabled: true,
    });
  });

  it("shows an unborn branch name and keeps New Worktree unavailable", async () => {
    const user = userEvent.setup();
    renderComposer({
      surface: "initial",
      selectedWorkspaceRoot: "/work/new-repository",
      workspaceOptions: [{ value: "/work/new-repository", label: "new-repository" }],
      executionContext: {
        runLocation: "this_mac",
        selectedBranch: "main",
        gitContext: {
          status: "no_head",
          workspaceRoot: "/work/new-repository",
          repositoryRoot: "/work/new-repository",
          currentBranch: "main",
          branches: [{ name: "main", current: true }],
        },
      },
    });

    expect(screen.getByRole("button", { name: "选择分支" })).toHaveTextContent("main");
    expect(screen.queryByText("No commits yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择运行位置" }));
    const runtimeMenu = screen.getByRole("menu", { name: "选择运行位置" });
    const worktreeEntry = within(runtimeMenu).getByRole("menuitemradio", { name: /^新建工作树/ });
    expect(worktreeEntry).toHaveAttribute("aria-disabled", "true");
    expect(worktreeEntry).toHaveTextContent("需要先创建提交");
  });
});

it.each([false, true])("sends the configured custom-model default or explicit Auto (auto=%s)", async (auto) => {
  const user = userEvent.setup();
  const model: UsableModelView = { ...reasoningModels[1], key: "openrouter:connection/relay/gpt-model", label: "Relay GPT", capabilities: { ...reasoningModels[1].capabilities, reasoningEfforts: ["low", "high"], reasoningDefaultEffort: "high", reasoningMandatory: true, thinkingToggle: false } };
  const { onSend } = renderComposer({ models: [model], defaultModelId: model.key });
  if (auto) {
    await user.click(screen.getByRole("button", { name: /Relay GPT/ }));
    await user.hover(within(screen.getByRole("menu", { name: "模型" })).getByText("Relay GPT"));
    await user.click(screen.getByRole("button", { name: `编辑 ${model.key} 选项` }));
    expect(screen.queryByRole("button", { name: "Max" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Auto" }));
  }
  await user.type(screen.getByLabelText("消息输入框"), "test");
  await user.click(screen.getByRole("button", { name: "发送消息" }));
  const options = onSend.mock.calls.at(-1)![1];
  expect(options.thinkingEnabled).toBe(true);
  expect(options.reasoningEffort).toBe(auto ? undefined : "high");
});

describe("Composer response annotation pill", () => {
  const first = { annotationId: "ann_1", assistantMessageId: "v2-3", selectedText: "第一段被引用的原文", startOffset: 0, endOffset: 9, prefixContext: "", suffixContext: "" };
  const second = { ...first, annotationId: "ann_2", selectedText: "第二段", startOffset: 20, endOffset: 23, comment: "这里要展开" };

  function renderWithAnnotations(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
    const context = createAnnotationContextValue({ drafts: (overrides.responseAnnotations ?? []) as ResponseAnnotationReference[] });
    const onSend = vi.fn();
    const result = render(
      <TooltipProvider delayDuration={0}>
        <ResponseAnnotationContext.Provider value={context}>
          <Composer contextSnapshot={mockContextSnapshot} onSend={onSend} onAbort={vi.fn()} {...overrides} />
        </ResponseAnnotationContext.Provider>
      </TooltipProvider>,
    );
    return { context, onSend, ...result };
  }

  it("hides the pill without annotations and shows the count when present", () => {
    renderWithAnnotations({ responseAnnotations: [], onResponseAnnotationsChange: vi.fn() });
    expect(screen.queryByRole("button", { name: /条批注/ })).toBeNull();
    cleanup();
    renderWithAnnotations({ responseAnnotations: [first, second], onResponseAnnotationsChange: vi.fn() });
    expect(screen.getByRole("button", { name: "2 条批注" })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a card listing selected text and comments, with edit and delete per item", async () => {
    const user = userEvent.setup();
    const { context } = renderWithAnnotations({ responseAnnotations: [first, second], onResponseAnnotationsChange: vi.fn() });
    await user.click(screen.getByRole("button", { name: "2 条批注" }));
    const card = await screen.findByRole("dialog", { name: "草稿批注" });
    expect(within(card).getAllByRole("listitem")).toHaveLength(2);
    expect(within(card).getByText("第一段被引用的原文")).toBeVisible();
    expect(within(card).getByText("这里要展开")).toBeVisible();

    await user.click(within(card).getByRole("button", { name: "删除第 1 条批注" }));
    expect(context.removeDraft).toHaveBeenCalledWith("ann_1");
    await user.click(within(card).getByRole("button", { name: "编辑第 2 条批注" }));
    expect(context.editAnnotation).toHaveBeenCalledWith("ann_2");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "草稿批注" })).toBeNull());
  });

  it("marks the hovered item active and clears it when the pointer leaves the card", async () => {
    const user = userEvent.setup();
    const { context } = renderWithAnnotations({ responseAnnotations: [first, second], onResponseAnnotationsChange: vi.fn() });
    await user.click(screen.getByRole("button", { name: "2 条批注" }));
    const card = await screen.findByRole("dialog", { name: "草稿批注" });
    fireEvent.pointerEnter(within(card).getAllByRole("listitem")[1]!);
    expect(context.setActiveAnnotationId).toHaveBeenLastCalledWith("ann_2");
    fireEvent.pointerLeave(card);
    expect(context.setActiveAnnotationId).toHaveBeenLastCalledWith(null);
  });

  it("clears all annotations with the corner button", async () => {
    const user = userEvent.setup();
    const onResponseAnnotationsChange = vi.fn();
    renderWithAnnotations({ responseAnnotations: [first, second], onResponseAnnotationsChange });
    await user.click(screen.getByRole("button", { name: "清空全部批注" }));
    expect(onResponseAnnotationsChange).toHaveBeenLastCalledWith([]);
  });

  it("sends annotations without text, includes them in send options and clears them", async () => {
    const onResponseAnnotationsChange = vi.fn();
    const { onSend } = renderWithAnnotations({ responseAnnotations: [first], onResponseAnnotationsChange });
    const send = screen.getByRole("button", { name: "发送消息" });
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(onSend).toHaveBeenCalledWith("", expect.objectContaining({ responseAnnotations: [first] }));
    expect(onResponseAnnotationsChange).toHaveBeenLastCalledWith([]);
  });

  it("shows the limit notice next to the pill", () => {
    renderWithAnnotations({ responseAnnotations: [first], onResponseAnnotationsChange: vi.fn(), responseAnnotationNotice: "最多引用 20 段回复" });
    expect(screen.getByRole("status")).toHaveTextContent("最多引用 20 段回复");
  });
});

it("shows no run-target selectors in a locked remote conversation", () => {
  // 09 T18：对话中运行目标已锁定，不再显示运行位置和工作区的 select（T19 换成只读状态行）。
  const choices = { hosts: [], description: undefined, modelId: "fixture", selectHost: vi.fn(), selectWorkspace: vi.fn(), selectModel: vi.fn() };
  render(
    <RunTargetContext.Provider value={legacyRunTarget({ runTarget: { kind: "remote", hostId: "removed", hostName: "removed", workspaceId: "workspace" }, targetLocked: true, readiness: { state: "removed" }, choices })}>
      <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} surface="followup" executionContext={{ gitContext: null, runLocation: "this_mac" }} /></TooltipProvider>
    </RunTargetContext.Provider>,
  );
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "选择运行位置" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "选择工作区" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "这台机器已从列表移除" })).toHaveAttribute("aria-disabled", "true");
});

describe("Composer follow-up status row", () => {
  // 09 T19：对话中运行目标已锁定，状态行只读：没有下拉，只有 context 入口和权限控件可点。
  const devbox = { id: "dev", hostId: "dev", name: "dev-box", state: "connected" as const, endpoint: { kind: "wss" as const, url: "wss://dev" } };
  const description = { state: "ready", workspaces: [{ id: "api", name: "api-server", path: "/srv/api-server" }], models: [], defaultModel: "m" };
  const choices = { hosts: [devbox], description, modelId: "m", selectHost: vi.fn(), selectWorkspace: vi.fn(), selectModel: vi.fn() };
  const permission = <button type="button" aria-haspopup="menu">请求批准</button>;

  function popupTriggers(row: HTMLElement) {
    return Array.from(row.querySelectorAll("button[aria-haspopup]")).map((button) => button.textContent);
  }

  it("shows branch and 本机 locally, read-only apart from the permission control and context usage", () => {
    renderComposer({ surface: "followup", permissionControl: permission, executionContext: { gitContext: { status: "ready", workspaceRoot: "/work/repo", currentBranch: "main", branches: [{ name: "main", current: true }] }, selectedBranch: "main", runLocation: "this_mac" } });
    const row = screen.getByLabelText("运行位置");
    expect(row).toHaveTextContent(/^main·本机请求批准36%$/);
    expect(popupTriggers(row)).toEqual(["请求批准"]);
    expect(within(row).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual(["请求批准", "上下文用量 36%"]);
  });

  it("shows 工作树 for a worktree session", () => {
    renderComposer({ surface: "followup", executionContext: { gitContext: { status: "ready", workspaceRoot: "/work/repo", currentBranch: "actspace/92803054", branches: [] }, selectedBranch: "actspace/92803054", runLocation: "worktree" } });
    expect(screen.getByLabelText("运行位置")).toHaveTextContent(/^actspace\/92803054·工作树36%$/);
  });

  it("shows the Host and workspace names remotely, with status and path in the Host tooltip", async () => {
    const user = userEvent.setup();
    render(
      <RunTargetContext.Provider value={legacyRunTarget({ runTarget: { kind: "remote", hostId: "dev", hostName: "dev-box", workspaceId: "api", workspaceName: "api-server" }, targetLocked: true, readiness: { state: "ready" }, choices })}>
        <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} surface="followup" permissionControl={permission} executionContext={{ gitContext: null, runLocation: "this_mac" }} /></TooltipProvider>
      </RunTargetContext.Provider>,
    );
    const row = screen.getByLabelText("运行位置");
    expect(row).toHaveTextContent(/^dev-box·api-server请求批准36%$/);
    expect(popupTriggers(row)).toEqual(["请求批准"]);
    await user.hover(within(row).getByText("dev-box"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("已连接 · /srv/api-server");
  });

  it("replaces the workspace with the readiness label and shows — for context usage while the Host is connecting", () => {
    render(
      <RunTargetContext.Provider value={legacyRunTarget({ runTarget: { kind: "remote", hostId: "dev", hostName: "dev-box", workspaceId: "api", workspaceName: "api-server" }, targetLocked: true, readiness: { state: "connecting" }, choices: { ...choices, hosts: [{ ...devbox, state: "connecting" as const }] } })}>
        <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} surface="followup" executionContext={{ gitContext: null, runLocation: "this_mac" }} /></TooltipProvider>
      </RunTargetContext.Provider>,
    );
    const row = screen.getByLabelText("运行位置");
    expect(row).toHaveTextContent(/^dev-box·连接中—$/);
    expect(row.querySelector("[data-tone]")).toHaveAttribute("data-tone", "pending");
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps only context usage in a Chat conversation", () => {
    renderComposer({ surface: "followup", mode: "chat", permissionControl: permission });
    expect(screen.queryByLabelText("运行位置")).not.toBeInTheDocument();
    const usage = screen.getByRole("button", { name: "上下文用量 36%" });
    expect(usage.closest(".composer-status-row")).not.toBeNull();
    expect(screen.queryByText("本机")).not.toBeInTheDocument();
    expect(screen.queryByText("请求批准")).not.toBeInTheDocument();
  });
});

describe("Composer on a remote run target", () => {
  // 15 T6：Composer 按 RunTargetContext 的 target / capabilities 判断，不再读 executionContext.remote。
  const choices = { hosts: [], description: undefined, modelId: "m", selectHost: vi.fn(), selectWorkspace: vi.fn(), selectModel: vi.fn() };
  function renderRemote(props: Partial<Parameters<typeof Composer>[0]> = {}, readiness?: RunTargetReadiness) {
    return render(
      <RunTargetContext.Provider value={legacyRunTarget({ runTarget: { kind: "remote", hostId: "server", hostName: "Cloud" }, targetLocked: true, readiness, choices })}>
        <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} surface="followup" executionContext={{ gitContext: null, runLocation: "this_mac" }} {...props} /></TooltipProvider>
      </RunTargetContext.Provider>,
    );
  }

  it("offers files as well as images in Agent mode", async () => {
    const user = userEvent.setup();
    renderRemote();
    await user.click(screen.getByRole("button", { name: "添加 Agent、上下文或工具" }));
    expect(within(screen.getByRole("listbox", { name: "添加上下文或工具" })).getByRole("option", { name: "图片与文件" })).toBeInTheDocument();
  });

  // 09 T13：远端模型也走 ModelPicker；Host 没连上时按钮禁用，描述没回来时显示「等待 Host 模型」。
  it("shows the Host model button instead of a select, disabled until the Host is connected", () => {
    const { unmount } = renderRemote();
    expect(screen.queryByLabelText("远端模型")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "等待 Host 模型" })).toBeDisabled();
    unmount();

    const connected = { ...choices, hosts: [{ id: "server", hostId: "server", name: "Cloud", state: "connected" as const, endpoint: { kind: "wss" as const, url: "wss://cloud" } }] };
    render(
      <RunTargetContext.Provider value={legacyRunTarget({ runTarget: { kind: "remote", hostId: "server", hostName: "Cloud" }, targetLocked: true, readiness: { state: "describing" }, choices: connected })}>
        <TooltipProvider><Composer contextSnapshot={mockContextSnapshot} surface="followup" executionContext={{ gitContext: null, runLocation: "this_mac" }} /></TooltipProvider>
      </RunTargetContext.Provider>,
    );
    const button = screen.getByRole("button", { name: "等待 Host 模型" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(within(screen.getByRole("menu", { name: "模型" })).getByText("等待 Host 模型")).toBeInTheDocument();
  });

  it("hides the review strip", () => {
    renderRemote({ reviewSummary: { status: "changes", additions: 1, deletions: 1 } });
    expect(screen.queryByLabelText("待处理的审查操作")).not.toBeInTheDocument();
  });

  // 15 T7：远端能否发送只看 readiness；不能时发送按钮说明原因，状态行显示短状态。
  it("sends when the run target is ready", async () => {
    const onSend = vi.fn();
    renderRemote({ onSend }, { state: "ready" });
    fireEvent.change(screen.getByLabelText("消息输入框"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(screen.getByText("Cloud")).toBeInTheDocument();
  });

  it("explains why it cannot send and keeps the draft", () => {
    const onSend = vi.fn();
    renderRemote({ onSend }, { state: "offline" });
    fireEvent.change(screen.getByLabelText("消息输入框"), { target: { value: "hi" } });
    const send = screen.getByRole("button", { name: "Cloud 离线。前往设置重新连接" });
    expect(send).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(send);
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText("消息输入框")).toHaveValue("hi");
    // 09 T19：状态行第二段换成 readiness 短文案，context 用量写「—」。
    const status = screen.getByLabelText("运行位置");
    expect(status).toHaveTextContent("Cloud·离线");
    expect(within(status).getByLabelText("上下文用量暂不可用")).toHaveTextContent("—");
  });

  // 09 T16：发送按钮的禁用和 tooltip 都来自 readiness（06 §4.5 文案）。
  it("shows the readiness reason in the send button tooltip", async () => {
    const user = userEvent.setup();
    const { unmount } = renderRemote({}, { state: "offline" });
    const offline = screen.getByRole("button", { name: "Cloud 离线。前往设置重新连接" });
    expect(offline).toHaveAttribute("aria-disabled", "true");
    await user.hover(offline);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Cloud 离线。前往设置重新连接");
    unmount();

    renderRemote({}, { state: "describe-failed", error: "Error invoking remote method 'host:describe': Error: socket hang up" });
    fireEvent.change(screen.getByLabelText("消息输入框"), { target: { value: "hi" } });
    const failed = screen.getByRole("button", { name: "无法读取机器信息：socket hang up" });
    expect(failed).toHaveAttribute("aria-disabled", "true");
    await user.hover(failed);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("无法读取机器信息：socket hang up");
  });

  it("lets a running task be stopped while the Host is connected but not while it is unreachable", async () => {
    const user = userEvent.setup();
    const onAbort = vi.fn();
    const { unmount } = renderRemote({ isStreaming: true, onAbort }, { state: "describing" });
    fireEvent.click(screen.getByRole("button", { name: "停止 Agent" }));
    expect(onAbort).toHaveBeenCalledTimes(1);
    unmount();

    renderRemote({ isStreaming: true, onAbort }, { state: "offline" });
    const stop = screen.getByRole("button", { name: "Cloud 离线。前往设置重新连接" });
    expect(stop).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(stop);
    expect(onAbort).toHaveBeenCalledTimes(1);
    await user.hover(stop);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Cloud 离线。前往设置重新连接");
  });

  it("pushes the execution configuration to a remote Session only when it is ready", async () => {
    const command = vi.fn(async () => ({ snapshot: { sessionId: "s", revision: 1, paused: false, queue: [], tasks: [], runs: [] } }));
    setupBridge({ "tasks.command": command, "events.hostUploadProgress": () => () => {} });
    const { unmount } = renderRemote({ sessionId: "s" }, { state: "describing" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(command).not.toHaveBeenCalled();
    unmount();
    renderRemote({ sessionId: "s" }, { state: "ready" });
    await waitFor(() => expect(command).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s", op: "configure" })));
  });
});
