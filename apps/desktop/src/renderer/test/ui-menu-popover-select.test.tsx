import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../components/ui/ContextMenu";
import {
  Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger,
} from "../components/ui/Menu";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../components/ui/Popover";
import { Select } from "../components/ui/Select";

// Radix 在 setTimeout(0) 里把焦点还给触发器。
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

function ActionMenu({ onSelect }: { onSelect: (label: string) => void }) {
  return (
    <Menu>
      <MenuTrigger>操作</MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => onSelect("复制")}>复制</MenuItem>
        <MenuItem onSelect={() => onSelect("重命名")}>重命名</MenuItem>
        <MenuItem disabled onSelect={() => onSelect("归档")}>归档</MenuItem>
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger>移动到</MenuSubTrigger>
          <MenuSubContent>
            <MenuItem onSelect={() => onSelect("api")}>api</MenuItem>
            <MenuItem onSelect={() => onSelect("web")}>web</MenuItem>
          </MenuSubContent>
        </MenuSub>
        <MenuItem danger onSelect={() => onSelect("删除")}>删除</MenuItem>
      </MenuContent>
    </Menu>
  );
}

describe("Menu", () => {
  it("moves with arrows, Home and End, skips disabled items and runs the item on Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ActionMenu onSelect={onSelect} />);
    screen.getByRole("button", { name: "操作" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "复制" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "重命名" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "移动到" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "删除" })).toHaveFocus();
    expect(screen.getByRole("menuitem", { name: "删除" })).toHaveClass("text-danger");
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "复制" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("重命名");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await settle();
    expect(screen.getByRole("button", { name: "操作" })).toHaveFocus();
  });

  it("opens a submenu with ArrowRight and returns with ArrowLeft", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ActionMenu onSelect={onSelect} />);
    screen.getByRole("button", { name: "操作" }).focus();
    await user.keyboard("{ArrowDown}{End}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "移动到" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menuitem", { name: "api" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: "移动到" })).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("web");
  });

  it("jumps to an item by its first letter", async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger>文件</MenuTrigger>
        <MenuContent>
          <MenuItem>Copy</MenuItem>
          <MenuItem>Rename</MenuItem>
          <MenuItem>Delete</MenuItem>
        </MenuContent>
      </Menu>,
    );
    screen.getByRole("button", { name: "文件" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("d");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });

  it("closes on Escape, returns focus to the trigger and keeps Escape away from outer handlers", async () => {
    const user = userEvent.setup();
    const outerKeyDown = vi.fn();
    render(<div onKeyDown={outerKeyDown}><ActionMenu onSelect={() => {}} /></div>);
    await user.click(screen.getByRole("button", { name: "操作" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    outerKeyDown.mockClear();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(outerKeyDown).not.toHaveBeenCalled();
    await settle();
    expect(screen.getByRole("button", { name: "操作" })).toHaveFocus();
  });

  it("keeps the menu open while toggling a checkbox item when asked to", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [checked, setChecked] = useState(false);
      return (
        <Menu>
          <MenuTrigger>筛选</MenuTrigger>
          <MenuContent>
            <MenuCheckboxItem checked={checked} onCheckedChange={setChecked} onSelect={(event) => event.preventDefault()}>只看未读</MenuCheckboxItem>
          </MenuContent>
        </Menu>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "筛选" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "只看未读" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "只看未读" })).toHaveAttribute("aria-checked", "true");
  });

  it("lets a click outside fall through to the element underneath", async () => {
    const user = userEvent.setup();
    const outside = vi.fn();
    render(<><button type="button" onClick={outside}>外面</button><ActionMenu onSelect={() => {}} /></>);
    await user.click(screen.getByRole("button", { name: "操作" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "外面" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(outside).toHaveBeenCalledTimes(1);
  });
});

describe("ContextMenu", () => {
  it("opens on right click and runs the chosen item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ContextMenu>
        <ContextMenuTrigger asChild><div>会话 A</div></ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onSelect("重命名")}>重命名</ContextMenuItem>
          <ContextMenuItem onSelect={() => onSelect("删除")}>删除</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByText("会话 A"), { clientX: 40, clientY: 60 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("删除");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("lets a click outside fall through like Menu", async () => {
    const user = userEvent.setup();
    const outside = vi.fn();
    render(
      <>
        <button type="button" onClick={outside}>外面</button>
        <ContextMenu>
          <ContextMenuTrigger asChild><div>会话 A</div></ContextMenuTrigger>
          <ContextMenuContent><ContextMenuItem>重命名</ContextMenuItem></ContextMenuContent>
        </ContextMenu>
      </>,
    );
    fireEvent.contextMenu(screen.getByText("会话 A"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "外面" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(outside).toHaveBeenCalledTimes(1);
  });
});

describe("Popover", () => {
  it("positions against a virtual anchor", async () => {
    const rect = { x: 120, y: 80, top: 80, left: 120, right: 220, bottom: 96, width: 100, height: 16, toJSON: () => ({}) };
    const getBoundingClientRect = vi.fn(() => rect as DOMRect);
    render(
      <Popover open>
        <PopoverAnchor virtualRef={{ current: { getBoundingClientRect } }} />
        <PopoverContent aria-label="选区操作">选区</PopoverContent>
      </Popover>,
    );
    expect(screen.getByText("选区")).toBeInTheDocument();
    await waitFor(() => expect(getBoundingClientRect).toHaveBeenCalled());
  });

  it("closes on Escape without reaching outer handlers and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const outerKeyDown = vi.fn();
    render(
      <div onKeyDown={outerKeyDown}>
        <Popover>
          <PopoverTrigger>详情</PopoverTrigger>
          <PopoverContent aria-label="详情浮层"><button type="button">里面</button></PopoverContent>
        </Popover>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "详情" }));
    expect(screen.getByRole("button", { name: "里面" })).toHaveFocus();
    outerKeyDown.mockClear();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "详情浮层" })).not.toBeInTheDocument();
    expect(outerKeyDown).not.toHaveBeenCalled();
    await settle();
    expect(screen.getByRole("button", { name: "详情" })).toHaveFocus();
  });

  it("closes only the inner menu when Escape is pressed inside a popover", async () => {
    const user = userEvent.setup();
    const popoverChange = vi.fn();
    render(
      <Popover onOpenChange={popoverChange}>
        <PopoverTrigger>环境</PopoverTrigger>
        <PopoverContent aria-label="环境浮层">
          <ActionMenu onSelect={() => {}} />
        </PopoverContent>
      </Popover>,
    );
    await user.click(screen.getByRole("button", { name: "环境" }));
    expect(screen.getByRole("dialog", { name: "环境浮层" })).toBeInTheDocument();
    popoverChange.mockClear();
    await user.click(screen.getByRole("button", { name: "操作" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "环境浮层" })).toBeInTheDocument();
    expect(popoverChange).not.toHaveBeenCalled();
    await settle();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "环境浮层" })).not.toBeInTheDocument();
    await settle();
    expect(screen.getByRole("button", { name: "环境" })).toHaveFocus();
  });
});

describe("Select", () => {
  const options = [
    { value: "", label: "跟随默认" },
    { value: "a", label: "Alpha", group: "常用" },
    { value: "b", label: "Beta", group: "常用" },
    { value: "c", label: "Gamma", group: "其他", disabled: true },
  ];

  it("selects with the keyboard and reports the value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select ariaLabel="模型" value="a" options={options} onValueChange={onValueChange} />);
    const trigger = screen.getByRole("combobox", { name: "模型" });
    expect(trigger).toHaveTextContent("Alpha");
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveFocus();
    expect(screen.getByText("常用")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await settle();
    expect(trigger).toHaveFocus();
  });

  it("supports an empty-string option and shows the placeholder for unknown values", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<Select ariaLabel="模型" value="zzz" placeholder="未选择" options={options} onValueChange={onValueChange} />);
    expect(screen.getByRole("combobox", { name: "模型" })).toHaveTextContent("未选择");
    await user.click(screen.getByRole("combobox", { name: "模型" }));
    await user.click(screen.getByRole("option", { name: "跟随默认" }));
    expect(onValueChange).toHaveBeenCalledWith("");
    rerender(<Select ariaLabel="模型" value="" options={options} onValueChange={onValueChange} />);
    expect(screen.getByRole("combobox", { name: "模型" })).toHaveTextContent("跟随默认");
  });

  it("closes on Escape without reaching outer handlers and returns focus to the trigger", async () => {
    // 设置表单外层用 onKeyDown 监听 Esc 返回上一步；在下拉里按 Esc 只该收起下拉。
    const user = userEvent.setup();
    const outerKeyDown = vi.fn();
    render(<div onKeyDown={outerKeyDown}><Select ariaLabel="模型" value="a" options={options} onValueChange={() => {}} /></div>);
    const trigger = screen.getByRole("combobox", { name: "模型" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    outerKeyDown.mockClear();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(outerKeyDown).not.toHaveBeenCalled();
    await settle();
    expect(trigger).toHaveFocus();
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    render(<Select ariaLabel="模型" value="a" disabled options={options} onValueChange={() => {}} />);
    await user.click(screen.getByRole("combobox", { name: "模型" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
