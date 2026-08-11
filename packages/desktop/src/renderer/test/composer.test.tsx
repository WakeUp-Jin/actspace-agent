import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComposerAttachment, SkillCatalogItem, UsableModelView } from "@actspace/shared";
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
  const onOpenAttachmentPreview = vi.fn();

  const result = render(
    <TooltipProvider delayDuration={0}>
      <Composer
        contextSnapshot={mockContextSnapshot}
        onSend={onSend}
        onAbort={onAbort}
        onOpenAttachmentPreview={onOpenAttachmentPreview}
        {...overrides}
      />
    </TooltipProvider>,
  );

  return { onSend, onAbort, onOpenAttachmentPreview, ...result };
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
    enabledForKairos: false,
    shadowed: false,
    ...overrides,
  };
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

describe("Composer follow-up bar", () => {
  it("navigates the current session input history from an empty composer", async () => {
    const user = userEvent.setup();
    renderComposer({ inputHistory: ["first prompt", "second prompt"] });
    const input = screen.getByLabelText("Message composer");

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
    const input = screen.getByLabelText("Message composer");

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

    await waitFor(() => expect(screen.getByLabelText("Message composer")).toHaveValue("draft for B"));
  });

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
    expect(screen.queryByText("main")).not.toBeInTheDocument();
    expect(screen.getByText("This Mac")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Context usage 36%" })).toBeInTheDocument();
  });

  it("hides the review action when no review summary is available", () => {
    renderComposer();

    expect(screen.queryByRole("button", { name: /Review/ })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Send follow-up")).toBeInTheDocument();
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
    setPartialActspaceBridge({ selectImages });

    renderComposer();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Image" }));

    const panel = screen.getByLabelText("Message composer panel");
    const attachmentList = within(panel).getByLabelText("Attached files");
    const toolbar = screen.getByLabelText("Composer toolbar");
    const input = screen.getByLabelText("Message composer");
    const toolbarButtons = within(toolbar).getAllByRole("button");
    expect(within(attachmentList).getByLabelText("Attached image screenshot.png")).toBeInTheDocument();
    expect(within(attachmentList).getByRole("button", { name: "Preview attached image screenshot.png" }))
      .toHaveStyle({ backgroundImage: 'url("data:image/png;base64,preview")' });
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
    const selectImages = vi.fn(async () => ({
      canceled: false,
      attachments: [
        { id: "att-1", kind: "image" as const, name: "notes.png", path: "/Users/test/notes.png" },
      ],
    }));
    setPartialActspaceBridge({ selectImages });
    renderComposer();

    const panel = screen.getByLabelText("Message composer panel");
    const body = panel.querySelector(".composer-body") as HTMLElement;
    expect(body.dataset.layout).toBe("inline");

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Image" }));

    expect(body.dataset.layout).toBe("stacked");
  });

  it("renders the send button as an inverse round arrow button", () => {
    renderComposer();

    const sendButton = screen.getByRole("button", { name: "Enter a message to send" });
    expect(sendButton.className).toContain("bg-text-main");
    expect(sendButton.className).toContain("text-surface");
    expect(sendButton.className).not.toContain("bg-operational");
  });

  it("explains why sending is unavailable when no provider model can be used", async () => {
    const user = userEvent.setup();
    renderComposer({
      models: [],
      selectedModelId: "deepseek:deepseek-v4-pro",
    });

    await user.type(screen.getByLabelText("Message composer"), "hello");

    expect(screen.getByText("未连接模型")).toBeInTheDocument();
    const sendButton = screen.getByRole("button", {
      name: "No available model. Open Settings to connect a provider",
    });
    expect(sendButton).toHaveAttribute("aria-disabled", "true");
    await user.hover(sendButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("请先在设置中连接模型服务");
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

  it("opens the plus command menu with modes, Image, and Skills only", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));

    const menu = screen.getByRole("menu", { name: "Add context and tools" });
    expect(within(menu).getByText("Choose mode or add context.")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Chat" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Plan" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Agent" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Image" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Skills" })).toBeInTheDocument();
    expect(within(menu).queryByText(/Debug|Multitask|Ask|MCP Servers|Models|Attach files/)).not.toBeInTheDocument();
  });

  it("opens the slash menu with Functions and workspace Skills", async () => {
    const user = userEvent.setup();
    const listSkills = vi.fn(async () => ({ items: [createSkill()], warnings: [] }));
    setPartialActspaceBridge({ listSkills });
    renderComposer({ selectedWorkspaceRoot: "/work" });

    const input = screen.getByLabelText("Message composer");
    await user.type(input, "/");

    const menu = await screen.findByRole("listbox", { name: "Slash commands" });
    expect(within(menu).getByText("Functions")).toBeInTheDocument();
    const chatCommand = within(menu).getByRole("option", { name: /^chat:/ });
    expect(chatCommand).toHaveTextContent("chatTalk without tools.");
    expect(chatCommand).toHaveClass("min-h-9", "items-center");
    expect(within(chatCommand).queryByText("Chat mode")).not.toBeInTheDocument();
    const compactCommand = within(menu).getByRole("option", { name: /^compact:/ });
    expect(compactCommand.querySelector("svg")).toHaveClass("lucide-asterisk");
    const statusCommand = within(menu).getByRole("option", { name: /^status:/ });
    expect(statusCommand.querySelector("svg")).toHaveClass("lucide-chart-pie");
    const skillOption = await within(menu).findByRole("option", { name: /frontend-design/i });
    expect(skillOption).toHaveClass("min-h-9", "items-center");
    expect(skillOption).toHaveTextContent("frontend-designBuild polished interfaces");
    expect(listSkills).toHaveBeenCalledWith({ workspaceRoot: "/work" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", "composer-slash-command-menu");
    expect(menu).toHaveClass("w-[min(520px,calc(100vw_-_36px))]");
  });

  it("opens the initial Composer slash menu below the input with a viewport-safe height", async () => {
    const user = userEvent.setup();
    renderComposer({ surface: "initial" });

    await user.type(screen.getByLabelText("Message composer"), "/");

    const menu = await screen.findByRole("listbox", { name: "Slash commands" });
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
    setPartialActspaceBridge({ listSkills });
    const { rerender } = renderComposer({ selectedWorkspaceRoot: "/work/a" });

    await user.type(screen.getByLabelText("Message composer"), "/");
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
    const input = screen.getByLabelText("Message composer");

    await user.type(input, "/");
    expect(input).toHaveAttribute("aria-activedescendant", "composer-slash-function-chat");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onModeChange).toHaveBeenCalledWith("plan");
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeInTheDocument();
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
    setPartialActspaceBridge({
      listSkills: vi.fn(async () => ({ items: [], warnings: [] })),
      selectImages: vi.fn(async () => ({ canceled: false, attachments })),
    });
    const { onSend } = renderComposer({ selectedSkills: ["frontend-design"] });

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Image" }));
    expect(screen.getByLabelText("Attached image screenshot.png")).toBeInTheDocument();

    const input = screen.getByLabelText("Message composer");
    await user.type(input, "/compact");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("/compact", {
      mode: "agent",
      model: "deepseek-v4-pro",
      selectedSkills: ["frontend-design"],
      thinkingEnabled: true,
    });
    expect(screen.getByLabelText("Attached image screenshot.png")).toBeInTheDocument();
    expect(screen.getByLabelText("Selected Skill frontend-design")).toBeInTheDocument();
  });

  it("completes eval for a failure reason instead of running it immediately", async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer();
    const input = screen.getByLabelText("Message composer");

    await user.type(input, "/eval");
    await user.keyboard("{Enter}");

    expect(input).toHaveValue("/eval ");
    expect(onSend).not.toHaveBeenCalled();
    await user.type(input, "tool output was incomplete");
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("/eval tool output was incomplete", expect.objectContaining({
      mode: "agent",
      selectedSkills: [],
    }));
  });

  it("opens Context and Review from slash functions and binds a filtered Skill", async () => {
    const user = userEvent.setup();
    const onExpandContext = vi.fn();
    const onOpenReview = vi.fn();
    const onSelectedSkillsChange = vi.fn();
    setPartialActspaceBridge({ listSkills: vi.fn(async () => ({ items: [createSkill()], warnings: [] })) });
    renderComposer({ onExpandContext, onOpenReview, onSelectedSkillsChange });
    const input = screen.getByLabelText("Message composer");

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
    const input = screen.getByLabelText("Message composer");

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

    expect(screen.queryByRole("button", { name: /Agent mode/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Plan" }));
    expect(onModeChange).toHaveBeenCalledWith("plan");

    rerender(
      <TooltipProvider delayDuration={0}>
        <Composer contextSnapshot={mockContextSnapshot} mode="plan" onModeChange={onModeChange} />
      </TooltipProvider>,
    );
    const planPill = screen.getByRole("button", { name: "Remove Plan mode" });
    expect(planPill).toHaveClass("bg-warning-soft", "text-on-warning");
    expect(screen.getByPlaceholderText("Refine the plan...")).toBeInTheDocument();
    await user.click(planPill);
    expect(onModeChange).toHaveBeenLastCalledWith("agent");
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
      enabledForKairos: false,
      shadowed: false,
    };
    const listSkills = vi.fn(async () => ({ items: [skill], warnings: [] }));
    setPartialActspaceBridge({ listSkills });

    const { rerender } = renderComposer({
      selectedWorkspaceRoot: "/work",
      selectedSkills: [],
      onSelectedSkillsChange,
    });
    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.hover(screen.getByRole("menuitem", { name: "Skills" }));
    const skillsMenu = await screen.findByRole("menu", { name: "Skills" });
    await user.click(within(skillsMenu).getByRole("menuitemcheckbox", { name: /frontend-design/i }));
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
    expect(screen.getByLabelText("Selected Skill frontend-design")).toBeInTheDocument();
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
    setPartialActspaceBridge({ selectImages });

    renderComposer();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Image" }));

    expect(selectImages).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Attached image screenshot.png")).toBeInTheDocument();
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
    setPartialActspaceBridge({
      selectImages: vi.fn(async () => ({ canceled: false, attachments: [attachment] })),
    });
    const { onOpenAttachmentPreview } = renderComposer();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Image" }));
    await user.click(screen.getByRole("button", { name: "Preview attached image screenshot.png" }));

    expect(onOpenAttachmentPreview).toHaveBeenCalledWith(attachment);
    expect(screen.getByRole("button", { name: "Remove screenshot.png" })).toHaveClass("h-[18px]", "w-[18px]");
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
    setPartialActspaceBridge({ importComposerImage });
    const { onSend } = renderComposer();
    const input = screen.getByLabelText("Message composer");
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
    expect(await screen.findByLabelText("Attached image pasted-image.png")).toBeInTheDocument();
    await userEvent.type(input, "看看这张图");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("看看这张图", expect.objectContaining({
      model: "deepseek-v4-pro",
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

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    await user.click(screen.getByRole("menuitem", { name: "Image" }));

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

    const removePhoto = screen.getByRole("button", { name: "Remove photo.png" });
    await user.hover(removePhoto);
    expect((await screen.findAllByText("移除 photo.png")).length).toBeGreaterThan(0);

    await user.click(removePhoto);
    expect(screen.queryByLabelText("Attached image photo.png")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Message composer"), "analyze this");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("analyze this", {
      mode: "agent",
      model: "deepseek-v4-pro",
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
    expect(screen.queryByLabelText("Attached file report.pdf")).not.toBeInTheDocument();
  });

  it("keeps command menu, model menu, and context popup mutually exclusive", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByLabelText("Message composer"), "/");
    expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add agents, context, tools" }));
    expect(screen.queryByRole("listbox", { name: "Slash commands" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Add context and tools" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /DeepSeek V4 Pro/i }));
    expect(screen.queryByRole("menu", { name: "Add context and tools" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Auto" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "High" }));

    await user.type(screen.getByLabelText("Message composer"), "reason carefully");
    await user.click(screen.getByRole("button", { name: "Send message" }));

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

    await user.click(screen.getByRole("button", { name: /DeepSeek V4 Pro/i }));
    const modelMenu = screen.getByRole("menu", { name: "Models" });
    await user.hover(within(modelMenu).getByText("DeepSeek V4 Pro"));
    await user.click(screen.getByRole("button", { name: "Edit deepseek:deepseek-v4-pro options" }));

    expect(screen.queryByRole("button", { name: "Auto" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Max" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Light" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Medium" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Message composer"), "use maximum reasoning");
    await user.click(screen.getByRole("button", { name: "Send message" }));
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
      mode: "agent",
      model: "deepseek-v4-pro",
      selectedSkills: [],
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
    const panel = screen.getByLabelText("Message composer panel");
    const toolbar = screen.getByLabelText("Composer toolbar");
    const input = screen.getByLabelText("Message composer");
    const toolbarButtons = within(toolbar).getAllByRole("button");

    expect(screen.getByLabelText("Initial composer context selectors")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select workspace" })).toHaveTextContent("actspace-agent");
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("main");
    expect(screen.getByRole("button", { name: "Select runtime" })).toHaveTextContent("This Mac");
    expect(screen.queryByRole("button", { name: "Review pending changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Context usage 36%" })).not.toBeInTheDocument();
    expect(panel).toContainElement(input);
    expect(toolbar).not.toContainElement(input);
    expect(toolbarButtons[0]).toHaveAccessibleName("Add agents, context, tools");
    expect(toolbarButtons[1]).toHaveAccessibleName(/DeepSeek V4 Pro/i);
    expect(within(panel).queryByRole("button", { name: "Show context usage" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select workspace" }));
    const workspaceMenu = screen.getByRole("menu", { name: "actspace-agent options" });
    expect(screen.getByLabelText("Initial composer context selectors")).toHaveClass("overflow-visible");
    expect(workspaceMenu).toHaveClass("top-[calc(100%_+_8px)]");
    expect(within(workspaceMenu).getByRole("menuitem", { name: "wakeup-Jin-wiki" })).toBeInTheDocument();
    expect(within(workspaceMenu).getByRole("menuitem", { name: "code-tool-work" })).toBeInTheDocument();
    await user.click(within(workspaceMenu).getByRole("menuitem", { name: "code-tool-work" }));
    expect(onSelectWorkspace).toHaveBeenCalledWith("/work/code-tool-work");
    expect(onSend).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Select branch" }));
    const branchMenu = screen.getByRole("menu", { name: "Branch options" });
    expect(branchMenu).toHaveClass("top-[calc(100%_+_8px)]");
    expect(within(branchMenu).getByRole("menuitemradio", { name: "main" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select runtime" }));
    const runtimeMenu = screen.getByRole("menu", { name: "Run on options" });
    expect(runtimeMenu).toHaveClass("top-[calc(100%_+_8px)]");
    expect(within(runtimeMenu).getByRole("menuitemradio", { name: "This Mac" })).toBeInTheDocument();
    expect(within(runtimeMenu).getByRole("menuitemradio", { name: "New Worktree" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Message composer"), "start a new idea");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("start a new idea", {
      mode: "agent",
      model: "deepseek-v4-pro",
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

    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("main");
    expect(screen.queryByText("No commits yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select runtime" }));
    const runtimeMenu = screen.getByRole("menu", { name: "Run on options" });
    const worktreeEntry = within(runtimeMenu).getByRole("menuitem", { name: /New Worktree Requires commit/i });
    expect(worktreeEntry).toBeDisabled();
  });
});
