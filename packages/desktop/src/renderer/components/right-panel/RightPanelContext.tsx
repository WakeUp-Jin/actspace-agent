import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TerminalSessionSnapshot } from "@actspace/shared";

/**
 * 右侧面板的 Tab 模型。`id` 同时是去重 key：用稳定 id（如 `context`、`html:<turnId>`、
 * `file:<相对路径>`）打开同一对象时只更新内容并聚焦，不重复堆 Tab。
 */
export type RightPanelTab = { id: string } & (
  | { kind: "markdown"; title: string; source: string; relativePath?: string }
  | { kind: "html"; title: string; html: string; trust: "chat" | "file"; relativePath?: string }
  | { kind: "image"; title: string; src: string; relativePath?: string }
  | { kind: "text"; title: string; content: string; language?: string; relativePath?: string }
  | { kind: "context"; title: string }
  | { kind: "kairos"; title: string }
  | { kind: "review"; title: string; workspaceRoot?: string; scope: "uncommitted"; refreshKey?: number }
  | { kind: "replyHtml"; title: string; sessionId: string | null }
  | { kind: "terminalStarting"; title: string; requestId: string; sessionId: string }
  | { kind: "terminalError"; title: string; sessionId: string; message: string }
  | { kind: "terminal"; title: string; terminalId: string; sessionId: string; shellName: string }
);

export type RightPanelTabKind = RightPanelTab["kind"];

/**
 * 是否「工作区文件 Tab」：由文件树点开、带工作区相对路径的文件类视图。
 * 聊天生成的 html/markdown（无 relativePath）不算——它们和 Kairos/Context 一样是对象视图，走整面板呈现。
 * 用它把「文件预览区（shell 内）」与「对象整面板视图」区分开。
 */
export function isWorkspaceFileTab(tab: RightPanelTab | null | undefined): boolean {
  if (!tab) return false;
  if (tab.kind === "markdown" || tab.kind === "html" || tab.kind === "image" || tab.kind === "text") {
    return typeof tab.relativePath === "string" && tab.relativePath.length > 0;
  }
  return false;
}

type RightPanelContextValue = {
  isOpen: boolean;
  tabs: RightPanelTab[];
  activeTabId: string | null;
  activeTab: RightPanelTab | null;
  openTab: (tab: RightPanelTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  /**
   * 工作区文件浏览器的两个独立开关（见 `front-右侧面板与文件渲染规范.md`）：
   * - `isFileTreeOpen`：是否进入工作区浏览态（操作栏 + 两栏）。由 `+` 菜单切换。
   * - `isFileTreeCollapsed`：浏览态内左侧树栏是否收起（操作栏与内容仍在）。由操作栏折叠按钮切换。
   */
  isFileTreeOpen: boolean;
  isFileTreeCollapsed: boolean;
  openFileTree: () => void;
  closeFileTree: () => void;
  toggleFileTree: () => void;
  toggleFileTreeCollapsed: () => void;
  syncTerminalTabs: (sessionId: string, terminals: TerminalSessionSnapshot[]) => void;
};

const RightPanelStateContext = createContext<RightPanelContextValue | null>(null);

/** 默认不打开对象：右侧面板先展示对象启动页，由用户选择要查看的内容。 */
function createDefaultTabs(): RightPanelTab[] {
  return [];
}

export function RightPanelProvider({
  children,
  initialTabs,
  initialOpen = false,
}: {
  children: ReactNode;
  initialTabs?: RightPanelTab[];
  initialOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [tabs, setTabs] = useState<RightPanelTab[]>(() => initialTabs ?? createDefaultTabs());
  const [activeTabId, setActiveTabId] = useState<string | null>(() => (initialTabs ?? createDefaultTabs())[0]?.id ?? null);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(false);
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);

  const openTab = useCallback((tab: RightPanelTab) => {
    setTabs((current) => {
      const existingIndex = current.findIndex((item) => item.id === tab.id);
      if (existingIndex === -1) {
        return [...current, tab];
      }
      const next = current.slice();
      next[existingIndex] = tab;
      return next;
    });
    setActiveTabId(tab.id);
    setIsOpen(true);
    // 打开对象 / 非工作区文件 Tab（Kairos/Context/Reply 等）时退出工作区浏览态，展示它自己的整面板视图；
    // 打开工作区文件则保持浏览态（shell 由 showShell 派生显示）。
    if (!isWorkspaceFileTab(tab)) {
      setIsFileTreeOpen(false);
    }
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index === -1) {
        return current;
      }
      const next = current.filter((item) => item.id !== id);
      setActiveTabId((activeId) => {
        if (activeId !== id) {
          return activeId;
        }
        // 关掉当前 tab 后，激活右邻；没有则激活左邻；都没有则 null。
        const fallback = next[index] ?? next[index - 1] ?? null;
        return fallback ? fallback.id : null;
      });
      return next;
    });
  }, []);

  const setActiveTab = useCallback(
    (id: string) => {
      setActiveTabId(id);
      setIsOpen(true);
      // 在 tab 栏点对象 Tab：先打开它自己的视图（退出工作区浏览态）；点文件 Tab 则保持/进入工作区 shell。
      const target = tabs.find((tab) => tab.id === id);
      if (target && !isWorkspaceFileTab(target)) {
        setIsFileTreeOpen(false);
      }
    },
    [tabs],
  );

  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);
  const togglePanel = useCallback(() => setIsOpen((open) => !open), []);

  // 进入工作区浏览态时确保面板打开、且左侧树栏展开（操作栏的折叠按钮稍后可再收起）。
  const openFileTree = useCallback(() => {
    setIsFileTreeOpen(true);
    setIsFileTreeCollapsed(false);
    setIsOpen(true);
  }, []);
  const closeFileTree = useCallback(() => setIsFileTreeOpen(false), []);
  const toggleFileTree = useCallback(() => {
    setIsFileTreeOpen((open) => {
      const next = !open;
      if (next) {
        setIsFileTreeCollapsed(false);
        setIsOpen(true);
      }
      return next;
    });
  }, []);
  // 仅收起 / 展开左侧树栏；操作栏与内容保持不变（对齐 Cursor 的侧栏切换）。
  const toggleFileTreeCollapsed = useCallback(() => setIsFileTreeCollapsed((collapsed) => !collapsed), []);

  const syncTerminalTabs = useCallback((sessionId: string, terminals: TerminalSessionSnapshot[]) => {
    setTabs((current) => {
      const existingByTerminalId = new Map(
        current.flatMap((tab) => tab.kind === "terminal" ? [[tab.terminalId, tab] as const] : []),
      );
      const visibleTerminalTabs: RightPanelTab[] = terminals.map((terminal) => {
        const existing = existingByTerminalId.get(terminal.id);
        return existing ?? {
          id: `terminal:${terminal.id}`,
          kind: "terminal",
          title: terminal.title,
          terminalId: terminal.id,
          sessionId,
          shellName: terminal.shellName,
        };
      });
      const next = [...current.filter((tab) => tab.kind !== "terminal"), ...visibleTerminalTabs];
      setActiveTabId((activeId) => activeId && next.some((tab) => tab.id === activeId) ? activeId : null);
      return next;
    });
  }, []);

  const value = useMemo<RightPanelContextValue>(() => {
    const active = tabs.find((tab) => tab.id === activeTabId) ?? null;
    return {
      isOpen,
      tabs,
      activeTabId,
      activeTab: active,
      openTab,
      closeTab,
      setActiveTab,
      openPanel,
      closePanel,
      togglePanel,
      isFileTreeOpen,
      isFileTreeCollapsed,
      openFileTree,
      closeFileTree,
      toggleFileTree,
      toggleFileTreeCollapsed,
      syncTerminalTabs,
    };
  }, [
    isOpen,
    tabs,
    activeTabId,
    openTab,
    closeTab,
    setActiveTab,
    openPanel,
    closePanel,
    togglePanel,
    isFileTreeOpen,
    isFileTreeCollapsed,
    openFileTree,
    closeFileTree,
    toggleFileTree,
    toggleFileTreeCollapsed,
    syncTerminalTabs,
  ]);

  return <RightPanelStateContext.Provider value={value}>{children}</RightPanelStateContext.Provider>;
}

export function useRightPanel(): RightPanelContextValue {
  const value = useContext(RightPanelStateContext);
  if (!value) {
    throw new Error("useRightPanel must be used within a RightPanelProvider");
  }
  return value;
}
