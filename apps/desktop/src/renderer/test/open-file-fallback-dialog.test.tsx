import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceFileApplication, WorkspaceOpenTool } from "@actspace/shared";
import { OpenFileFallbackProvider, useOpenWorkspacePath } from "../components/files/open-file-fallback-context";
import { clearFileApplicationsCache } from "../components/turn-tail/useFileApplications";
import { setupBridge } from "./helpers/bridge";

const APPS: WorkspaceFileApplication[] = [
  { id: "/Applications/Xcode.app", name: "Xcode", default: false },
  { id: "/System/Applications/TextEdit.app", name: "TextEdit", default: false },
];

function Trigger({ path = "src/main.go" }: { path?: string }) {
  const openPath = useOpenWorkspacePath();
  return <button type="button" onClick={() => void openPath({ workspaceRoot: "/ws", relativePath: path, openTab: vi.fn() })}>点开</button>;
}

function install({ applications = APPS, tools = [] as WorkspaceOpenTool[], noApp = true }: { applications?: WorkspaceFileApplication[]; tools?: WorkspaceOpenTool[]; noApp?: boolean } = {}) {
  const openFile = vi.fn(async (input: { action: string; applicationId?: string }) =>
    noApp && input.action === "open" && !input.applicationId ? { ok: false, error: "no_application" as const, message: "Failed to open path" } : { ok: true });
  setupBridge({
    "workspaces.openFile": openFile,
    "workspaces.listFileApplications": async () => ({ applications }),
    "workspaces.listOpenTools": async () => ({ tools }),
  });
  return openFile;
}

async function openDialog() {
  render(<OpenFileFallbackProvider><Trigger /></OpenFileFallbackProvider>);
  await userEvent.click(screen.getByRole("button", { name: "点开" }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  clearFileApplicationsCache();
  vi.stubGlobal("navigator", { ...navigator, platform: "MacIntel" });
});

describe("OpenFileFallbackDialog", () => {
  it("does not appear when the system opens the file", async () => {
    install({ noApp: false });
    render(<OpenFileFallbackProvider><Trigger /></OpenFileFallbackProvider>);
    await userEvent.click(screen.getByRole("button", { name: "点开" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the title, the application list and the Finder action", async () => {
    install();
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent("没有可以打开「main.go」的应用");
    expect(await screen.findByRole("button", { name: "Xcode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TextEdit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "在 Finder 中显示" })).toBeInTheDocument();
  });

  it("hides the application list when no application is associated", async () => {
    install({ applications: [] });
    await openDialog();
    expect(screen.getByRole("button", { name: "在 Finder 中显示" })).toBeInTheDocument();
    expect(screen.queryByText("选择应用打开")).toBeNull();
  });

  it("opens with the chosen application and closes", async () => {
    const openFile = install();
    await openDialog();
    await userEvent.click(await screen.findByRole("button", { name: "TextEdit" }));
    await waitFor(() => expect(openFile).toHaveBeenLastCalledWith({ workspaceRoot: "/ws", relativePath: "src/main.go", action: "open", applicationId: "/System/Applications/TextEdit.app" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reveals the file in Finder and closes", async () => {
    const openFile = install();
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "在 Finder 中显示" }));
    await waitFor(() => expect(openFile).toHaveBeenLastCalledWith({ workspaceRoot: "/ws", relativePath: "src/main.go", action: "reveal" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("recommends VS Code with a download link only when it is not installed", async () => {
    install({ tools: [{ id: "vscode", label: "VS Code", available: false }] });
    await openDialog();
    const link = await screen.findByRole("link", { name: "VS Code" });
    expect(link).toHaveAttribute("href", "https://code.visualstudio.com/");
    expect(screen.getByText(/推荐安装/)).toBeInTheDocument();
  });

  it("does not recommend VS Code when it is installed", async () => {
    install({ tools: [{ id: "vscode", label: "VS Code", available: true }] });
    await openDialog();
    await screen.findByRole("button", { name: "Xcode" });
    expect(screen.queryByText(/推荐安装/)).toBeNull();
  });

  it("keeps the dialog open and explains when the chosen application fails", async () => {
    const openFile = vi.fn(async (input: { applicationId?: string }) => input.applicationId ? { ok: false, error: "open_failed" as const } : { ok: false, error: "no_application" as const });
    setupBridge({ "workspaces.openFile": openFile, "workspaces.listFileApplications": async () => ({ applications: APPS }), "workspaces.listOpenTools": async () => ({ tools: [] }) });
    await openDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Xcode" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法用这个应用打开");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
