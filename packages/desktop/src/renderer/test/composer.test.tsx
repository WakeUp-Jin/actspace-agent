import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComposerAttachment, UsableModelView } from "@actspace/shared";
import { mockContextSnapshot } from "./fixtures/workbenchFixture";
import { Composer } from "../components/Composer";
import { TooltipProvider } from "../components/ui/Tooltip";

type PartialActspaceBridge = Partial<NonNullable<typeof window.actspace>>;

function setPartialActspaceBridge(bridge: PartialActspaceBridge) {
  (window as unknown as { actspace?: PartialActspaceBridge }).actspace = bridge;
}

afterEach(() => {
  delete (window as unknown as { actspace?: unknown }).actspace;
});

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn();
  const onAbort = vi.fn();

  const result = render(
    <TooltipProvider delayDuration={0}>
      <Composer
        contextSnapshot={mockContextSnapshot}
        onSend={onSend}
        onAbort={onAbort}
        {...overrides}
      />
    </TooltipProvider>,
  );

  return { onSend, onAbort, ...result };
}

const reasoningModels: UsableModelView[] = [
  {
    key: "deepseek:deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "deepseek",
    apiModel: "deepseek-v4-pro",
    contextWindow: 1_000_000,
    thinkingDefault: true,
    capabilities: {
      input: ["text"],
      toolUse: "verified",
      reasoning: true,
      thinkingToggle: true,
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
    label: "DeepSeek V4 Pro",
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

const duckCodingModels: UsableModelView[] = [{
  key: "duckcoding:gpt-5.6-sol",
  label: "5.6 Sol",
  provider: "duckcoding",
  apiModel: "gpt-5.6-sol",
  contextWindow: 255_000,
  thinkingDefault: true,
  capabilities: {
    input: ["text"],
    toolUse: "declared",
    reasoning: true,
    thinkingToggle: false,
    reasoningMandatory: true,
    reasoningEfforts: ["low", "medium", "high", "xhigh", "ultra"],
    reasoningDefaultEffort: "medium",
  },
}];

describe("Composer follow-up bar", () => {
  it("renders the follow-up shell with review preview and status row", () => {
    renderComposer({
      reviewSummary: {
        status: "changes",
        additions: 4253,
        deletions: 5,
      },
    });

    const reviewButton = screen.getByRole("button", { name: /Review pending changes/ });
    const reviewOverflowButton = screen.getByRole("button", { name: "More review actions" });
    expect(reviewButton).toHaveTextContent("Review+4253-5");
    expect(reviewButton).toHaveClass("hover:bg-surface-subtle", "hover:border-line-strong", "hover:text-text-main");
    expect(reviewOverflowButton).toHaveClass("hover:bg-surface-subtle", "hover:border-line-strong", "hover:text-text-main");
    expect(screen.getByPlaceholderText("Send follow-up")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Context usage 36%" })).toBeInTheDocument();
  });

  it("hides the review action when no review summary is available", () => {
    renderComposer();

    expect(screen.queryByRole("button", { name: /Review/ })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Send follow-up")).toBeInTheDocument();
  });

  it("keeps image and file attachments in the attachment area above the input bar", async () => {
    const user = userEvent.setup();
    const selectedAttachments: ComposerAttachment[] = [
      {
        id: "selected-image",
        kind: "image",
        name: "screenshot.png",
        path: "/Users/test/screenshot.png",
        mimeType: "image/png",
        previewUrl: "file:///Users/test/screenshot.png",
      },
      {
        id: "selected-file",
        kind: "file",
        name: "README.md",
        path: "/Users/test/README.md",
        mimeType: "text/markdown",
      },
    ];
    const selectFiles = vi.fn(async () => ({ canceled: false, attachments: selectedAttachments }));
    setPartialActspaceBridge({ selectFiles });

    renderComposer();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Attach files" }));

    const panel = screen.getByLabelText("Message composer panel");
    const attachmentList = within(panel).getByLabelText("Attached files");
    const toolbar = screen.getByLabelText("Composer toolbar");
    const input = screen.getByLabelText("Message composer");
    const toolbarButtons = within(toolbar).getAllByRole("button");
    expect(within(attachmentList).getByLabelText("Attached image screenshot.png")).toBeInTheDocument();
    expect(within(attachmentList).getByLabelText("Attached file README.md")).toBeInTheDocument();
    expect(within(attachmentList).getByText("README.md")).toBeInTheDocument();
    expect(panel).toContainElement(attachmentList);
    expect(panel).toContainElement(input);
    expect(toolbar).not.toContainElement(input);
    expect(toolbarButtons[0]).toHaveAccessibleName("Add agents, context, tools");
    expect(toolbarButtons[1]).toHaveAccessibleName(/DeepSeek V4 Pro/i);
    expect(within(panel).queryByRole("button", { name: "Show context usage" })).not.toBeInTheDocument();
    expect(panel).not.toContainElement(screen.queryByRole("button", { name: /Review pending changes/ }));
    expect(input).toHaveValue("");
  });

  // 输入布局对齐 Cursor：单行内容 inline（同一行），内容折行自动切 stacked（控件行贴底），
  // 删回单行再切回 inline；切换只改 grid-template-areas，textarea 不 remount。
  it("switches between inline and stacked layout as content wraps", async () => {
    const user = userEvent.setup();
    renderComposer();

    const panel = screen.getByLabelText("Message composer panel");
    const body = panel.querySelector(".composer-body") as HTMLElement;
    const input = screen.getByLabelText("Message composer") as HTMLTextAreaElement;

    // jsdom 不做真实布局，scrollHeight 恒为 0；用 getter 模拟内容高度。
    let mockScrollHeight = 34;
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      get: () => mockScrollHeight,
    });

    expect(body.dataset.layout).toBe("inline");

    mockScrollHeight = 74;
    await user.click(input);
    await user.paste("line1\nline2\nline3");
    expect(body.dataset.layout).toBe("stacked");

    mockScrollHeight = 34;
    await user.clear(input);
    await user.type(input, "short");
    expect(body.dataset.layout).toBe("inline");

    // 切换过程 textarea 是同一个 DOM 节点（不 remount）
    expect(screen.getByLabelText("Message composer")).toBe(input);
  });

  it("keeps wrapped content stacked when the wider stacked layout would fit on one line", async () => {
    const user = userEvent.setup();
    renderComposer();

    const panel = screen.getByLabelText("Message composer panel");
    const body = panel.querySelector(".composer-body") as HTMLElement;
    const input = screen.getByLabelText("Message composer") as HTMLTextAreaElement;

    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      get: () => {
        // 测量判定时组件会临时写入 inline 宽度；真实 stacked 展示宽度没有 inline style。
        if (input.style.width) return 74;
        return body.dataset.layout === "stacked" ? 34 : 74;
      },
    });

    await user.click(input);
    await user.paste("这段文字在宽的 stacked 输入框里只有一行，但在带模型和发送按钮的 inline 输入框里会折行");

    expect(body.dataset.layout).toBe("stacked");
    expect(input.style.height).toBe("34px");

    // 模拟中文输入法按 Enter 确认候选后 message 再次变化：仍应按 inline 宽度判定，不能缩回 inline。
    await user.type(input, "啦");
    expect(body.dataset.layout).toBe("stacked");
  });

  it("forces stacked layout when attachments exist", async () => {
    const user = userEvent.setup();
    const selectFiles = vi.fn(async () => ({
      canceled: false,
      attachments: [
        { id: "att-1", kind: "file" as const, name: "notes.md", path: "/Users/test/notes.md" },
      ],
    }));
    setPartialActspaceBridge({ selectFiles });
    renderComposer();

    const panel = screen.getByLabelText("Message composer panel");
    const body = panel.querySelector(".composer-body") as HTMLElement;
    expect(body.dataset.layout).toBe("inline");

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Attach files" }));

    expect(body.dataset.layout).toBe("stacked");
  });

  it("renders the send button as an inverse round arrow button", () => {
    renderComposer();

    const sendButton = screen.getByRole("button", { name: "Enter a message to send" });
    expect(sendButton.className).toContain("bg-text-main");
    expect(sendButton.className).toContain("text-surface");
    expect(sendButton.className).not.toContain("bg-operational");
  });

  it("grows the input height to fit pasted multi-line content", async () => {
    const user = userEvent.setup();
    renderComposer();

    const input = screen.getByLabelText("Message composer") as HTMLTextAreaElement;
    // jsdom 不做真实布局，scrollHeight 恒为 0；用 getter 模拟粘贴大段文本后内容撑高。
    let mockScrollHeight = 20;
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      get: () => mockScrollHeight,
    });

    mockScrollHeight = 96;
    await user.click(input);
    await user.paste("line1\nline2\nline3\nline4");

    expect(input.style.height).toBe("96px");
  });

  it("opens the plus command menu with demo agent and capability entries", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));

    const menu = screen.getByRole("menu", { name: "Add agents, context, tools" });
    expect(within(menu).getByText("Add agents, context, tools.")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Plan" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Debug" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Multitask" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Ask" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Attach files" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Image" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Models" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Skills" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "MCP Servers" })).toBeInTheDocument();
  });

  it("shows a tooltip for the add menu button", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.hover(screen.getByRole("button", { name: "Add agents, context, tools" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("添加上下文、工具或附件");
  });

  it("keeps the disabled send button explainable without sending", async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer();

    const sendButton = screen.getByRole("button", { name: "Enter a message to send" });
    expect(sendButton).toHaveAttribute("aria-disabled", "true");

    await user.hover(sendButton);
    expect((await screen.findAllByText("输入消息后发送")).length).toBeGreaterThan(0);
    await user.click(sendButton);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("adds selected files from the Attach files menu", async () => {
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
      {
        id: "selected-file",
        kind: "file",
        name: "notes.md",
        path: "/Users/test/notes.md",
        mimeType: "text/markdown",
      },
    ];
    const selectFiles = vi.fn(async () => ({ canceled: false, attachments }));
    setPartialActspaceBridge({ selectFiles });

    renderComposer();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Attach files" }));

    expect(selectFiles).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Attached image screenshot.png")).toBeInTheDocument();
    expect(screen.getByLabelText("Attached file notes.md")).toBeInTheDocument();
  });

  it("does not add fake attachments when the Electron file bridge is unavailable", async () => {
    const user = userEvent.setup();

    renderComposer();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Attach files" }));

    expect(screen.queryByLabelText("Attached files")).not.toBeInTheDocument();
  });

  it("adds dropped files, removes attachments, and sends only remaining attachments", async () => {
    const user = userEvent.setup();
    const getPathForFile = vi.fn((file: File) => file.name === "photo.png" ? "/Users/test/photo.png" : "/Users/test/report.pdf");
    setPartialActspaceBridge({ getPathForFile });
    const { onSend } = renderComposer();

    const panel = screen.getByLabelText("Message composer panel");
    fireEvent.drop(panel, {
      dataTransfer: {
        files: [
          new File(["image"], "photo.png", { type: "image/png" }),
          new File(["report"], "report.pdf", { type: "application/pdf" }),
        ],
        types: ["Files"],
      },
    });

    expect(screen.getByLabelText("Attached image photo.png")).toBeInTheDocument();
    expect(screen.getByLabelText("Attached file report.pdf")).toBeInTheDocument();

    const removeReport = screen.getByRole("button", { name: "Remove report.pdf" });
    await user.hover(removeReport);
    expect((await screen.findAllByText("移除 report.pdf")).length).toBeGreaterThan(0);

    fireEvent.pointerDown(removeReport);
    expect(screen.queryByLabelText("Attached file report.pdf")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Message composer"), "analyze this");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("analyze this", {
      model: "deepseek-v4-pro",
      thinkingEnabled: true,
      attachments: [
        expect.objectContaining({
          kind: "image",
          name: "photo.png",
          path: "/Users/test/photo.png",
          mimeType: "image/png",
        }),
      ],
    });
    expect(screen.queryByLabelText("Attached image photo.png")).not.toBeInTheDocument();
  });

  it("keeps command menu, model menu, and context popup mutually exclusive", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    expect(screen.getByRole("menu", { name: "Add agents, context, tools" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /DeepSeek V4 Pro/i }));
    expect(screen.queryByRole("menu", { name: "Add agents, context, tools" })).not.toBeInTheDocument();
    expect(screen.getByText("DeepSeek V4 Flash")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Context usage 36%" }));
    expect(screen.queryByText("DeepSeek V4 Flash")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Context usage" })).toBeInTheDocument();
  });

  it("shows edit for deepseek-v4-flash and clicking it does not select another model", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: /DeepSeek V4 Pro/i }));
    await user.hover(screen.getByText("DeepSeek V4 Flash"));
    await user.click(screen.getByRole("button", { name: "Edit deepseek-v4-flash options" }));

    expect(screen.getByLabelText("deepseek-v4-flash Thinking")).toBeInTheDocument();
    const toolbar = screen.getByLabelText("Composer toolbar");
    expect(toolbar.querySelector(".model-button")).toHaveTextContent("DeepSeek V4 Pro");
  });

  it("keeps model rows compact and reveals Edit only on row interaction", async () => {
    const user = userEvent.setup();
    const { container } = renderComposer();

    await user.click(screen.getByRole("button", { name: /DeepSeek V4 Pro/i }));

    const menu = container.querySelector(".model-menu");
    const selectedEdit = screen.getByRole("button", { name: "Edit deepseek-v4-pro options" });
    const selectedRow = selectedEdit.closest(".model-menu-row");

    expect(menu).toHaveClass("w-[244px]");
    expect(selectedRow).toHaveClass("hover:bg-hover-overlay", "focus-within:bg-selected", "is-selected-row");
    expect(selectedRow).not.toHaveClass("bg-hover-overlay");
    expect(selectedEdit).toHaveStyle({ opacity: "0" });

    if (!selectedRow) throw new Error("selected model row was not rendered");
    await user.hover(selectedRow);
    expect(selectedEdit).toHaveStyle({ opacity: "1" });
  });

  it("filters usable models from the search field", async () => {
    const user = userEvent.setup();
    renderComposer({
      models: reasoningModels,
      defaultModelId: "deepseek:deepseek-v4-pro",
    });

    await user.click(screen.getByRole("button", { name: /DeepSeek V4 Pro/i }));
    const menu = screen.getByRole("menu", { name: "Models" });
    const search = within(menu).getByRole("searchbox", { name: "Search models" });
    await user.type(search, "openai/gpt");

    expect(within(menu).getByText("GPT-5 High")).toBeInTheDocument();
    expect(within(menu).queryByText("DeepSeek V4 Pro")).not.toBeInTheDocument();
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

    const modelButton = screen.getByRole("button", { name: /DeepSeek V4 Pro · DeepSeek/i });
    expect(modelButton).toHaveTextContent("DeepSeek V4 Pro · DeepSeek");
    await user.click(modelButton);

    const menu = screen.getByRole("menu", { name: "Models" });
    const deepSeekGroup = within(menu).getByRole("group", { name: "DeepSeek" });
    const openRouterGroup = within(menu).getByRole("group", { name: "OpenRouter" });
    expect(within(deepSeekGroup).getByRole("button", { name: "DeepSeek V4 Pro" })).toBeInTheDocument();
    expect(within(openRouterGroup).getByRole("button", { name: "DeepSeek V4 Pro" })).toBeInTheDocument();

    await user.click(within(openRouterGroup).getByRole("button", { name: "DeepSeek V4 Pro" }));
    expect(onSelectedModelChange).toHaveBeenCalledWith("openrouter:deepseek/deepseek-v4-pro");
    expect(modelButton).toHaveTextContent("DeepSeek V4 Pro · OpenRouter");
  });

  it("sends a supported OpenRouter reasoning effort and animates both popovers", async () => {
    const user = userEvent.setup();
    const { onSend, container } = renderComposer({
      models: reasoningModels,
      defaultModelId: "openrouter:openai/gpt-5",
    });

    await user.click(screen.getByRole("button", { name: /GPT-5 High/i }));
    const menu = container.querySelector(".model-menu");
    expect(menu).toHaveClass("duration-[140ms]");

    const modelMenu = screen.getByRole("menu", { name: "Models" });
    await user.hover(within(modelMenu).getByText("GPT-5 High"));
    await user.click(screen.getByRole("button", { name: "Edit openrouter:openai/gpt-5 options" }));
    const options = container.querySelector(".model-options-menu");
    expect(options).toHaveClass("duration-[140ms]");
    await user.click(screen.getByRole("button", { name: "High" }));

    await user.type(screen.getByLabelText("Message composer"), "reason carefully");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("reason carefully", {
      model: "openrouter:openai/gpt-5",
      thinkingEnabled: true,
      reasoningEffort: "high",
    });
  });

  it("shows DuckCoding's five named effort levels and defaults to Medium", async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer({
      models: duckCodingModels,
      defaultModelId: "duckcoding:gpt-5.6-sol",
    });

    await user.click(screen.getByRole("button", { name: /5\.6 Sol/i }));
    const modelMenu = screen.getByRole("menu", { name: "Models" });
    await user.hover(within(modelMenu).getByText("5.6 Sol"));
    await user.click(screen.getByRole("button", { name: "Edit duckcoding:gpt-5.6-sol options" }));

    expect(screen.queryByRole("button", { name: "Auto" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Medium" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extra High" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ultra" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Message composer"), "use the default effort");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSend).toHaveBeenCalledWith("use the default effort", {
      model: "duckcoding:gpt-5.6-sol",
      thinkingEnabled: true,
      reasoningEffort: "medium",
    });
  });

  it("toggles the Thinking option and reflects it in the track visual", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: /DeepSeek V4 Pro/i }));
    await user.hover(screen.getByText("DeepSeek V4 Flash"));
    await user.click(screen.getByRole("button", { name: "Edit deepseek-v4-flash options" }));

    const toggle = screen.getByLabelText("deepseek-v4-flash Thinking") as HTMLInputElement;
    const track = toggle.parentElement?.querySelector(".toggle-track");
    expect(toggle.checked).toBe(true);
    expect(track).toHaveClass("bg-operational");

    await user.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(track).not.toHaveClass("bg-operational");

    await user.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(track).toHaveClass("bg-operational");
  });

  it("sends follow-up text with the selected model", async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer();

    await user.type(screen.getByLabelText("Message composer"), "continue polishing");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("continue polishing", {
      model: "deepseek-v4-pro",
      thinkingEnabled: true,
    });
  });

  it("renders initial composer selectors with the input above the toolbar", async () => {
    const user = userEvent.setup();
    const onSelectWorkspace = vi.fn();
    setPartialActspaceBridge({
      getWorkspaceEnvironment: vi.fn(async () => ({
        workspaceRoot: "/work/actspace-agent",
        workspaceLabel: "actspace-agent",
        locationKind: "worktree" as const,
        git: { available: true, repository: true, branch: "feature/ui", detached: false, hasHead: true, remotes: [] },
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
    });
    const panel = screen.getByLabelText("Message composer panel");
    const toolbar = screen.getByLabelText("Composer toolbar");
    const input = screen.getByLabelText("Message composer");
    const toolbarButtons = within(toolbar).getAllByRole("button");

    expect(screen.getByLabelText("Initial composer context selectors")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select workspace" })).toHaveTextContent("actspace-agent");
    await waitFor(() => expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("feature/ui"));
    expect(screen.getByRole("button", { name: "Select runtime" })).toHaveTextContent("Local");
    expect(screen.queryByRole("button", { name: "Review pending changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Context usage 36%" })).not.toBeInTheDocument();
    expect(panel).toContainElement(input);
    expect(toolbar).not.toContainElement(input);
    expect(toolbarButtons[0]).toHaveAccessibleName("Add agents, context, tools");
    expect(toolbarButtons[1]).toHaveAccessibleName(/DeepSeek V4 Pro/i);
    expect(within(panel).queryByRole("button", { name: "Show context usage" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select workspace" }));
    const workspaceMenu = screen.getByRole("menu", { name: "actspace-agent options" });
    expect(within(workspaceMenu).getByRole("menuitem", { name: "wakeup-Jin-wiki" })).toBeInTheDocument();
    expect(within(workspaceMenu).getByRole("menuitem", { name: "code-tool-work" })).toBeInTheDocument();
    await user.click(within(workspaceMenu).getByRole("menuitem", { name: "code-tool-work" }));
    expect(onSelectWorkspace).toHaveBeenCalledWith("/work/code-tool-work");
    expect(onSend).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Message composer"), "start a new idea");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("start a new idea", {
      model: "deepseek-v4-pro",
      thinkingEnabled: true,
    });
  });
});
