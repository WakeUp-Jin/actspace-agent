import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExtensionsPage } from "../components/extensions/ExtensionsPage";
import { extensionsSettings, extensionSkills, extensionBrowserStatus } from "./fixtures/extensionsFixture";

describe("ExtensionsPage", () => {
  const updateSettings = vi.fn();
  const listSkills = vi.fn();
  const installSkill = vi.fn();
  const uninstallSkill = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    updateSettings.mockImplementation(async (input) => ({ ...extensionsSettings(), ...input }));
    listSkills.mockResolvedValue({ items: extensionSkills, warnings: [] });
    installSkill.mockResolvedValue({ ok: true, name: "new-skill" });
    uninstallSkill.mockResolvedValue({ ok: true });
    window.actspace = {
      getSettings: vi.fn(async () => extensionsSettings()), updateSettings,
      listSkills, installSkill, uninstallSkill,
      getBrowserBridgeStatus: vi.fn(async () => extensionBrowserStatus),
    } as unknown as typeof window.actspace;
  });

  afterEach(() => {
    delete (window as { actspace?: typeof window.actspace }).actspace;
    vi.restoreAllMocks();
  });

  it("shows a collapsed capability, searches it, and navigates tabs with the keyboard", async () => {
    const user = userEvent.setup();
    render(<ExtensionsPage />);
    const capability = await screen.findByRole("button", { name: /Browser Bridge/ });
    expect(capability).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "检查连接" })).not.toBeInTheDocument();
    await user.click(capability);
    expect(screen.getByRole("button", { name: "检查连接" })).toBeVisible();
    await user.type(screen.getByRole("searchbox"), "missing");
    expect(screen.getByText("没有找到匹配的能力。")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "能力" }));
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("tab", { name: "MCP" })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "MCP 暂未接入" })).toBeVisible();
    expect(screen.getByRole("searchbox")).toBeDisabled();
  });

  it("filters Skills, persists disabled names, and preserves successful state across tabs", async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    render(<ExtensionsPage onSettingsChange={onSettingsChange} />);
    await user.click(screen.getByRole("tab", { name: "Skills" }));
    const toggle = await screen.findByRole("switch", { name: "主 Agent 使用 writing" });
    await user.type(screen.getByRole("searchbox"), "润色");
    expect(screen.queryByText("code-review")).not.toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ skills: { disabled: ["writing"] } }));
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(onSettingsChange).toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "能力" }));
    await user.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByRole("searchbox")).toHaveValue("润色");
    expect(screen.getByRole("switch", { name: "主 Agent 使用 writing" })).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the previous state when saving fails and permits retry", async () => {
    const user = userEvent.setup();
    updateSettings.mockRejectedValueOnce(new Error("write failed"));
    render(<ExtensionsPage />);
    await user.click(screen.getByRole("tab", { name: "Skills" }));
    const toggle = await screen.findByRole("switch", { name: "主 Agent 使用 writing" });
    await user.click(toggle);
    expect(await screen.findByText(/保存失败/)).toBeVisible();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  });

  it("retains install, uninstall confirmation and catalog refresh", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ExtensionsPage />);
    await user.click(screen.getByRole("tab", { name: "Skills" }));
    await user.click(await screen.findByRole("button", { name: "安装 Skill" }));
    expect(installSkill).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "卸载 Skill writing" }));
    expect(uninstallSkill).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    listSkills.mockResolvedValue({ items: [extensionSkills[1]], warnings: [] });
    await user.click(screen.getByRole("button", { name: "卸载 Skill writing" }));
    await waitFor(() => expect(uninstallSkill).toHaveBeenCalledWith({ directory: extensionSkills[0].directory }));
    expect(screen.queryByRole("switch", { name: "主 Agent 使用 writing" })).not.toBeInTheDocument();
  });
});
