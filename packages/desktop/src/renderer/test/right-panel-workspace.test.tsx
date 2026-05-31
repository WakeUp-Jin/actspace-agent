import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { RightPanel } from "../components/RightPanel";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";

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

function renderPanel() {
  return render(
    <RightPanelProvider>
      <WorkspaceToggleProbe />
      <RightPanel />
    </RightPanelProvider>,
  );
}

describe("RightPanel 工作区浏览态", () => {
  it("纵向三段：开启后出现操作栏与树栏，折叠按钮只收起树栏、保留操作栏", async () => {
    const user = userEvent.setup();
    // 无 IPC 桥：树栏渲染降级文案，便于断言树栏的出现/收起。
    (window as { actspace?: unknown }).actspace = undefined;
    renderPanel();

    // 未进入浏览态：没有操作栏（折叠按钮）也没有树栏。
    expect(screen.queryByRole("button", { name: "收起文件树" })).toBeNull();
    expect(screen.queryByText("当前环境不支持文件浏览。")).toBeNull();

    // 进入浏览态：② 操作栏折叠按钮 + ③ 左侧树栏同时出现。
    await user.click(screen.getByRole("button", { name: "probe-toggle" }));
    const collapseBtn = screen.getByRole("button", { name: "收起文件树" });
    expect(collapseBtn).toBeInTheDocument();
    expect(screen.getByText("当前环境不支持文件浏览。")).toBeInTheDocument();

    // 内容区是「文件预览区」：默认激活的 Kairos 对象 Tab 不在此渲染，只显示占位。
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

    // 进入工作区浏览态：默认激活的 Kairos 对象 Tab 退居占位。
    await user.click(screen.getByRole("button", { name: "probe-toggle" }));
    expect(screen.getByRole("heading", { name: "选择文件查看" })).toBeInTheDocument();

    // 在 tab 栏点 Kairos：应退出工作区态、展示 Kairos 自己的视图（占位 + 操作栏 + 树都消失）。
    await user.click(screen.getByRole("tab", { name: "Kairos" }));
    expect(screen.queryByRole("heading", { name: "选择文件查看" })).toBeNull();
    expect(screen.queryByRole("button", { name: /文件树$/ })).toBeNull();
    expect(screen.getByLabelText("Kairos 右侧紧凑视图")).toBeInTheDocument();
  });
});
