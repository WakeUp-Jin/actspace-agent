import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LabPage } from "../components/LabPage";

async function createDraftExperiment(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
  idea = "把实验台 UI 切到真实空态后保持本地交互闭环。",
) {
  await user.click(screen.getByRole("button", { name: "新实验" }));
  const dialog = screen.getByRole("dialog", { name: "新实验" });
  await user.type(within(dialog).getByLabelText("标题"), title);
  await user.type(within(dialog).getByLabelText("问题 / 想法"), idea);
  await user.click(within(dialog).getByRole("button", { name: "创建" }));
}

describe("LabPage", () => {
  it("renders the four experiment stages as empty by default", () => {
    render(<LabPage />);

    expect(screen.getByLabelText("Lab 实验台")).toBeInTheDocument();
    for (const stage of ["假说构建", "实证验证", "能力锻造", "晋升评审"]) {
      const column = screen.getByLabelText(stage);
      expect(within(column).getByText("0")).toBeInTheDocument();
      expect(within(column).getByText(`暂无${stage}。`)).toBeInTheDocument();
    }
    expect(screen.queryByText("让 Agent 锻造 Rust CLI")).not.toBeInTheDocument();
  });

  it("creates a draft experiment in the hypothesis stage", async () => {
    const user = userEvent.setup();
    render(<LabPage />);

    await createDraftExperiment(user, "验证 Lab 空态", "把实验台 UI 切到真实空态后保持交互闭环。");

    const hypothesis = screen.getByLabelText("假说构建");
    expect(within(hypothesis).getByText("1")).toBeInTheDocument();
    expect(within(hypothesis).getByText("验证 Lab 空态")).toBeInTheDocument();

    await user.click(within(hypothesis).getByText("验证 Lab 空态"));
    expect(screen.getByText("把实验台 UI 切到真实空态后保持交互闭环。")).toBeInTheDocument();
  });

  it("opens card detail and exposes the more menu actions", async () => {
    const user = userEvent.setup();
    render(<LabPage />);

    await createDraftExperiment(user, "验证详情操作");
    await user.click(screen.getByText("验证详情操作"));

    const dialog = screen.getByRole("dialog", { name: "验证详情操作" });
    expect(within(dialog).getByText("问题 / 想法")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "进入实证验证" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "更多操作" }));
    expect(within(dialog).getByRole("menuitem", { name: "暂停" })).toBeInTheDocument();
    expect(within(dialog).getByRole("menuitem", { name: "取消" })).toBeInTheDocument();
  });

  it("advances a hypothesis card into verification", async () => {
    const user = userEvent.setup();
    render(<LabPage />);

    await createDraftExperiment(user, "推进到验证");
    await user.click(screen.getByText("推进到验证"));
    await user.click(screen.getByRole("button", { name: "进入实证验证" }));

    const hypothesis = screen.getByLabelText("假说构建");
    const verification = screen.getByLabelText("实证验证");
    expect(within(hypothesis).getByText("0")).toBeInTheDocument();
    expect(within(verification).getByText("1")).toBeInTheDocument();
    expect(within(verification).getByText("推进到验证")).toBeInTheDocument();
  });

  it("records cancelled cards in completed experiments", async () => {
    const user = userEvent.setup();
    render(<LabPage />);

    await createDraftExperiment(user, "取消本地实验");
    await user.click(screen.getByText("取消本地实验"));
    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "已完成实验" }));
    const dialog = screen.getByRole("dialog", { name: "已完成实验" });
    expect(within(dialog).getByText("取消本地实验")).toBeInTheDocument();
    expect(within(dialog).getAllByText("已废弃").length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole("tab", { name: "已晋升" }));
    expect(within(dialog).queryByText("取消本地实验")).not.toBeInTheDocument();
  });

  it("promotes a user-created card through all stages", async () => {
    const user = userEvent.setup();
    render(<LabPage />);

    await createDraftExperiment(user, "晋升本地实验");
    await user.click(screen.getByText("晋升本地实验"));

    await user.click(screen.getByRole("button", { name: "进入实证验证" }));
    await user.click(screen.getByRole("button", { name: "进入能力锻造" }));
    await user.click(screen.getByRole("button", { name: "提交晋升评审" }));
    await user.click(screen.getByRole("button", { name: "批准候选" }));

    await user.click(screen.getByRole("button", { name: "已完成实验" }));
    const dialog = screen.getByRole("dialog", { name: "已完成实验" });
    await user.click(within(dialog).getByRole("tab", { name: "已晋升" }));

    expect(within(dialog).getByText("晋升本地实验")).toBeInTheDocument();
    expect(within(dialog).getAllByText("已晋升").length).toBeGreaterThan(0);
    await user.click(within(dialog).getByRole("button", { name: "查看 晋升本地实验" }));
    expect(within(dialog).getByLabelText("晋升本地实验 详情")).toBeInTheDocument();
  });
});
