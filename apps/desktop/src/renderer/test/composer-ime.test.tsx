import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../components/Composer";
import { TooltipProvider } from "../components/ui/Tooltip";

// 输入法组字时（isComposing，或 Safari / 部分 Chromium 只给的 keyCode 229），按键都交给输入法。
const COMPOSING_FLAGS = [
  ["isComposing", { isComposing: true }],
  ["keyCode 229", { keyCode: 229 }],
] as const;

function renderComposer(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn();
  const onModeChange = vi.fn();
  render(
    <TooltipProvider delayDuration={0}>
      <Composer contextSnapshot={null} onSend={onSend} onModeChange={onModeChange} inputHistory={["older prompt"]} {...props} />
    </TooltipProvider>,
  );
  return { onSend, onModeChange, input: screen.getByRole("textbox", { name: "消息输入框" }) };
}

describe("Composer IME composition", () => {
  it.each(COMPOSING_FLAGS)("does not switch to Plan on Shift+Tab while composing (%s)", (_name, flags) => {
    const { onModeChange, input } = renderComposer();
    fireEvent.keyDown(input, { key: "Tab", code: "Tab", shiftKey: true, ...flags });
    expect(onModeChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Tab", code: "Tab", shiftKey: true });
    expect(onModeChange).toHaveBeenCalledWith("plan");
  });

  it.each(COMPOSING_FLAGS)("does not move the slash selection on ↑↓ while composing (%s)", async (_name, flags) => {
    const user = userEvent.setup();
    const { input } = renderComposer();
    await user.type(input, "/");
    const first = input.getAttribute("aria-activedescendant");
    expect(first).toBeTruthy();

    fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown", ...flags });
    expect(input).toHaveAttribute("aria-activedescendant", first!);
    fireEvent.keyDown(input, { key: "ArrowUp", code: "ArrowUp", ...flags });
    expect(input).toHaveAttribute("aria-activedescendant", first!);

    fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).not.toBe(first);
  });

  it.each(COMPOSING_FLAGS)("keeps the slash menu open on Escape while composing (%s)", async (_name, flags) => {
    const user = userEvent.setup();
    const { input } = renderComposer();
    await user.type(input, "/");
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "Escape", code: "Escape", ...flags });
    expect(input).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it.each(COMPOSING_FLAGS)("does not walk input history on ↑ while composing (%s)", (_name, flags) => {
    const { input } = renderComposer();
    fireEvent.keyDown(input, { key: "ArrowUp", code: "ArrowUp", ...flags });
    expect(input).toHaveValue("");
  });

  it.each(COMPOSING_FLAGS)("does not send on Enter while composing (%s)", async (_name, flags) => {
    const user = userEvent.setup();
    const { onSend, input } = renderComposer();
    await user.type(input, "你好");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", ...flags });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onSend).toHaveBeenCalledWith("你好", expect.anything());
  });

  it("does not send on Shift+Enter", async () => {
    const user = userEvent.setup();
    const { onSend, input } = renderComposer();
    await user.type(input, "第一行");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});
