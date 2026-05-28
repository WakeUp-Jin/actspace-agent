import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "../components/ui/Sheet";

function Harness({
  onOpenChange,
  initialOpen = true,
}: {
  onOpenChange?: (open: boolean) => void;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>外部触发器</button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title="测试 Sheet"
        description="一段描述"
        testId="test-sheet"
      >
        <button type="button">A</button>
        <button type="button">B</button>
        <button type="button">C</button>
      </Sheet>
    </div>
  );
}

describe("Sheet", () => {
  it("renders the panel only while open and surfaces the title", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog", { name: "测试 Sheet" })).toBeInTheDocument();
    expect(screen.getByText("一段描述")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("closes on overlay click", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByTestId("test-sheet-overlay"));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("closes on the dedicated close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("locks body scroll while open and restores it after close", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "auto";
    render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(document.body.style.overflow).toBe("auto");
  });

  it("traps focus inside the panel when tabbing past the last element", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const closeBtn = screen.getByRole("button", { name: "关闭" });
    const last = screen.getByRole("button", { name: "C" });

    act(() => {
      last.focus();
    });
    expect(document.activeElement).toBe(last);

    await user.tab();
    expect(document.activeElement).toBe(closeBtn);
  });

  it("returns focus to the previously focused element after close", async () => {
    const user = userEvent.setup();
    function FocusReturnHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>触发</button>
          <Sheet open={open} onOpenChange={setOpen} title="t" testId="ret-sheet">
            <button type="button">inside</button>
          </Sheet>
        </div>
      );
    }
    render(<FocusReturnHarness />);
    const trigger = screen.getByRole("button", { name: "触发" });
    trigger.focus();
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(document.activeElement).toBe(trigger);
  });
});
