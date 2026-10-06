import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenInAppMenu } from "../components/right-panel/OpenInAppMenu";
import { TooltipProvider } from "../components/ui/Tooltip";

const { listOpenTools, openInTool } = vi.hoisted(() => ({ listOpenTools: vi.fn(), openInTool: vi.fn() }));
vi.mock("../api/workspaces", () => ({ workspacesApi: { listOpenTools, openInTool } }));

const TOOLS = [
  { id: "finder", label: "Finder", available: true },
  { id: "vscode", label: "VS Code", available: true },
  { id: "cursor", label: "Cursor", available: false },
];

beforeEach(() => {
  listOpenTools.mockReset().mockResolvedValue({ tools: TOOLS });
  openInTool.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  window.localStorage.clear();
});

function setup() {
  render(
    <TooltipProvider delayDuration={0}>
      <OpenInAppMenu workspaceRoot="/tmp/workspace" relativePath="src/index.ts" />
    </TooltipProvider>,
  );
  return { trigger: screen.getByRole("button", { name: "在外部应用中打开" }), user: userEvent.setup() };
}

describe("OpenInAppMenu", () => {
  it("lists the tools, opens the file with the chosen one and returns focus to the trigger", async () => {
    const { trigger, user } = setup();
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "在外部应用中打开" });
    expect(menu).toHaveTextContent("打开 src/index.ts");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const vscode = await screen.findByRole("menuitem", { name: "VS Code" });
    expect(screen.getByRole("menuitem", { name: /Cursor/ })).toHaveAttribute("aria-disabled", "true");

    await user.click(vscode);
    expect(openInTool).toHaveBeenCalledWith({ workspaceRoot: "/tmp/workspace", relativePath: "src/index.ts", toolId: "vscode" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    // 选过的应用被记住，下次在菜单里标「上次」。
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /^VS Code\s*上次$/ })).toBeInTheDocument();
  });

  it("keeps the menu open with the error when opening fails", async () => {
    openInTool.mockResolvedValue({ ok: false, message: "VS Code 没有响应。" });
    const { trigger, user } = setup();
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "VS Code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("VS Code 没有响应。");
    expect(screen.getByRole("menu", { name: "在外部应用中打开" })).toBeInTheDocument();

    // 重新打开时不带上次的错误。
    await user.keyboard("{Escape}");
    await user.click(trigger);
    await screen.findByRole("menuitem", { name: "VS Code" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens from the keyboard, closes on Escape and returns focus to the trigger", async () => {
    const { trigger, user } = setup();
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu", { name: "在外部应用中打开" })).toBeInTheDocument();
    await screen.findByRole("menuitem", { name: "VS Code" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(openInTool).not.toHaveBeenCalled();
  });

  it("falls back to the last used tool when the tool list cannot be loaded", async () => {
    listOpenTools.mockRejectedValue(new Error("no preload"));
    const { trigger, user } = setup();
    await user.click(trigger);
    await waitFor(() => expect(listOpenTools).toHaveBeenCalled());
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Finder上次"]);
  });
});
