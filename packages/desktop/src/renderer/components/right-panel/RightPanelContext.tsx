import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TerminalSessionSnapshot, WorkspaceDirEntry } from "@actspace/shared";

/**
 * 右侧面板的 Tab 模型。`id` 同时是去重 key：用稳定 id（如 `context`、`html:<agentRunId>`、
 * `file:<相对路径>`）打开同一对象时只更新内容并聚焦，不重复堆 Tab。
 *
 * 工作区文件类 Tab 额外带一组**新鲜度**字段（`mtimeMs` / `size` / `isStale` / `truncated`）。
 * 文件内容是打开那一刻的快照，磁盘随后可能被 Agent、外部编辑器或 git 改掉，
 * 所以必须能判断「手里这份是不是过期了」。检测机制见 `useFileFreshness.ts`。
 */
export type WorkspaceFileMeta = {
  relativePath?: string;
  /** 读取时的 mtime（epoch 毫秒），用于与磁盘现值比对。 */
  mtimeMs?: number;
  /** 读取时的文件字节数（磁盘完整大小，不因截断变小）。 */
  size?: number;
  /** 内容只是文件的前一段（超过 main 侧文本上限）。 */
  truncated?: boolean;
  /** 磁盘上已变化，当前内容已过期，等用户显式重新加载。 */
  isStale?: boolean;
};

export type RightPanelTab = { id: string } & (
  | ({ kind: "markdown"; title: string; source: string } & WorkspaceFileMeta)
  | ({ kind: "html"; title: string; html: string; trust: "chat" | "file" } & WorkspaceFileMeta)
  | ({ kind: "image"; title: string; src: string } & WorkspaceFileMeta)
  | ({ kind: "csv"; title: string; content: string } & WorkspaceFileMeta)
  | ({ kind: "text"; title: string; content: string; language?: string } & WorkspaceFileMeta)
  | { kind: "context"; title: string }
  | { kind: "kairos"; title: string }
  | { kind: "review"; title: string; workspaceRoot?: string; scope: "uncommitted"; refreshKey?: number }
  | { kind: "replyHtml"; title: string; sessionId: string | null }
  | { kind: "terminalStarting"; title: string; requestId: string; sessionId: string }
  | { kind: "terminalError"; title: string; sessionId: string; message: string }
  | { kind: "terminal"; title: string; terminalId: string; sessionId: string; shellName: string }
);

export type RightPanelTabKind = RightPanelTab["kind"];

const FILE_TAB_KINDS: ReadonlySet<RightPanelTabKind> = new Set<RightPanelTabKind>([
  "markdown",
  "html",
  "image",
  "csv",
  "text",
]);

/**
 * 是否「工作区文件 Tab」：由文件树点开、带工作区相对路径的文件类视图。
 * 聊天生成的 html/markdown（无 relativePath）不算——它们和 Kairos/Context 一样是对象视图，走整面板呈现。
 * 用它把「文件预览区（shell 内）」与「对象整面板视图」区分开。
 */
export function isWorkspaceFileTab(tab: RightPanelTab | null | undefined): boolean {
  if (!tab) return false;
  if (FILE_TAB_KINDS.has(tab.kind)) {
    return typeof (tab as WorkspaceFileMeta).relativePath === "string"
      && ((tab as WorkspaceFileMeta).relativePath as string).length > 0;
  }
  return false;
}

/** 工作区文件 Tab 的稳定 id，renderer 各处必须用同一个函数生成，避免拼错导致去重失效。 */
export function workspaceFileTabId(relativePath: string): string {
  return `file:${relativePath}`;
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
  /** 把某个工作区文件 Tab 标记为「磁盘已变化」；不存在该 Tab 时静默忽略。 */
  markFileTabStale: (relativePath: string) => void;
  /** 用重新读盘的结果替换 Tab 内容（同时清掉 stale 标记）。 */
  replaceTab: (tab: RightPanelTab) => void;
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
  /**
   * 文件树的展开层级与目录缓存。
   *
   * 必须提升到 Provider：树组件在「收起树栏」和「切到对象 Tab」时会被整体卸载，
   * 状态留在行组件里的话回来后所有目录都会塌回根层，每次都要重新点开。
   */
  expandedDirs: ReadonlySet<string>;
  toggleDir: (relativePath: string) => void;
  dirCache: ReadonlyMap<string, WorkspaceDirEntry[]>;
  cacheDir: (relativePath: string, entries: WorkspaceDirEntry[]) => void;
  /** 强制文件树重新拉取目录（清缓存 + 递增 key），展开层级保留。 */
  fileTreeRefreshKey: number;
  refreshFileTree: () => void;
  /**
   * 告知文件树当前的 workspace 根。根变了才清空展开层级与缓存（旧层级属于另一个根）。
   * 「上次的根」必须记在 Provider 里：树组件会随树栏收起 / 切对象 Tab 反复挂载卸载，
   * 记在组件里的话每次重挂都会误判成换根，把刚提升上来的展开状态清掉。
   */
  syncFileTreeRoot: (workspaceRoot: string | undefined) => void;
  /**
   * markdown / html 文件 Tab 当前看的是源码还是预览，按 Tab 记忆，切走再切回不丢。
   *
   * 必须放在 Provider：切换按钮在操作栏（渲染视图的兄弟节点），状态留在视图里的话
   * 操作栏读不到，也会在切 Tab 卸载时丢掉。
   */
  isSourceShown: (tabId: string) => boolean;
  setSourceShown: (tabId: string, shown: boolean) => void;
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
  const [expandedDirs, setExpandedDirs] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [dirCache, setDirCache] = useState<ReadonlyMap<string, WorkspaceDirEntry[]>>(
    () => new Map<string, WorkspaceDirEntry[]>(),
  );
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
  // known=false 表示还没有任何树挂载过，此时同步根不算「换根」，不该触发清空。
  const [, setFileTreeRoot] = useState<{ known: boolean; root: string | undefined }>({
    known: false,
    root: undefined,
  });
  const [sourceByTab, setSourceByTab] = useState<ReadonlyMap<string, boolean>>(() => new Map<string, boolean>());

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

  const replaceTab = useCallback((tab: RightPanelTab) => {
    setTabs((current) => {
      const index = current.findIndex((item) => item.id === tab.id);
      if (index === -1) return current;
      const next = current.slice();
      next[index] = tab;
      return next;
    });
  }, []);

  const markFileTabStale = useCallback((relativePath: string) => {
    const id = workspaceFileTabId(relativePath);
    setTabs((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index === -1) return current;
      const target = current[index];
      if (!FILE_TAB_KINDS.has(target.kind) || (target as WorkspaceFileMeta).isStale) {
        return current;
      }
      const next = current.slice();
      next[index] = { ...target, isStale: true } as RightPanelTab;
      return next;
    });
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

  const toggleDir = useCallback((relativePath: string) => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }, []);

  const cacheDir = useCallback((relativePath: string, entries: WorkspaceDirEntry[]) => {
    setDirCache((current) => {
      const next = new Map(current);
      next.set(relativePath, entries);
      return next;
    });
  }, []);

  const refreshFileTree = useCallback(() => {
    setDirCache(new Map<string, WorkspaceDirEntry[]>());
    setFileTreeRefreshKey((key) => key + 1);
  }, []);

  const syncFileTreeRoot = useCallback((nextRoot: string | undefined) => {
    setFileTreeRoot((current) => {
      if (current.known && current.root === nextRoot) return current;
      if (current.known) {
        setExpandedDirs(new Set<string>());
        setDirCache(new Map<string, WorkspaceDirEntry[]>());
        setFileTreeRefreshKey((key) => key + 1);
      }
      return { known: true, root: nextRoot };
    });
  }, []);

  const isSourceShown = useCallback((tabId: string) => sourceByTab.get(tabId) ?? false, [sourceByTab]);
  const setSourceShown = useCallback((tabId: string, shown: boolean) => {
    setSourceByTab((current) => {
      const next = new Map(current);
      next.set(tabId, shown);
      return next;
    });
  }, []);

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
      markFileTabStale,
      replaceTab,
      isFileTreeOpen,
      isFileTreeCollapsed,
      openFileTree,
      closeFileTree,
      toggleFileTree,
      toggleFileTreeCollapsed,
      expandedDirs,
      toggleDir,
      dirCache,
      cacheDir,
      fileTreeRefreshKey,
      refreshFileTree,
      syncFileTreeRoot,
      isSourceShown,
      setSourceShown,
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
    markFileTabStale,
    replaceTab,
    isFileTreeOpen,
    isFileTreeCollapsed,
    openFileTree,
    closeFileTree,
    toggleFileTree,
    toggleFileTreeCollapsed,
    expandedDirs,
    toggleDir,
    dirCache,
    cacheDir,
    fileTreeRefreshKey,
    refreshFileTree,
    syncFileTreeRoot,
    isSourceShown,
    setSourceShown,
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
