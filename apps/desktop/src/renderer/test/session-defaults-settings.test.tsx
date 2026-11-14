import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SessionDefaultsSection } from "../components/settings/sections/SessionDefaultsSection";
import type { SectionProps } from "../components/settings/sections/shared";

function renderSection(defaultPermissionMode?: string, onUpdateNamespace = vi.fn(async () => undefined)) {
  const props = {
    settingsV4: {
      version: 4,
      revision: "r",
      settings: { general: defaultPermissionMode ? { defaultPermissionMode } : {} },
    },
    onUpdateNamespace,
  } as unknown as SectionProps;
  render(<SessionDefaultsSection {...props} />);
  return { onUpdateNamespace };
}

describe("设置 → 通用 → 新会话默认权限", () => {
  it("shows 自动 when nothing is saved and saves a lower mode right away", async () => {
    const { onUpdateNamespace } = renderSection();
    const select = screen.getByRole("combobox", { name: "新会话默认权限" });
    expect(select).toHaveTextContent("自动");
    await userEvent.click(select);
    await userEvent.click(screen.getByRole("option", { name: "替我审批" }));
    expect(onUpdateNamespace).toHaveBeenCalledWith({
      namespace: "general",
      patch: { defaultPermissionMode: "auto-review" },
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks before making 完全权限 the default, and saves nothing when cancelled", async () => {
    const { onUpdateNamespace } = renderSection("default");
    await userEvent.click(screen.getByRole("combobox", { name: "新会话默认权限" }));
    await userEvent.click(screen.getByRole("option", { name: "完全权限" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("之后新建的会话都会默认开启");
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onUpdateNamespace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("combobox", { name: "新会话默认权限" }));
    await userEvent.click(screen.getByRole("option", { name: "完全权限" }));
    await userEvent.click(await screen.findByRole("button", { name: "开启" }));
    expect(onUpdateNamespace).toHaveBeenCalledWith({
      namespace: "general",
      patch: { defaultPermissionMode: "full-access" },
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the dialog open with the reason when saving fails", async () => {
    renderSection(
      "default",
      vi.fn(async () => {
        throw new Error("磁盘只读");
      }),
    );
    await userEvent.click(screen.getByRole("combobox", { name: "新会话默认权限" }));
    await userEvent.click(screen.getByRole("option", { name: "完全权限" }));
    await userEvent.click(await screen.findByRole("button", { name: "开启" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("磁盘只读");
  });
});
