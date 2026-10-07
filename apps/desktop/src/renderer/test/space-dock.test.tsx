import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpaceDock } from "../components/space/dock/SpaceDock";
import { spaceDemoStore } from "../components/space/model/space-demo-store";
import { TooltipProvider } from "../components/ui/Tooltip";

const actions = spaceDemoStore.actions;
const state = () => spaceDemoStore.getSnapshot();

function renderDock() {
  return render(<TooltipProvider delayDuration={0}><SpaceDock /></TooltipProvider>);
}

beforeEach(() => {
  act(() => actions.reset());
});
afterEach(() => {
  cleanup();
  spaceDemoStore.dispose();
});

describe("SpaceDock 审批托盘与胶囊", () => {
  it("等你决定胶囊控制托盘，托盘显示命令和三个操作", async () => {
    const user = userEvent.setup();
    renderDock();
    const pill = screen.getByRole("button", { name: /等你决定/ });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "运行" })).not.toBeInTheDocument();
    await user.click(pill);
    expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("后端想运行一条命令")).toBeInTheDocument();
    for (const name of ["查看", "拒绝", "运行"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("当前看的 Actor 不进托盘，也不算进等你决定的数量", () => {
    act(() => actions.openActorTab("be"));
    renderDock();
    expect(screen.queryByRole("button", { name: /等你决定/ })).not.toBeInTheDocument();
    expect(screen.queryByText("后端想运行一条命令")).not.toBeInTheDocument();
  });

  it("处理完最后一个审批后托盘自动收起", async () => {
    const user = userEvent.setup();
    renderDock();
    await user.click(screen.getByRole("button", { name: /等你决定/ }));
    await user.click(screen.getByRole("button", { name: "运行" }));
    expect(state().trayOpen).toBe(false);
    expect(screen.queryByText("后端想运行一条命令")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /等你决定/ })).not.toBeInTheDocument();
  });

  it("其他胶囊点了打开右栏的 Actor 标签", async () => {
    const user = userEvent.setup();
    renderDock();
    await user.click(screen.getByRole("button", { name: /工作中/ }));
    expect(state().panels[`${state().spaceId}:coord`]?.active).toBe("actors");
  });
});

describe("SpaceDock 输入框", () => {
  it("占位符随上下文变化", async () => {
    renderDock();
    const box = () => screen.getByRole("textbox");
    expect(box()).toHaveAttribute("placeholder", "接下来做什么？");
    act(() => actions.openActorTab("be"));
    await waitFor(() => expect(box()).toHaveAttribute("placeholder", "对后端说…"));
    act(() => actions.openSoloChat("fe"));
    await waitFor(() => expect(box()).toHaveAttribute("placeholder", "和前端说…"));
  });

  it("从输入框发送后协调 Agent 开始回复", async () => {
    const user = userEvent.setup();
    renderDock();
    const before = state().spaces[0].msgs.length;
    await user.type(screen.getByRole("textbox"), "帮我看看报价接口{Enter}");
    await waitFor(() => {
      const msgs = state().spaces[0].msgs;
      expect(msgs.length).toBe(before + 2);
      expect(msgs.at(-2)).toMatchObject({ k: "user", t: "帮我看看报价接口" });
      expect(msgs.at(-1)?.k).toBe("coord");
    });
  });

  it("一对一对话里发送走一对一", async () => {
    const user = userEvent.setup();
    act(() => actions.openSoloChat("fe"));
    renderDock();
    await user.type(screen.getByRole("textbox"), "你好{Enter}");
    await waitFor(() => expect(state().chats.fe?.[0]).toMatchObject({ k: "user", t: "你好" }));
  });

  it("名册页不显示输入区", () => {
    act(() => actions.goRoster());
    renderDock();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
