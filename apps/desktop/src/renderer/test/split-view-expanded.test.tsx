import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SplitView } from "../components/SplitView";

function renderSplit(rightExpanded: boolean) {
  return render(
    <SplitView
      left={<div>left</div>}
      main={<div>main-chat</div>}
      right={<div>right-docs</div>}
      leftWidth={240}
      rightWidth={420}
      rightExpanded={rightExpanded}
      leftBounds={{ minWidth: 200, maxWidth: 400 }}
      rightBounds={{ minWidth: 320, maxWidth: 800 }}
      minMainWidth={360}
      leftSeparatorLabel="左"
      rightSeparatorLabel="右"
      onContainerWidthChange={() => undefined}
      onLeftResize={() => undefined}
      onRightResize={() => undefined}
    />,
  );
}

describe("SplitView 右栏展开", () => {
  it("展开时主区折成 0 宽但保持挂载，右栏撑满，右分隔条消失", () => {
    const { container } = renderSplit(true);
    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe("240px 0px minmax(0, 1fr)");
    expect(screen.getByText("main-chat")).toBeInTheDocument();
    expect(screen.getByText("main-chat").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("separator", { name: "右" })).toBeNull();
  });

  it("不展开时是常规三栏", () => {
    const { container } = renderSplit(false);
    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe("240px minmax(0, 1fr) 420px");
    expect(screen.getByRole("separator", { name: "右" })).toBeInTheDocument();
  });
});
