import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LabPage } from "../components/LabPage";

describe("LabPage", () => {
  it("renders the four experiment stages with initial cards", () => {
    render(<LabPage />);

    expect(screen.getByLabelText("Lab 实验台")).toBeInTheDocument();
    expect(screen.getByLabelText("假说构建")).toBeInTheDocument();
    expect(screen.getByLabelText("实证验证")).toBeInTheDocument();
    expect(screen.getByLabelText("能力锻造")).toBeInTheDocument();
    expect(screen.getByLabelText("晋升评审")).toBeInTheDocument();
    expect(screen.getByText("让 Agent 锻造 Rust CLI")).toBeInTheDocument();
    expect(screen.getByText("3 组样例验证")).toBeInTheDocument();
    expect(screen.getByText("act-log-scan")).toBeInTheDocument();
    expect(screen.getByText("候选 CLI 晋升")).toBeInTheDocument();
  });

  it("creates a draft experiment in the hypothesis stage", async () => {
    const user = userEvent.setup();
    render(<LabPage />);

    await user.click(screen.getByRole("button", { name: "新实验" }));
    const dialog = screen.getByRole("dialog", { name: "新实验" });
    await user.type(within(dialog).getByLabelText("标题"), "验证 Lab Tailwind mock");
    await user.type(within(dialog).getByLabelText("问题 / 想法"), "把实验台 UI 切到 Tailwind utility 后保持交互闭环。");
    await user.click(within(dialog).getByRole("button", { name: "创建" }));

    const hypothesis = screen.getByLabelText("假说构建");
    expect(within(hypothesis).getByText("6")).toBeInTheDocument();
    expect(within(hypothesis).getByText("验证 Lab Tailwind mock")).toBeInTheDocument();

    await user.click(within(hypothesis).getByText("验证 Lab Tailwind mock"));
    expect(screen.getByText("把实验台 UI 切到 Tailwind utility 后保持交互闭环。")).toBeInTheDocument();
  });

  it("opens card detail and exposes the more menu actions", async () => {
    const user = userEvent.setup();
    render(<LabPage />);

    await user.click(screen.getByText("让 Agent 锻造 Rust CLI"));

    const dialog = screen.getByRole("dialog", { name: "让 Agent 锻造 Rust CLI" });
    expect(within(dialog).getByText("能力缺口")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "进入实证验证" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "更多操作" }));
    expect(within(dialog).getByRole("menuitem", { name: "暂停" })).toBeInTheDocument();
    expect(within(dialog).getByRole("menuitem", { name: "取消" })).toBeInTheDocument();
  });

  it("advances a hypothesis card into verification", async () => {
    const user = userEvent.setup();
    render(<LabPage />);

    await user.click(screen.getByText("让 Agent 锻造 Rust CLI"));
    await user.click(screen.getByRole("button", { name: "进入实证验证" }));

    const hypothesis = screen.getByLabelText("假说构建");
    const verification = screen.getByLabelText("实证验证");
    expect(within(hypothesis).getByText("4")).toBeInTheDocument();
    expect(within(verification).getByText("4")).toBeInTheDocument();
    expect(within(verification).getByText("让 Agent 锻造 Rust CLI")).toBeInTheDocument();
  });

  it("shows completed experiments and records cancelled cards", async () => {
    const user = userEvent.setup();
    render(<LabPage />);

    await user.click(screen.getByText("失败任务沉淀 skill"));
    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "已完成实验" }));
    const dialog = screen.getByRole("dialog", { name: "已完成实验" });
    expect(within(dialog).getByText("Frontend Verification")).toBeInTheDocument();
    expect(within(dialog).getAllByText("已废弃").length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole("tab", { name: "已晋升" }));
    expect(within(dialog).getByText("让 Agent 锻造 Rust CLI")).toBeInTheDocument();
    expect(within(dialog).queryByText("web_search 证据质量评估")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "查看 让 Agent 锻造 Rust CLI" }));
    expect(within(dialog).getByLabelText("让 Agent 锻造 Rust CLI 详情")).toBeInTheDocument();
  });
});
