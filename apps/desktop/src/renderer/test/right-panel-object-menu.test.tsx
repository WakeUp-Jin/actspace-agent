import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RightPanel } from "../components/RightPanel";
import { RightPanelObjectMenu } from "../components/right-panel/RightPanelObjectMenu";
import { RightPanelProvider } from "../components/right-panel/RightPanelContext";
import { TooltipProvider } from "../components/ui/Tooltip";

function renderMenu(sessionId: string | null) {
  render(
    <TooltipProvider>
      <RightPanelProvider initialOpen>
        <RightPanel />
        <RightPanelObjectMenu sessionId={sessionId} />
      </RightPanelProvider>
    </TooltipProvider>,
  );
  return screen.getByRole("button", { name: "新建右侧面板对象" });
}

describe("RightPanelObjectMenu", () => {
  it("disables the terminal without a session and opens a tab from the keyboard", async () => {
    const user = userEvent.setup();
    const trigger = renderMenu(null);
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "工作区文件" })).toHaveFocus();
    expect(screen.getByRole("menuitem", { name: "终端" })).toHaveAttribute("aria-disabled", "true");

    await user.keyboard("{End}{Enter}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "上下文" })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
