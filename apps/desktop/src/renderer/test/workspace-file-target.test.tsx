import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { tabFromFile } from "../components/right-panel/workspaceFileTab";
import { useReloadFileTab } from "../components/right-panel/useFileFreshness";
import { setupBridge } from "./helpers/bridge";

const file = { relativePath: "canary.txt", renderKind: "text" as const, size: 1, mtimeMs: 1, content: "A" };
const wrapper = ({ children }: { children: ReactNode }) => <RightPanelProvider>{children}</RightPanelProvider>;

describe("workspace file target ownership", () => {
  it("keeps the same relative path in two roots and Hosts as distinct bound tabs", () => {
    const a = tabFromFile(file, { workspaceRoot: "/tree-a" });
    const b = tabFromFile({ ...file, content: "B" }, { workspaceRoot: "/tree-b" });
    const remote = tabFromFile(file, { workspaceRoot: "/tree-a", hostId: "remote" });
    expect(new Set([a.id, b.id, remote.id]).size).toBe(3);
    const { result } = renderHook(() => useRightPanel(), { wrapper });
    act(() => { result.current.openTab(a); result.current.openTab(b); });
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.tabs[0]).toMatchObject({ workspaceRoot: "/tree-a", content: "A" });
  });

  it("reloads an existing tab from its bound root after the active session changes", async () => {
    const read = vi.fn(async () => ({ ...file, content: "updated" }));
    setupBridge({ "workspaces.readFile": read });
    const bound = { workspaceRoot: "/tree-a" };
    const tab = tabFromFile(file, bound);
    const { result } = renderHook(() => ({ panel: useRightPanel(), reload: useReloadFileTab("/tree-b") }), { wrapper });
    act(() => result.current.panel.openTab(tab));
    await act(() => result.current.reload(file.relativePath, "canary.txt", bound));
    expect(read).toHaveBeenCalledWith({ workspaceRoot: "/tree-a", relativePath: file.relativePath });
    expect(result.current.panel.tabs[0]).toMatchObject({ id: tab.id, workspaceRoot: "/tree-a", content: "updated" });
  });
});
