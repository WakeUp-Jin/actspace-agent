import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockContextSnapshot } from "../fixtures/workbenchFixture";
import { Composer } from "../components/Composer";

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn();
  const onAbort = vi.fn();

  const result = render(
    <Composer
      contextSnapshot={mockContextSnapshot}
      onSend={onSend}
      onAbort={onAbort}
      {...overrides}
    />,
  );

  return { onSend, onAbort, ...result };
}

describe("Composer follow-up bar", () => {
  it("renders the follow-up shell with review preview and status row", () => {
    renderComposer();

    expect(screen.getByRole("button", { name: "Review pending changes" })).toHaveTextContent("Review+4253-5");
    expect(screen.getByRole("button", { name: "More review actions" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Send follow-up")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Context usage 36%" })).toBeInTheDocument();
  });

  it("keeps image and file attachments in the attachment area above the input bar", () => {
    renderComposer({ showDemoAttachments: true });

    const panel = screen.getByLabelText("Message composer panel");
    const attachments = within(panel).getByLabelText("Attached files");
    const toolbar = screen.getByLabelText("Composer toolbar");
    const input = screen.getByLabelText("Message composer");
    const toolbarButtons = within(toolbar).getAllByRole("button");
    expect(within(attachments).getByLabelText("Attached image preview")).toBeInTheDocument();
    expect(within(attachments).getByLabelText("Attached file README.md")).toBeInTheDocument();
    expect(within(attachments).getByText("README.md")).toBeInTheDocument();
    expect(panel).toContainElement(attachments);
    expect(panel).toContainElement(input);
    expect(toolbar).not.toContainElement(input);
    expect(toolbarButtons[0]).toHaveAccessibleName("Add agents, context, tools");
    expect(toolbarButtons[1]).toHaveAccessibleName(/deepseek-v4-pro/);
    expect(within(panel).queryByRole("button", { name: "Show context usage" })).not.toBeInTheDocument();
    expect(panel).not.toContainElement(screen.getByRole("button", { name: "Review pending changes" }));
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
    expect(within(menu).getByRole("menuitem", { name: "Image" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Models" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Skills" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "MCP Servers" })).toBeInTheDocument();
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
    const { onSend } = renderComposer({ surface: "initial" });
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

    await user.type(screen.getByLabelText("Message composer"), "start a new idea");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("start a new idea", {
      model: "deepseek-v4-pro",
      thinkingEnabled: true,
    });
  });
});
