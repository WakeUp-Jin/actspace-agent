import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestWorkbenchLayout } from "./helpers/workbench";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { spaceDemoStore } from "../components/space/model/space-demo-store";

type WorkbenchProps = Parameters<typeof TestWorkbenchLayout>[0];

const sessions: WorkbenchProps["sessions"] = [
  { id: "session-a", title: "普通会话 A", updatedAt: new Date().toISOString(), agentRunCount: 0, workspaceRoot: "/tmp/workspace" },
];

function renderWorkbench() {
  return render(
    <RightPanelProvider>
      <TestWorkbenchLayout
        sessions={sessions}
        activeSessionId="session-a"
        title="普通会话 A"
        messages={[]}
        contextSnapshot={null}
        selectedWorkspaceRoot="/tmp/workspace"
      />
    </RightPanelProvider>,
  );
}

// 右栏打开后也有 complementary 区域，左栏按 class 找。
const sidebar = () => document.querySelector<HTMLElement>("aside.sidebar")!;
const originalInnerWidth = window.innerWidth;

// 默认 1024px 放不下左栏 + 中栏 + 右栏，左栏会被自动收起；这里按常见桌面窗口宽度测。
function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

describe("Space 演示入口（T4）", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(1600);
    act(() => spaceDemoStore.actions.reset());
  });

  afterEach(() => {
    window.localStorage.clear();
    setViewportWidth(originalInnerWidth);
  });

  it("左栏按顺序放出 新建会话 → 新建 Space → 扩展 → Actor 名册，Space 分区带「演示」标记", () => {
    renderWorkbench();
    const labels = within(sidebar())
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => /^(新建会话|新建 Space|扩展|Actor 名册)/.test(text))
      .map((text) => text.replace(/⌘N|\d+$/g, ""));
    expect(labels).toEqual(["新建会话", "新建 Space", "扩展", "Actor 名册"]);
    const section = screen.getByRole("region", { name: "Space" });
    expect(within(section).getByText("演示")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: /支付链路提速/ })).toBeInTheDocument();
  });

  it("点 Space 行进入 Space：中栏换成协调 Agent，标题栏换成 Space 标签栏，右栏换成 Space 的右栏", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    const section = screen.getByRole("region", { name: "Space" });
    await user.click(within(section).getByRole("button", { name: /支付链路提速/ }));

    expect(screen.getByRole("main", { name: "Space（开发中演示）" })).toBeInTheDocument();
    expect(screen.getByText("开发中演示")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: /支付链路提速/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByPlaceholderText("接下来做什么？")).toBeInTheDocument();
    // 协调 Agent 右栏默认三个标签
    expect(screen.getByRole("tab", { name: "Actor" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "库" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "记忆" })).toBeInTheDocument();
  });

  it("Actor 名册页没有右栏，右栏开关也隐藏", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await user.click(within(sidebar()).getByRole("button", { name: /Actor 名册/ }));

    expect(screen.getByRole("heading", { name: /Actor 名册/ })).toBeInTheDocument();
    expect(within(sidebar()).getByRole("button", { name: /Actor 名册/ })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("tab", { name: "Actor" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("接下来做什么？")).not.toBeInTheDocument();
  });

  it("一对一对话出现在工作区列表里，点「新建会话」回到普通会话", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    act(() => spaceDemoStore.actions.openSoloChat("be"));
    await user.click(within(sidebar()).getByRole("button", { name: /^后端/ }));

    expect(screen.getByPlaceholderText("和后端说…")).toBeInTheDocument();
    expect(within(sidebar()).getByRole("button", { name: /^后端/ })).toHaveAttribute("aria-current", "page");

    await user.click(within(sidebar()).getByRole("button", { name: /^新建会话/ }));
    expect(screen.queryByRole("main", { name: "Space（开发中演示）" })).not.toBeInTheDocument();
  });

  it("新建 Space 后直接进入新 Space", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await user.click(within(sidebar()).getAllByRole("button", { name: "新建 Space" })[0]!);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /名字/ }), "发布清单");
    await user.click(within(dialog).getByRole("button", { name: /^创建/ }));

    expect(screen.getByRole("main", { name: "Space（开发中演示）" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Space" })).getByRole("button", { name: /发布清单/ })).toHaveAttribute("aria-current", "page");
  });
});
