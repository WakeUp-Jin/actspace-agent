import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonClass } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";

describe("Button", () => {
  it("defaults to a 28px secondary button with the shared focus ring", () => {
    render(<Button>保存</Button>);
    const button = screen.getByRole("button", { name: "保存" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("h-7", "px-2.5", "text-act-sm", "border-line", "bg-surface", "rounded-act-sm");
    expect(button).toHaveClass("focus-visible:outline-2", "focus-visible:outline-focus-ring");
  });

  it("maps variants and sizes to one class each", () => {
    expect(buttonClass({ variant: "primary", size: "xs" })).toContain("bg-action text-on-action");
    expect(buttonClass({ variant: "primary", size: "xs" })).toContain("h-[26px] px-[9px] text-act-xs");
    expect(buttonClass({ variant: "ghost", size: "md" })).toContain("h-8 px-3 text-act-sm");
    expect(buttonClass({ variant: "danger" })).toContain("text-on-danger");
    expect(buttonClass({ variant: "danger-solid" })).toContain("bg-danger text-on-danger-solid");
    expect(buttonClass({ shape: "pill" })).toContain("rounded-act-pill");
    // 同一属性只能出现一个 utility，避免 Tailwind 生成顺序决定结果。
    const sizes = buttonClass({ size: "md" }).match(/(?<![\w:-])text-act-[a-z]+/g) ?? [];
    expect(sizes).toEqual(["text-act-sm"]);
  });

  it("shows a spinner and aria-busy while busy, and blocks clicks when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button busy onClick={onClick}>测试连接</Button>);
    const button = screen.getByRole("button", { name: "测试连接" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();

    rerender(<Button disabled onClick={onClick}>测试连接</Button>);
    await user.click(screen.getByRole("button", { name: "测试连接" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "测试连接" })).toHaveClass("disabled:opacity-50");
  });
});

describe("IconButton", () => {
  it("uses label as the accessible name and default tooltip", async () => {
    const user = userEvent.setup();
    render(
      <IconButton label="添加工作区">
        <Plus aria-hidden="true" />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "添加工作区" });
    expect(button).toHaveClass("size-7", "rounded-act-sm", "text-text-faint");
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("添加工作区");
  });

  it("allows a shorter tooltip, a round shape and no tooltip when the control already has visible text", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <IconButton label="刷新文件列表" tooltip="刷新" size="lg" shape="round" variant="soft">
        <Plus aria-hidden="true" />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "刷新文件列表" });
    expect(button).toHaveClass("size-9", "rounded-act-pill", "bg-surface-subtle");
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("刷新");

    rerender(
      <IconButton label="展开 工作区" tooltip={false}>
        <Plus aria-hidden="true" />
      </IconButton>,
    );
    await user.hover(screen.getByRole("button", { name: "展开 工作区" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("requires a label at the type level", () => {
    // @ts-expect-error label 是必填：没有名字的图标按钮不应通过类型检查。
    const element = <IconButton><Plus aria-hidden="true" /></IconButton>;
    expect(element).toBeTruthy();
  });
});
