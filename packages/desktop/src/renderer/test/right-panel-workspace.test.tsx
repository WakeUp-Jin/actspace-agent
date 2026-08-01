import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { RightPanel } from "../components/RightPanel";
import {
  RightPanelProvider,
  useRightPanel,
  workspaceFileTabId,
} from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";

const originalActspace = (window as { actspace?: unknown }).actspace;

afterEach(() => {
  (window as { actspace?: unknown }).actspace = originalActspace;
});

/** 测试用入口：从外部触发工作区浏览态的开关。 */
function WorkspaceToggleProbe() {
  const { toggleFileTree } = useRightPanel();
  return (
    <button type="button" onClick={toggleFileTree}>
      probe-toggle
    </button>
  );
}

/** 测试用入口：像文件树那样打开一个 markdown 工作区文件 Tab。 */
function OpenMarkdownFileProbe() {
  const { openTab } = useRightPanel();
  return (
    <button
      type="button"
      onClick={() =>
        openTab({
          id: workspaceFileTabId("docs/a.md"),
          kind: "markdown",
          title: "a.md",
          source: "# 标题",
          relativePath: "docs/a.md",
        })
      }
    >
      probe-open-md
    </button>
  );
}

function renderPanel() {
  return render(
    <TooltipProvider delayDuration={0}>
      <RightPanelProvider>
        <WorkspaceToggleProbe />
        <OpenMarkdownFileProbe />
        <RightPanel />
      </RightPanelProvider>
    </TooltipProvider>,
  );
}

describe("RightPanel 工作区浏览态", () => {
  it("纵向三段：开启后出现操作栏与树栏，折叠按钮只收起树栏、保留操作栏", async () => {
    const user = userEvent.setup();
    // 无 IPC 桥：树栏渲染降级文案，便于断言树栏的出现/收起。
    (window as { actspace?: unknown }).actspace = undefined;
    renderPanel();

    expect(screen.getByText("Objects")).toBeInTheDocument();

    // 未进入浏览态：没有操作栏（折叠按钮）也没有树栏。
    expect(screen.queryByRole("button", { name: "收起文件树" })).toBeNull();
    expect(screen.queryByText("当前环境不支持文件浏览。")).toBeNull();

    // 进入浏览态：② 操作栏折叠按钮 + ③ 右侧树栏同时出现。
    await user.click(screen.getByRole("button", { name: "probe-toggle" }));
    expect(screen.getByText("Files")).toBeInTheDocument();
    const collapseBtn = screen.getByRole("button", { name: "收起文件树" });
    expect(collapseBtn).toBeInTheDocument();
    expect(screen.getByText("当前环境不支持文件浏览。")).toBeInTheDocument();

    // 内容区是「文件预览区」：尚未选中文件时只显示占位。
    expect(screen.getByRole("heading", { name: "选择文件查看" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Kairos 右侧紧凑视图")).toBeNull();

    // 折叠：树栏消失，操作栏（按钮翻转为「展开文件树」）仍在。
    await user.click(collapseBtn);
    expect(screen.queryByText("当前环境不支持文件浏览。")).toBeNull();
    expect(screen.getByRole("button", { name: "展开文件树" })).toBeInTheDocument();

    // 再点 probe-toggle：退出浏览态，操作栏整体消失。
    await user.click(screen.getByRole("button", { name: "probe-toggle" }));
    expect(screen.queryByRole("button", { name: /文件树$/ })).toBeNull();
  });

  it("在 tab 栏点对象 Tab 打开它自己的整面板视图，而非工作区文件占位", async () => {
    const user = userEvent.setup();
    (window as { actspace?: unknown }).actspace = undefined;
    renderPanel();

    // 先从启动页打开 Kairos，再进入工作区浏览态：对象 Tab 退居占位。
    await user.click(screen.getByRole("button", { name: "Kairos" }));
    await user.click(screen.getByRole("button", { name: "probe-toggle" }));
    expect(screen.getByRole("heading", { name: "选择文件查看" })).toBeInTheDocument();

    // 在 tab 栏点 Kairos：应退出工作区态、展示 Kairos 自己的视图（占位 + 操作栏 + 树都消失）。
    await user.click(screen.getByRole("tab", { name: "Kairos" }));
    expect(screen.queryByRole("heading", { name: "选择文件查看" })).toBeNull();
    expect(screen.queryByRole("button", { name: /文件树$/ })).toBeNull();
    expect(screen.getByLabelText("Kairos 右侧紧凑视图")).toBeInTheDocument();
  });

  it("markdown 文件的预览/源码切换由操作栏承担，视图内不再自带控件", async () => {
    const user = userEvent.setup();
    (window as { actspace?: unknown }).actspace = undefined;
    renderPanel();

    await user.click(screen.getByRole("button", { name: "probe-open-md" }));
    // 默认预览态；视图内那组分段控件只留给没有操作栏的聊天 markdown。
    expect(screen.getByRole("heading", { name: "标题" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "源码" })).toBeNull();

    // 操作栏按钮显示的是**目标**：预览态写「查看源码」，切过去后写「查看预览」。
    await user.click(screen.getByRole("button", { name: "查看源码" }));
    expect(screen.getByText("# 标题")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "标题" })).toBeNull();
    expect(screen.getByRole("button", { name: "查看预览" })).toBeInTheDocument();
  });

  it("shows a readable tooltip for the tab close button", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Kairos" }));
    await user.hover(screen.getByRole("button", { name: "关闭 Kairos" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("关闭 Kairos");
  });

  it("uses the lighter surface token for the active tab", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Kairos" }));
    const activeTab = screen.getByRole("tab", { name: "Kairos" }).parentElement;
    expect(activeTab).toHaveClass("bg-surface-subtle");
    expect(activeTab).not.toHaveClass("bg-selected");
  });
});
