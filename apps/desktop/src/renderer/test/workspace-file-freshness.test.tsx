import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { tabFromFile } from "../components/right-panel/workspaceFileTab";
import { useFileFreshness, useReloadFileTab } from "../components/right-panel/useFileFreshness";
import { overrideBridge, setupBridge } from "./helpers/bridge";
import { RightPanel } from "../components/RightPanel";
import { TooltipProvider } from "../components/ui/Tooltip";

const file = { relativePath: "canary.txt", renderKind: "text" as const, size: 8, mtimeMs: 100, content: "snapshot" };
const wrapper = ({ children }: { children: ReactNode }) => <RightPanelProvider>{children}</RightPanelProvider>;

function useFiles() {
  useFileFreshness({ workspaceRoot: "/tree-b" });
  return { panel: useRightPanel(), reload: useReloadFileTab("/tree-b") };
}

describe("workspace file freshness after a file becomes unavailable", () => {
  it.each([
    { name: "a missing-file explanation", response: { ...file, error: "not_found" as const, content: undefined, mtimeMs: 0, size: 0 }, expected: "文件不存在或已被移动。" },
    { name: "updated disk contents", response: { ...file, content: "updated disk body", mtimeMs: 200 }, expected: "updated disk body" },
  ])("replaces the old snapshot with $name through the real reload button", async ({ response, expected }) => {
    const user = userEvent.setup();
    const read = vi.fn(async () => response);
    setupBridge({ "workspaces.readFile": read });
    const tab = { ...tabFromFile(file, { workspaceRoot: "/tree-a" }), isStale: true };
    render(
      <TooltipProvider>
        <RightPanelProvider initialTabs={[tab]} initialOpen>
          <RightPanel workspaceRoot="/tree-b" />
        </RightPanelProvider>
      </TooltipProvider>,
    );
    expect(screen.getByText("snapshot")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText("snapshot")).toBeNull();
    expect(screen.queryByRole("button", { name: "重新加载" })).toBeNull();
    expect(read).toHaveBeenCalledWith({ workspaceRoot: "/tree-a", relativePath: file.relativePath });
  });

  it.each(["not_found", "not_a_file", "escapes_root"] as const)("marks only the bound snapshot stale on %s", async (error) => {
    const stat = vi.fn(async () => file);
    const read = vi.fn(async () => ({ ...file, content: undefined, mtimeMs: 0, size: 0, error: "not_found" as const }));
    setupBridge({ "workspaces.statFile": stat, "workspaces.readFile": read });
    const target = { workspaceRoot: "/tree-a" };
    const a = tabFromFile(file, target);
    const b = tabFromFile({ ...file, content: "other root" }, { workspaceRoot: "/tree-b" });
    const { result } = renderHook(useFiles, { wrapper });
    act(() => { result.current.panel.openTab(a); result.current.panel.openTab(b); });
    await waitFor(() => expect(stat).toHaveBeenCalledTimes(2));

    const unavailable = vi.fn(async ({ workspaceRoot }: { workspaceRoot?: string }) => workspaceRoot === "/tree-a"
      ? { relativePath: file.relativePath, mtimeMs: 0, size: 0, error }
      : file);
    overrideBridge({ "workspaces.statFile": unavailable });
    act(() => { window.dispatchEvent(new Event("focus")); });

    await waitFor(() => expect(result.current.panel.tabs.find(tab => tab.id === a.id)).toMatchObject({ isStale: true }));
    expect(result.current.panel.tabs.find(tab => tab.id === a.id)).toMatchObject({ content: "snapshot" });
    expect(result.current.panel.tabs.find(tab => tab.id === b.id)).toMatchObject({ isStale: false, content: "other root" });
    expect(read).not.toHaveBeenCalled();

    if (error === "not_found") {
      await act(() => result.current.reload(file.relativePath, "canary.txt", target));
      expect(read).toHaveBeenCalledWith({ workspaceRoot: "/tree-a", relativePath: file.relativePath });
      expect(result.current.panel.tabs.find(tab => tab.id === a.id)).toMatchObject({
        isStale: false, content: "文件不存在或已被移动。", workspaceRoot: "/tree-a",
      });
    }
  });

  it("keeps the snapshot usable after a transient IPC failure and rechecks on the next focus", async () => {
    const stat = vi.fn(async () => file);
    setupBridge({ "workspaces.statFile": stat });
    const tab = tabFromFile(file, { workspaceRoot: "/tree-a" });
    const { result } = renderHook(useFiles, { wrapper });
    act(() => result.current.panel.openTab(tab));
    await waitFor(() => expect(stat).toHaveBeenCalledTimes(1));

    const broken = vi.fn(async () => { throw new Error("transport disconnected"); });
    overrideBridge({ "workspaces.statFile": broken });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(broken).toHaveBeenCalledOnce();
    expect(result.current.panel.tabs[0]).toMatchObject({ isStale: false, content: "snapshot" });

    overrideBridge({ "workspaces.statFile": async () => ({ ...file, mtimeMs: 200 }) });
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(result.current.panel.tabs[0]).toMatchObject({ isStale: true, content: "snapshot" }));
  });
});
