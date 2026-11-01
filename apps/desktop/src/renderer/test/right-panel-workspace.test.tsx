import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RightPanel } from "../components/RightPanel";
import {
  RightPanelProvider,
  useRightPanel,
  workspaceFileTabId,
} from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";

/** 测试用入口：像打开交付卡里的图片那样打开一个本机图片文件 Tab。 */
function OpenImageFileProbe() {
  const { openTab } = useRightPanel();
  return (
    <button
      type="button"
      onClick={() =>
        openTab({
          id: workspaceFileTabId("assets/a.png"),
          kind: "image",
          title: "a.png",
          src: "data:image/png;base64,AA==",
          relativePath: "assets/a.png",
        })
      }
    >
      probe-open-image
    </button>
  );
}

function renderPanel(workspaceRoot?: string) {
  return render(
    <TooltipProvider delayDuration={0}>
      <RightPanelProvider>
        <OpenImageFileProbe />
        <RightPanel workspaceRoot={workspaceRoot} />
      </RightPanelProvider>
    </TooltipProvider>,
  );
}

describe("RightPanel 对象与文件标签", () => {
  it("启动页提供「文档」和「改动」入口，点「文档」打开文档面板标签", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByText("对象")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^文件/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^改动/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^文档/ }));
    expect(screen.getByRole("tab", { name: "文档" })).toHaveAttribute("aria-selected", "true");
    // 没有工作区时只给空状态，不渲染目录树。
    expect(screen.getByText("请先在顶部选择工作区。")).toBeInTheDocument();
    expect(screen.queryByRole("tree")).toBeNull();
  });

  it("文件标签（图片）带操作栏，但不再有文件树开关", async () => {
    const user = userEvent.setup();
    renderPanel("/ws");

    await user.click(screen.getByRole("button", { name: "probe-open-image" }));
    expect(screen.getByText("assets/a.png")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "assets/a.png" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /文件树$/ })).toBeNull();
  });

  it("在 tab 栏点对象 Tab 打开它自己的整面板视图", async () => {
    const user = userEvent.setup();
    renderPanel("/ws");

    await user.click(screen.getByRole("button", { name: "probe-open-image" }));
    await user.click(screen.getByRole("tab", { name: "a.png" }));
    expect(screen.getByRole("img", { name: "assets/a.png" })).toBeInTheDocument();
  });

  it("shows a readable tooltip for the tab close button", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "上下文" }));
    await user.hover(screen.getByRole("button", { name: "关闭 上下文" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("关闭 上下文");
  });

  it("uses the lighter surface token for the active tab", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "上下文" }));
    const activeTab = screen.getByRole("tab", { name: "上下文" }).parentElement;
    expect(activeTab).toHaveClass("bg-surface-subtle");
    expect(activeTab).not.toHaveClass("bg-selected");
  });
});
