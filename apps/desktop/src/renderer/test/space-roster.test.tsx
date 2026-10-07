import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActorRoster } from "../components/space/roster/ActorRoster";
import { ActorSoloChat } from "../components/space/roster/ActorSoloChat";
import { spaceDemoStore } from "../components/space/model/space-demo-store";

const actions = spaceDemoStore.actions;
const state = () => spaceDemoStore.getSnapshot();

beforeEach(() => {
  act(() => {
    actions.reset();
    actions.goRoster();
  });
});
afterEach(() => {
  cleanup();
  spaceDemoStore.dispose();
});

describe("ActorRoster", () => {
  it("显示标题和卡片底部信息，不含新起未留下的 Actor", () => {
    render(<ActorRoster />);
    expect(screen.getByRole("heading", { name: "Actor 名册" })).toBeInTheDocument();
    expect(screen.getByText("后端")).toBeInTheDocument();
    expect(screen.queryByText("环境巡检")).not.toBeInTheDocument();
    expect(screen.getAllByText(/在 \d+ 个 Space 里/).length).toBeGreaterThan(0);
  });

  it("按名字、场景、能力搜索，没有结果时给提示", async () => {
    const user = userEvent.setup();
    render(<ActorRoster />);
    const input = screen.getByRole("textbox", { name: "搜索 Actor" });
    await user.type(input, "Vitest");
    expect(screen.getByText("测试员")).toBeInTheDocument();
    expect(screen.queryByText("后端")).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "不存在的东西");
    expect(screen.getByText("没有找到「不存在的东西」")).toBeInTheDocument();
  });

  it("点卡片进入和这个 Actor 的一对一对话", async () => {
    const user = userEvent.setup();
    render(<ActorRoster />);
    await user.click(screen.getByText("前端"));
    expect(state().view).toBe("chat");
    expect(state().chatWith).toBe("fe");
  });
});

describe("ActorSoloChat", () => {
  it("显示自我介绍、用户消息和输入中的回复", () => {
    act(() => {
      actions.openSoloChat("fe");
      actions.sendSolo("你好");
    });
    render(<ActorSoloChat />);
    expect(screen.getByRole("heading", { name: "前端" })).toBeInTheDocument();
    expect(screen.getByText("Web 界面和交互，偏 React。")).toBeInTheDocument();
    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "正在输入" })).toBeInTheDocument();
  });
});
