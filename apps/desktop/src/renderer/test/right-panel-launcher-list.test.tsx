import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderTree } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { RightPanelLauncherList } from "../components/right-panel/RightPanelLauncherList";

describe("RightPanelLauncherList", () => {
  it("names each row by its label and describes it with the one-line hint", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <RightPanelLauncherList
        label="右侧面板对象"
        caption="选一个对象打开"
        items={[
          { id: "files", label: "文件", description: "浏览工作目录", icon: <FolderTree size={15} />, onClick: onOpen },
          { id: "review", label: "Review", description: "这次的改动", icon: <FolderTree size={15} />, disabled: true },
        ]}
      />,
    );

    expect(screen.getByRole("navigation", { name: "右侧面板对象" })).toBeInTheDocument();
    expect(screen.getByText("选一个对象打开")).toBeInTheDocument();
    const files = screen.getByRole("button", { name: "文件" });
    expect(files).toHaveAccessibleDescription("浏览工作目录");
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();

    await user.click(files);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
