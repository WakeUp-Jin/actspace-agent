import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkbenchLayout } from "../components/WorkbenchLayout";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";

const originalInnerWidth = window.innerWidth;

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

function renderWorkbench() {
  return render(
    <StrictMode>
      <RightPanelProvider>
        <WorkbenchLayout
        sessions={[
          {
            id: "session-responsive",
            title: "Responsive layout",
            updatedAt: new Date().toISOString(),
            agentRunCount: 0,
            workspaceRoot: "/tmp/workspace",
          },
        ]}
        activeSessionId="session-responsive"
        title="Responsive layout"
        messages={[]}
        contextSnapshot={null}
        selectedWorkspaceRoot="/tmp/workspace"
        />
      </RightPanelProvider>
    </StrictMode>,
  );
}

describe("WorkbenchLayout narrow window behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(480);
  });

  afterEach(() => {
    window.localStorage.clear();
    setViewportWidth(originalInnerWidth);
  });

  it("keeps the main conversation full-width and opens the session sidebar as an overlay", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    expect(screen.queryByTestId("compact-sidebar-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand session sidebar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message composer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand session sidebar" }));

    const overlay = screen.getByTestId("compact-sidebar-overlay");
    expect(overlay).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse session sidebar" })).toBeInTheDocument();
    expect(within(overlay).getByText("Responsive layout")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close session sidebar overlay" }));
    expect(screen.queryByTestId("compact-sidebar-overlay")).not.toBeInTheDocument();
  });

  it("opens the right panel as an overlay and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Open panel" }));

    expect(screen.getByTestId("compact-right-panel-overlay")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "右侧面板对象" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message composer")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("compact-right-panel-overlay")).not.toBeInTheDocument();
  });

  it("keeps the regular SplitView panes at desktop widths", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    const { container } = renderWorkbench();

    expect(screen.getByRole("button", { name: "Collapse session sidebar" })).toBeInTheDocument();
    expect(container.querySelector("aside.sidebar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open panel" }));

    expect(screen.queryByTestId("compact-right-panel-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "右侧面板对象" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize preview panel" })).toBeInTheDocument();
  });

  it("opens settings and then the standalone analysis workspace", async () => {
    const user = userEvent.setup();
    setViewportWidth(1120);
    renderWorkbench();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("settings-page-shell")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "分析观测" }));
    expect(screen.getByRole("heading", { name: "分析观测" })).toBeInTheDocument();
    expect(screen.getByText("分析观测需要在 ActSpace 桌面端中打开。")).toBeInTheDocument();
  });
});
