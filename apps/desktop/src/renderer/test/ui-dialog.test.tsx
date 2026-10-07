import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "../components/ui/Dialog";

// Radix 在 setTimeout(0) 里把焦点还给触发器。
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

function TriggeredDialog({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger>打开</DialogTrigger>
      <DialogContent>
        <DialogTitle>标题</DialogTitle>
        <input aria-label="第一项" />
        <button type="button">第二项</button>
        <DialogClose>关闭</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("focuses the first focusable element, keeps Tab inside and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<><button type="button">外面</button><TriggeredDialog /></>);
    await user.click(screen.getByRole("button", { name: "打开" }));
    const dialog = screen.getByRole("dialog", { name: "标题" });
    expect(screen.getByRole("textbox", { name: "第一项" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "第二项" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("textbox", { name: "第一项" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await settle();
    expect(screen.getByRole("button", { name: "打开" })).toHaveFocus();
  });

  it("honours initialFocus and returnFocus for dialogs rendered without a trigger", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      const second = useRef<HTMLButtonElement>(null);
      const back = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={back}>回到这里</button>
          <button type="button" onClick={() => setOpen(true)}>打开</button>
          {open ? (
            <Dialog open onOpenChange={setOpen}>
              <DialogContent initialFocus={second} returnFocus={back}>
                <DialogTitle>标题</DialogTitle>
                <button type="button">第一项</button>
                <button type="button" ref={second}>第二项</button>
              </DialogContent>
            </Dialog>
          ) : null}
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "打开" }));
    expect(screen.getByRole("button", { name: "第二项" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.getByRole("button", { name: "回到这里" })).toHaveFocus();
  });

  it("returns focus to the element focused before a conditionally rendered dialog opened", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>打开</button>
          {open ? <Dialog open onOpenChange={setOpen}><DialogContent><DialogTitle>标题</DialogTitle><button type="button">里面</button></DialogContent></Dialog> : null}
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "打开" }));
    expect(screen.getByRole("button", { name: "里面" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.getByRole("button", { name: "打开" })).toHaveFocus();
  });

  it("closes only the top dialog on Escape when two are nested", async () => {
    const user = userEvent.setup();
    const outerChange = vi.fn();
    render(
      <Dialog defaultOpen onOpenChange={outerChange}>
        <DialogContent>
          <DialogTitle>外层</DialogTitle>
          <TriggeredDialog />
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "打开" }));
    expect(screen.getByRole("dialog", { name: "标题" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "标题" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "外层" })).toBeInTheDocument();
    expect(outerChange).not.toHaveBeenCalled();
    await settle();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "外层" })).not.toBeInTheDocument();
  });

  it("does not let Escape reach an outer React keydown handler", async () => {
    const user = userEvent.setup();
    const outerKeyDown = vi.fn();
    render(<div onKeyDown={outerKeyDown}><TriggeredDialog /></div>);
    await user.click(screen.getByRole("button", { name: "打开" }));
    outerKeyDown.mockClear();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(outerKeyDown).not.toHaveBeenCalled();
  });

  it("closes on an outside click unless closeOnOutsideClick is false", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const { rerender } = render(<Dialog open onOpenChange={change}><DialogContent><DialogTitle>标题</DialogTitle></DialogContent></Dialog>);
    await user.click(document.querySelector<HTMLElement>("[data-state=open].fixed")!);
    expect(change).toHaveBeenCalledWith(false);
    change.mockClear();
    rerender(<Dialog open onOpenChange={change}><DialogContent closeOnOutsideClick={false}><DialogTitle>标题</DialogTitle></DialogContent></Dialog>);
    await user.click(document.querySelector<HTMLElement>("[data-state=open].fixed")!);
    expect(change).not.toHaveBeenCalled();
  });

  it("renders into body with the requested size and surface", () => {
    const { container } = render(<Dialog open><DialogContent size="xl" surface="raised"><DialogTitle>标题</DialogTitle></DialogContent></Dialog>);
    const dialog = screen.getByRole("dialog", { name: "标题" });
    expect(container).not.toContainElement(dialog);
    expect(dialog).toHaveClass("max-w-[760px]", "rounded-act-lg", "bg-surface-raised");
    expect(dialog).not.toHaveAttribute("aria-describedby");
  });
});

describe("ConfirmDialog", () => {
  it("focuses cancel, keeps the error inside and cannot be dismissed while pending", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    let finish!: (value: string | null) => void;
    const onConfirm = vi.fn(() => new Promise<string | null>((resolve) => { finish = resolve; }));
    render(<ConfirmDialog title="删除连接？" description="不可恢复" confirmLabel="删除" pendingLabel="删除中…" onCancel={onCancel} onConfirm={onConfirm} />);
    const dialog = screen.getByRole("alertdialog", { name: "删除连接？" });
    expect(dialog).toHaveAccessibleDescription("不可恢复");
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("button", { name: "删除中…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => { finish("连接正在使用"); });
    expect(screen.getByRole("alert")).toHaveTextContent("连接正在使用");
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the opener even though cancel takes focus with autoFocus", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>删除</button>
          {open ? <ConfirmDialog title="删除？" description="d" confirmLabel="确认删除" pendingLabel="…" onCancel={() => setOpen(false)} onConfirm={async () => undefined} /> : null}
        </>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "取消" }));
    await settle();
    expect(screen.getByRole("button", { name: "删除" })).toHaveFocus();
  });

  it("does not close on an outside click", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="删除？" description="d" confirmLabel="删除" pendingLabel="…" onCancel={onCancel} onConfirm={async () => undefined} />);
    await user.click(document.querySelector<HTMLElement>("[data-state=open].fixed")!);
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeInTheDocument());
    expect(onCancel).not.toHaveBeenCalled();
  });
});
