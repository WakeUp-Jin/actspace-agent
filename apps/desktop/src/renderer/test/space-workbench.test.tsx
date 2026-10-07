import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpaceDemoHelpButton } from "../components/space/dialogs/SpaceDemoHelpDialog";
import { NewSpaceDialog } from "../components/space/dialogs/NewSpaceDialog";
import { spaceDemoStore } from "../components/space/model/space-demo-store";
import { SpaceDemoNotice } from "../components/space/SpaceDemoNotice";
import { SpaceNoticeToast } from "../components/space/SpaceNoticeToast";
import { SpaceTabBar } from "../components/space/tabs/SpaceTabBar";
import { SpaceThread } from "../components/space/thread/SpaceThread";
import { StreamingText } from "../components/space/thread/StreamingText";

const actions = spaceDemoStore.actions;

function Workbench() {
  return (
    <>
      <SpaceTabBar />
      <SpaceDemoNotice />
      <SpaceThread />
    </>
  );
}

beforeEach(() => act(() => actions.reset()));
afterEach(() => {
  vi.useRealTimers();
  act(() => actions.reset());
});

const tabNamed = (name: string) => screen.queryByRole("tab", { name: new RegExp(name) });

describe("T5 标签栏与对话", () => {
  it("点引用胶囊打开那个 Actor 的标签并选中", async () => {
    render(<Workbench />);
    expect(tabNamed("性能分析")).toBeNull();
    const thread = document.querySelector("[data-space-thread]") as HTMLElement;
    await userEvent.click(within(thread).getAllByRole("button", { name: "性能分析" })[0]);
    expect(tabNamed("性能分析")).toHaveAttribute("aria-selected", "true");
    expect(document.querySelector("[data-space-thread]")).toHaveAttribute("data-space-thread", "actor");
  });

  it("协调 Agent 标签固定在最左且没有关闭按钮；关闭按钮只关对应标签", async () => {
    render(<Workbench />);
    act(() => { actions.openActorTab("perf"); actions.openActorTab("be"); });
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getAllByRole("tab")[0]).toHaveTextContent("支付链路提速");
    expect(screen.queryByRole("button", { name: "关闭 支付链路提速" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "关闭 性能分析" }));
    expect(tabNamed("性能分析")).toBeNull();
    expect(tabNamed("后端")).not.toBeNull();
  });

  it("等你决定的 Actor 标签带状态点，没有被打开的不显示", () => {
    render(<Workbench />);
    act(() => actions.openActorTab("be"));
    expect(within(tabNamed("后端") as HTMLElement).getByRole("img", { name: "等你决定" })).toBeInTheDocument();
  });

  it("放不下时出现「全部标签」菜单，「关闭其他标签」只留下当前标签", async () => {
    const width = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(900);
    const client = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    try {
      render(<Workbench />);
      act(() => { actions.openActorTab("perf"); actions.openActorTab("be"); actions.openActorTab("fe"); });
      await userEvent.click(screen.getByRole("button", { name: "全部标签" }));
      expect(screen.getByRole("menuitem", { name: "关闭其他标签" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("menuitem", { name: "关闭其他标签" }));
      expect(tabNamed("前端")).not.toBeNull();
      expect(tabNamed("性能分析")).toBeNull();
      expect(tabNamed("后端")).toBeNull();
    } finally {
      width.mockRestore();
      client.mockRestore();
    }
  });

  it("名册页只有一个「Actor 名册」标签，一对一显示 Actor 名字", () => {
    render(<SpaceTabBar />);
    act(() => actions.goRoster());
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(tabNamed("Actor 名册")).toHaveAttribute("aria-selected", "true");
    act(() => actions.openSoloChat("fe"));
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(tabNamed("前端")).not.toBeNull();
  });

  it("新起的 Actor 头部写「归属 Space」，名册里的写自己的记忆条数", () => {
    render(<Workbench />);
    act(() => actions.openActorTab("env"));
    expect(screen.getByText("归属")).toBeInTheDocument();
    act(() => actions.openActorTab("be"));
    expect(screen.queryByText("归属")).toBeNull();
    expect(screen.getByText("23 条")).toBeInTheDocument();
  });

  it("审批卡：拒绝和运行用基础按钮，处理后变成一行结果", async () => {
    render(<Workbench />);
    act(() => actions.openActorTab("be"));
    expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "运行" }));
    expect(screen.queryByRole("button", { name: "运行" })).toBeNull();
    expect(screen.getByText("已批准，继续往下做。")).toBeInTheDocument();
  });

  it("没有任务的 Actor 显示空提示", () => {
    render(<Workbench />);
    act(() => actions.openActorTab("tester"));
    expect(screen.getByText("在这个 Space 里还没有交给 测试员 的事。")).toBeInTheDocument();
  });

  it("空 Space 显示成员，点成员头像打开它的标签", async () => {
    render(<Workbench />);
    act(() => actions.switchSpace("sp2"));
    expect(screen.getByText("为「把结算页拆成可独立发布的模块」而设")).toBeInTheDocument();
    expect(screen.getByText("说说要做什么，协调 Agent 会交给合适的 Actor。")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "审查员" }));
    expect(tabNamed("审查员")).toHaveAttribute("aria-selected", "true");
  });

  it("留下新起的 Actor：不用 → 虚线框文案；留下 → 长成后可去名册", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Workbench />);
    const card = () => document.querySelector("[data-keep-state]") as HTMLElement;
    expect(card()).toHaveAttribute("data-keep-state", "ask");
    await userEvent.click(screen.getByRole("button", { name: "留下" }));
    expect(card()).toHaveAttribute("data-keep-state", "growing");
    expect(card().querySelectorAll(".space-spark")).toHaveLength(8);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(card()).toHaveAttribute("data-keep-state", "kept");
    expect(card()).toHaveTextContent("现在在名册里，以后可以直接找它。");
    await userEvent.click(within(card()).getByRole("button", { name: "去名册" }));
    expect(tabNamed("Actor 名册")).toHaveAttribute("aria-selected", "true");
  });

  it("不用：卡片变成「没有留下」", async () => {
    render(<Workbench />);
    await userEvent.click(screen.getByRole("button", { name: "不用" }));
    expect(screen.getByText("没有留下 环境巡检，它只留在这个 Space 里。")).toBeInTheDocument();
  });

  it("撤销记忆后划掉并写「已撤销」", async () => {
    render(<Workbench />);
    await userEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.getByText(/已撤销/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤销" })).toBeNull();
  });

  it("StreamingText：跳动点、逐字加光标、结束后显示完整正文", () => {
    const { container, rerender } = render(<StreamingText text="你好" plain="你好" typing />);
    expect(screen.getByRole("status", { name: "正在回复" })).toHaveClass("space-typing");
    rerender(<StreamingText text="你好世界" plain="你好世界" shown={2} />);
    expect(container).toHaveTextContent("你好");
    expect(container).not.toHaveTextContent("你好世界");
    expect(container.querySelector(".space-caret")).not.toBeNull();
    rerender(<StreamingText text="你好世界" plain="你好世界" shown={null} />);
    expect(container).toHaveTextContent("你好世界");
    expect(container.querySelector(".space-caret")).toBeNull();
  });
});

describe("T9 弹窗、提示与演示说明", () => {
  function DialogHarness({ onCreated }: { onCreated?: (id: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>+</button>
        <NewSpaceDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
      </>
    );
  }

  it("新建 Space 弹窗：Esc 关闭后焦点回到「+」", async () => {
    render(<DialogHarness />);
    const plus = screen.getByRole("button", { name: "+" });
    await userEvent.click(plus);
    expect(screen.getByRole("dialog", { name: "新建 Space" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(plus).toHaveFocus();
  });

  it("成员默认选名册前两个，创建后先通知 onCreated 再关闭，并切到新 Space", async () => {
    const onCreated = vi.fn();
    render(<DialogHarness onCreated={onCreated} />);
    await userEvent.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByRole("button", { name: "后端" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "前端" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "性能分析" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.type(screen.getByLabelText("名字"), "新的 Space");
    await userEvent.type(screen.getByLabelText(/相关目录/), "api, web");
    await userEvent.click(screen.getByRole("button", { name: "性能分析" }));
    await userEvent.click(screen.getByRole("button", { name: "创建" }));
    const state = spaceDemoStore.getSnapshot();
    expect(onCreated).toHaveBeenCalledWith(state.spaceId);
    const created = state.spaces.find((s) => s.id === state.spaceId);
    expect(created?.name).toBe("新的 Space");
    expect(created?.dirs).toEqual(["api", "web"]);
    expect(created?.members.map((m) => m.id)).toEqual(["be", "fe", "perf"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("演示说明弹窗列出 7 步，「知道了」关闭", async () => {
    render(<SpaceDemoHelpButton />);
    await userEvent.click(screen.getByRole("button", { name: "这是什么" }));
    const dialog = screen.getByRole("dialog", { name: "这是什么" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(7);
    await userEvent.click(within(dialog).getByRole("button", { name: "知道了" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("演示提示条常驻，点「重置演示」回到初始数据", async () => {
    render(<Workbench />);
    expect(screen.getByRole("note")).toHaveTextContent("开发中演示 · 数据是模拟的，操作不会真正执行");
    act(() => { actions.openActorTab("be"); actions.switchSpace("sp2"); });
    expect(spaceDemoStore.getSnapshot().spaceId).toBe("sp2");
    await userEvent.click(screen.getByRole("button", { name: "重置演示" }));
    const state = spaceDemoStore.getSnapshot();
    expect(state.spaceId).toBe("sp1");
    expect(state.spaces.find((s) => s.id === "sp1")?.openTabs).toEqual([]);
  });

  it("轻提示是 role=status，2.2 秒后消失", () => {
    vi.useFakeTimers();
    act(() => actions.dismissNotice());
    render(<SpaceNoticeToast />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => actions.showNotice("已忘记"));
    expect(screen.getByRole("status")).toHaveTextContent("已忘记");
    act(() => { vi.advanceTimersByTime(2300); });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
