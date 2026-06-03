import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComposerAttachment } from "@actspace/shared";
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

describe("Composer follow-up bar", () => {
  it("renders the follow-up shell with review preview and status row", () => {
    renderComposer({
      reviewSummary: {
        status: "changes",
        additions: 4253,
        deletions: 5,
      },
    });

    expect(screen.getByRole("button", { name: /Review pending changes/ })).toHaveTextContent("Review+4253-5");
    expect(screen.getByRole("button", { name: "More review actions" })).toBeInTheDocument();
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
    expect(toolbarButtons[1]).toHaveAccessibleName(/deepseek-v4-pro/);
    expect(within(panel).queryByRole("button", { name: "Show context usage" })).not.toBeInTheDocument();
    expect(panel).not.toContainElement(screen.queryByRole("button", { name: /Review pending changes/ }));
    expect(input).toHaveValue("");
  });

  it("keeps the follow-up input inline when there are no attachments", () => {
    renderComposer();

    const toolbar = screen.getByLabelText("Composer toolbar");
    expect(toolbar).toContainElement(screen.getByLabelText("Message composer"));
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

    await user.click(screen.getByRole("button", { name: /deepseek-v4-pro/ }));
    expect(screen.queryByRole("menu", { name: "Add agents, context, tools" })).not.toBeInTheDocument();
    expect(screen.getByText("deepseek-v4-flash")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Context usage 36%" }));
    expect(screen.queryByText("deepseek-v4-flash")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Context usage" })).toBeInTheDocument();
  });

  it("shows edit for deepseek-v4-flash and clicking it does not select another model", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: /deepseek-v4-pro/ }));
    await user.hover(screen.getByText("deepseek-v4-flash"));
    await user.click(screen.getByRole("button", { name: "Edit deepseek-v4-flash options" }));

    expect(screen.getByLabelText("deepseek-v4-flash Thinking")).toBeInTheDocument();
    const toolbar = screen.getByLabelText("Composer toolbar");
    expect(toolbar.querySelector(".model-button")).toHaveTextContent("deepseek-v4-pro");
  });

  it("toggles the Thinking option and reflects it in the track visual", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: /deepseek-v4-pro/ }));
    await user.hover(screen.getByText("deepseek-v4-flash"));
    await user.click(screen.getByRole("button", { name: "Edit deepseek-v4-flash options" }));

    const toggle = screen.getByLabelText("deepseek-v4-flash Thinking") as HTMLInputElement;
    const track = toggle.parentElement?.querySelector(".toggle-track");
    expect(toggle.checked).toBe(true);
    expect(track).toHaveClass("bg-brand");

    await user.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(track).not.toHaveClass("bg-brand");

    await user.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(track).toHaveClass("bg-brand");
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
    expect(screen.getByRole("button", { name: "Select branch" })).toHaveTextContent("main");
    expect(screen.getByRole("button", { name: "Select runtime" })).toHaveTextContent("Local");
    expect(screen.queryByRole("button", { name: "Review pending changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Context usage 36%" })).not.toBeInTheDocument();
    expect(panel).toContainElement(input);
    expect(toolbar).not.toContainElement(input);
    expect(toolbarButtons[0]).toHaveAccessibleName("Add agents, context, tools");
    expect(toolbarButtons[1]).toHaveAccessibleName(/deepseek-v4-pro/);
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
