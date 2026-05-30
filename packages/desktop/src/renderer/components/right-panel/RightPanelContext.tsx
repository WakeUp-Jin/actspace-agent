import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

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
  | { kind: "replyHtml"; title: string; sessionId: string | null }
);

export type RightPanelTabKind = RightPanelTab["kind"];

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
};

const RightPanelStateContext = createContext<RightPanelContextValue | null>(null);

/** 默认常驻 Kairos tab：保证面板有内容，且 Kairos 视图始终可从右侧面板进入。 */
function createDefaultTabs(): RightPanelTab[] {
  return [{ id: "kairos", kind: "kairos", title: "Kairos" }];
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

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
    setIsOpen(true);
  }, []);

  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);
  const togglePanel = useCallback(() => setIsOpen((open) => !open), []);

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
    };
  }, [isOpen, tabs, activeTabId, openTab, closeTab, setActiveTab, openPanel, closePanel, togglePanel]);

  return <RightPanelStateContext.Provider value={value}>{children}</RightPanelStateContext.Provider>;
}

export function useRightPanel(): RightPanelContextValue {
  const value = useContext(RightPanelStateContext);
  if (!value) {
    throw new Error("useRightPanel must be used within a RightPanelProvider");
  }
  return value;
}
