import { useCallback, useEffect, useState } from "react";
import type { SidebarMode } from "../Sidebar";

type StoredWorkbenchLayout = {
  leftMode?: SidebarMode | "rail";
  leftWidth?: number;
  rightWidth?: number;
};

export const WORKBENCH_LAYOUT_STORAGE_KEY = "actspace.workbench.layout.v1";
const LEFT_DEFAULT_WIDTH = 260;
export const LEFT_MIN_WIDTH = 200;
export const LEFT_MAX_WIDTH = 360;
/** 拖拽左侧分隔条到该阈值以下时，sidebar 自动 snap 到 hidden 态（rail 模式已退役）。 */
const LEFT_HIDE_SNAP_WIDTH = 148;
export const MAIN_MIN_WIDTH = 560;
const RIGHT_DEFAULT_WIDTH = 390;
export const RIGHT_MIN_WIDTH = 320;
/** 主区与右栏都取最小宽时仍放不下（< 880px），左右面板就改为覆盖层；阈值与并排容量同源，避免出现两种布局都打不开右栏的空档。 */
const SIDE_BY_SIDE_MIN_WIDTH = MAIN_MIN_WIDTH + RIGHT_MIN_WIDTH;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getRightMaxWidth(containerWidth: number, displayedLeftWidth: number): number {
  if (containerWidth <= 0) {
    return RIGHT_DEFAULT_WIDTH;
  }

  return Math.max(RIGHT_MIN_WIDTH, containerWidth - displayedLeftWidth - MAIN_MIN_WIDTH);
}

type ResolvedLayout = {
  leftMode: SidebarMode;
  leftWidth: number;
  rightWidth: number;
};

function loadStoredLayout(): ResolvedLayout {
  if (typeof window === "undefined") {
    return {
      leftMode: "expanded",
      leftWidth: LEFT_DEFAULT_WIDTH,
      rightWidth: RIGHT_DEFAULT_WIDTH
    };
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(WORKBENCH_LAYOUT_STORAGE_KEY) ?? "{}") as StoredWorkbenchLayout;
    // 老版本可能落了 leftMode: "rail"，rail 已退役，统一映射成 hidden。
    const resolvedMode: SidebarMode =
      stored.leftMode === "hidden" || stored.leftMode === "rail" ? "hidden" : "expanded";
    const resolvedLeftWidth = clamp(stored.leftWidth ?? LEFT_DEFAULT_WIDTH, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH);
    const initialRightMaxWidth = getRightMaxWidth(
      window.innerWidth,
      resolvedMode === "hidden" ? 0 : resolvedLeftWidth,
    );
    return {
      leftMode: resolvedMode,
      leftWidth: resolvedLeftWidth,
      rightWidth: clamp(stored.rightWidth ?? RIGHT_DEFAULT_WIDTH, RIGHT_MIN_WIDTH, initialRightMaxWidth)
    };
  } catch {
    return {
      leftMode: "expanded",
      leftWidth: LEFT_DEFAULT_WIDTH,
      rightWidth: RIGHT_DEFAULT_WIDTH
    };
  }
}

export type PanelLayoutRightPanel = {
  readonly isOpen: boolean;
  readonly openPanel: () => void;
  readonly closePanel: () => void;
};

/**
 * 工作台左右面板的布局（16 T15，从 WorkbenchLayout 搬出）：宽度与收起状态的持久化、窄窗口自动收起、
 * 紧凑布局（< 880px）下的覆盖层和 Esc 关闭，以及分隔条拖拽 / 键盘调整。右侧面板的开关状态由 RightPanelContext 持有。
 */
export function usePanelLayout({ isOpen: isRightPanelOpen, openPanel: openRightPanel, closePanel: closeRightPanel }: PanelLayoutRightPanel) {
  const [storedLayout] = useState(loadStoredLayout);
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  const [leftMode, setLeftMode] = useState<SidebarMode>(storedLayout.leftMode);
  const [leftWidth, setLeftWidth] = useState(storedLayout.leftWidth);
  const [rightWidth, setRightWidth] = useState(storedLayout.rightWidth);
  const [compactSidebarOpen, setCompactSidebarOpen] = useState(false);

  const isCompactLayout = containerWidth > 0 && containerWidth < SIDE_BY_SIDE_MIN_WIDTH;
  const isSidebarHidden = leftMode === "hidden";
  const displayedLeftWidth = isSidebarHidden ? 0 : leftWidth;
  const rightMaxWidth = getRightMaxWidth(containerWidth, displayedLeftWidth);

  const handleContainerWidthChange = useCallback((width: number) => {
    setContainerWidth(width);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      WORKBENCH_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        leftMode,
        leftWidth,
        rightWidth
      })
    );
  }, [leftMode, leftWidth, rightWidth]);

  useEffect(() => {
    if (containerWidth === 0) {
      return;
    }

    if (isCompactLayout) {
      return;
    }

    if (leftMode === "expanded" && containerWidth - leftWidth < MAIN_MIN_WIDTH) {
      setLeftMode("hidden");
      return;
    }

    if (!isRightPanelOpen) {
      return;
    }

    const currentLeftWidth = isSidebarHidden ? 0 : leftWidth;
    if (containerWidth - currentLeftWidth - RIGHT_MIN_WIDTH < MAIN_MIN_WIDTH) {
      if (leftMode === "expanded") {
        setLeftMode("hidden");
        return;
      }

      closeRightPanel();
      return;
    }

    const allowedRightWidth = Math.min(rightMaxWidth, containerWidth - currentLeftWidth - MAIN_MIN_WIDTH);
    if (rightWidth > allowedRightWidth) {
      setRightWidth(clamp(allowedRightWidth, RIGHT_MIN_WIDTH, rightMaxWidth));
    }
  }, [containerWidth, isCompactLayout, isRightPanelOpen, isSidebarHidden, leftMode, leftWidth, rightMaxWidth, rightWidth]);

  useEffect(() => {
    if (!isCompactLayout) {
      setCompactSidebarOpen(false);
    }
  }, [isCompactLayout]);

  useEffect(() => {
    if (!isCompactLayout || (!compactSidebarOpen && !isRightPanelOpen)) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      // 已被浮层或对话框处理过的 Esc（Radix 会 preventDefault）只关那一层，不连带关闭侧栏和右侧面板。
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      setCompactSidebarOpen(false);
      closeRightPanel();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeRightPanel, compactSidebarOpen, isCompactLayout, isRightPanelOpen]);

  function toggleSidebarMode() {
    if (isCompactLayout) {
      setCompactSidebarOpen((open) => {
        if (!open && isRightPanelOpen) {
          closeRightPanel();
        }
        return !open;
      });
      return;
    }

    if (leftMode === "expanded") {
      setLeftMode("hidden");
      return;
    }

    setLeftMode("expanded");
    if (isRightPanelOpen && containerWidth - leftWidth - rightWidth < MAIN_MIN_WIDTH) {
      closeRightPanel();
    }
  }

  function resizeLeftPanel(width: number) {
    if (width <= LEFT_HIDE_SNAP_WIDTH) {
      setLeftMode("hidden");
      return;
    }

    setLeftMode("expanded");
    setLeftWidth(clamp(width, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH));
  }

  function keyResizeLeftPanel(width: number) {
    if (isSidebarHidden && width > LEFT_HIDE_SNAP_WIDTH) {
      setLeftMode("expanded");
      setLeftWidth(LEFT_MIN_WIDTH);
      return;
    }

    resizeLeftPanel(width);
  }

  function toggleRightPanel() {
    if (isRightPanelOpen) {
      closeRightPanel();
      return;
    }

    if (isCompactLayout) {
      setCompactSidebarOpen(false);
      openRightPanel();
      return;
    }

    if (containerWidth > 0 && containerWidth - displayedLeftWidth - RIGHT_MIN_WIDTH < MAIN_MIN_WIDTH) {
      setLeftMode("hidden");
    }

    openRightPanel();
  }

  const chromeLeftMode: SidebarMode = isCompactLayout
    ? compactSidebarOpen ? "expanded" : "hidden"
    : leftMode;

  return {
    isCompactLayout,
    leftMode,
    isSidebarHidden,
    displayedLeftWidth,
    rightWidth,
    rightMaxWidth,
    compactSidebarOpen,
    setCompactSidebarOpen,
    chromeLeftMode,
    handleContainerWidthChange,
    toggleSidebarMode,
    toggleRightPanel,
    resizeLeftPanel,
    keyResizeLeftPanel,
    resizeRightPanel: (width: number) => setRightWidth(clamp(width, RIGHT_MIN_WIDTH, rightMaxWidth)),
    resetRightWidth: () => setRightWidth(RIGHT_DEFAULT_WIDTH),
  };
}
