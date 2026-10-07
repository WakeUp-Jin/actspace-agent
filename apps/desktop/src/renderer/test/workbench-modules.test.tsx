import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { MessageBlock } from "@actspace/shared";
import { collectEditedFilePaths } from "../components/workbench/edited-files";
import { usePanelLayout, WORKBENCH_LAYOUT_STORAGE_KEY } from "../components/workbench/use-panel-layout";
import { useSessionHistory } from "../components/workbench/use-session-history";

// 16 T15：WorkbenchLayout 拆出的布局 / 会话历史 / 编辑路径三个模块。

function editBlock(id: string, partial: Partial<Extract<MessageBlock, { kind: "edit_diff" }>> = {}): MessageBlock {
  return { kind: "edit_diff", id, filePath: `/repo/${id}.ts`, additions: 1, deletions: 0, diff: "+x", collapsedLines: 0, createdAt: "2026-10-06T00:00:00.000Z", status: "completed", ...partial };
}

describe("collectEditedFilePaths", () => {
  it("keeps completed edits and writes, prefers the workspace-relative path and drops duplicates", () => {
    const messages: MessageBlock[] = [
      editBlock("a", { outputRelativePath: "src/a.ts" }),
      editBlock("b"),
      { ...editBlock("c"), kind: "write_diff", outputRelativePath: "notes.md" } as MessageBlock,
      editBlock("a2", { outputRelativePath: "src/a.ts" }),
      editBlock("pending", { status: "pending" }),
      editBlock("running", { status: "running" }),
      editBlock("failed", { status: "failed" }),
      { kind: "user", id: "u", content: "改一下", createdAt: "2026-10-06T00:00:00.000Z" },
    ];
    expect(collectEditedFilePaths(messages)).toEqual(["src/a.ts", "/repo/b.ts", "notes.md"]);
  });
});

function panelLayout(initial: { isOpen?: boolean } = {}) {
  const closePanel = vi.fn();
  const openPanel = vi.fn();
  const hook = renderHook(({ isOpen }) => usePanelLayout({ isOpen, openPanel, closePanel }), { initialProps: { isOpen: initial.isOpen ?? false } });
  return { ...hook, closePanel, openPanel };
}

describe("usePanelLayout", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("maps a stored legacy rail mode to hidden and clamps the stored widths", () => {
    window.localStorage.setItem(WORKBENCH_LAYOUT_STORAGE_KEY, JSON.stringify({ leftMode: "rail", leftWidth: 999, rightWidth: 10 }));
    const { result } = panelLayout();
    expect(result.current.leftMode).toBe("hidden");
    expect(result.current.displayedLeftWidth).toBe(0);
    expect(result.current.rightWidth).toBe(320);
    act(() => result.current.toggleSidebarMode());
    expect(result.current.displayedLeftWidth).toBe(360);
  });

  it("snaps the sidebar hidden below the drag threshold and reopens it at the minimum width from the keyboard", () => {
    const { result } = panelLayout();
    act(() => result.current.handleContainerWidthChange(1400));
    act(() => result.current.resizeLeftPanel(148));
    expect(result.current.isSidebarHidden).toBe(true);
    act(() => result.current.keyResizeLeftPanel(160));
    expect(result.current.isSidebarHidden).toBe(false);
    expect(result.current.displayedLeftWidth).toBe(200);
    act(() => result.current.resizeLeftPanel(300));
    expect(result.current.displayedLeftWidth).toBe(300);
    // jsdom 的 innerWidth 是 1024：初始右栏宽度按 1024 - 260 - 560 收到下限 320。
    expect(JSON.parse(window.localStorage.getItem(WORKBENCH_LAYOUT_STORAGE_KEY) ?? "{}")).toEqual({ leftMode: "expanded", leftWidth: 300, rightWidth: 320 });
  });

  it("clamps right resizes to the room left for the conversation and resets on double click", () => {
    const { result, rerender } = panelLayout();
    act(() => result.current.handleContainerWidthChange(1400));
    rerender({ isOpen: true });
    // 1400 - 260 - 560 = 580
    expect(result.current.rightMaxWidth).toBe(580);
    act(() => result.current.resizeRightPanel(900));
    expect(result.current.rightWidth).toBe(580);
    act(() => result.current.resizeRightPanel(100));
    expect(result.current.rightWidth).toBe(320);
    act(() => result.current.resetRightWidth());
    expect(result.current.rightWidth).toBe(390);
  });

  it("hides a wide sidebar when the window leaves less than the conversation minimum", () => {
    const { result } = panelLayout();
    act(() => result.current.handleContainerWidthChange(1400));
    act(() => result.current.resizeLeftPanel(300));
    act(() => result.current.handleContainerWidthChange(860));
    expect(result.current.isSidebarHidden).toBe(false);
    act(() => result.current.handleContainerWidthChange(850));
    expect(result.current.isSidebarHidden).toBe(true);
  });

  it("hides the sidebar first, then closes the right panel when the window gets too narrow", () => {
    const { result, closePanel } = panelLayout({ isOpen: true });
    act(() => result.current.handleContainerWidthChange(1000));
    expect(result.current.isSidebarHidden).toBe(true);
    expect(closePanel).not.toHaveBeenCalled();
    act(() => result.current.handleContainerWidthChange(860));
    expect(closePanel).toHaveBeenCalled();
  });

  it("switches to overlays at 820px: the sidebar toggle opens the overlay and closes the right panel", () => {
    const { result, rerender, closePanel, openPanel } = panelLayout({ isOpen: true });
    act(() => result.current.handleContainerWidthChange(820));
    expect(result.current.isCompactLayout).toBe(true);
    expect(result.current.chromeLeftMode).toBe("hidden");
    act(() => result.current.toggleSidebarMode());
    expect(result.current.compactSidebarOpen).toBe(true);
    expect(result.current.chromeLeftMode).toBe("expanded");
    expect(closePanel).toHaveBeenCalledTimes(1);

    rerender({ isOpen: false });
    act(() => result.current.toggleRightPanel());
    expect(result.current.compactSidebarOpen).toBe(false);
    expect(openPanel).toHaveBeenCalledTimes(1);

    act(() => result.current.handleContainerWidthChange(821));
    expect(result.current.isCompactLayout).toBe(false);
  });

  it("closes the compact overlays on Escape unless a popover already handled it", () => {
    const { result, closePanel } = panelLayout();
    act(() => result.current.handleContainerWidthChange(600));
    act(() => result.current.toggleSidebarMode());

    const handled = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    handled.preventDefault();
    act(() => { window.dispatchEvent(handled); });
    expect(result.current.compactSidebarOpen).toBe(true);

    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(result.current.compactSidebarOpen).toBe(false);
    expect(closePanel).toHaveBeenCalledTimes(1);
  });

  it("hides the sidebar to make room when opening the right panel on a mid-width window", () => {
    const { result, openPanel } = panelLayout();
    act(() => result.current.handleContainerWidthChange(1100));
    expect(result.current.isSidebarHidden).toBe(false);
    act(() => result.current.toggleRightPanel());
    expect(result.current.isSidebarHidden).toBe(true);
    expect(openPanel).toHaveBeenCalledTimes(1);
  });
});

describe("useSessionHistory", () => {
  it("goes back and forward without recording the navigation, and truncates the forward branch on a new visit", async () => {
    const onSelectSession = vi.fn();
    const { result, rerender } = renderHook(({ id }) => useSessionHistory(id, onSelectSession), { initialProps: { id: "a" as string | null } });
    expect(result.current.canGoBack).toBe(false);
    rerender({ id: "b" });
    rerender({ id: "c" });
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);

    act(() => result.current.navigateSessionHistory(-1));
    expect(result.current.canGoBack).toBe(false);
    await act(async () => {});
    expect(onSelectSession).toHaveBeenCalledWith("b");
    rerender({ id: "b" });
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(true);

    rerender({ id: "d" });
    expect(result.current.canGoForward).toBe(false);
    act(() => result.current.navigateSessionHistory(-1));
    await act(async () => {});
    expect(onSelectSession).toHaveBeenLastCalledWith("b");
  });

  it("puts the position back when switching fails", async () => {
    const onSelectSession = vi.fn().mockRejectedValue(new Error("打不开"));
    const { result, rerender } = renderHook(({ id }) => useSessionHistory(id, onSelectSession), { initialProps: { id: "a" } });
    rerender({ id: "b" });
    act(() => result.current.navigateSessionHistory(-1));
    await act(async () => {});
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);
  });
});
