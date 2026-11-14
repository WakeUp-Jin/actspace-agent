import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { TurnChanges } from "../turn-tail/turn-tail-data";
import { latestStashedDocsPath, stashDocsDraft } from "./docs/docs-draft-store";
import { ancestorDirs, type DocsFilter } from "./docs/docs-tree-model";

/**
 * 右侧面板的 Tab 模型。`id` 同时是去重 key：用稳定 id（如 `context`、`docs`、
 * `file:<相对路径>`）打开同一对象时只更新内容并聚焦，不重复堆 Tab。
 *
 * 工作区文件类 Tab 额外带一组**新鲜度**字段（`mtimeMs` / `size` / `isStale` / `truncated`）。
 * 文件内容是打开那一刻的快照，磁盘随后可能被 Agent、外部编辑器或 git 改掉，
 * 所以必须能判断「手里这份是不是过期了」。检测机制见 `useFileFreshness.ts`。
 */
export type WorkspaceFileTarget = { workspaceRoot?: string; hostId?: string };

export type WorkspaceFileMeta = WorkspaceFileTarget & {
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
  | ({ kind: "image"; title: string; src: string } & WorkspaceFileMeta)
  | ({ kind: "text"; title: string; content: string } & WorkspaceFileMeta)
  // focus：从对话卡片、通知行、工具行（看对话）或轨迹详情「查看轨迹」打开时定位到这个子智能体并停在指定视图。
  | { kind: "subagents"; title: string; sessionId: string; focus?: SubagentFocus }
  // focus：从 bash 行的「后台」标签打开时选中这条命令；revision 每次点击递增，让已打开的 Tab 再次定位。
  | { kind: "backgroundTasks"; title: string; sessionId: string; focus?: BackgroundTaskFocus }
  | { kind: "context"; title: string }
  // 「文档」面板：只有一个 Tab（id 固定为 `docs`）。select 是「打开并选中这篇」的一次性请求，openTab 消费后不会存进 Tab；
  // line（1 起始）随 select 一起，文档读完后滚到该行并选中整行，只对 Markdown 有意义。
  | { kind: "docs"; title: string; select?: string; line?: number }
  | { kind: "review"; title: string; workspaceRoot?: string; scope: "uncommitted"; refreshKey?: number }
  // 某一轮的改动快照（轮尾改动卡点开）；index 是要选中的文件，revision 每次点击递增，让同一 Tab 重新跳到该文件。
  | {
      kind: "turnReview";
      title: string;
      changes: TurnChanges;
      index: number;
      revision: number;
      sessionId: string | null;
      workspaceRoot?: string;
    }
  // 侧边对话：只在它的主会话下显示。继承轮数等打开时才知道的事实随 tab 带着，重新打开时由会话窗口推算。
  | {
      kind: "sideChat";
      title: string;
      sessionId: string;
      parentSessionId: string;
      inheritedTurnCount?: number;
      runningTurnExcluded?: boolean;
    }
);

/** 打开右侧「子 Agent」并选中一个子智能体（`agentId`，老会话是子会话 id）；`revision` 让同一个目标能再次触发。 */
export type SubagentFocus = { agentId: string; view: "chat" | "trajectory"; revision: number };
export type BackgroundTaskFocus = { taskId: string; revision: number };

export type RightPanelTabKind = RightPanelTab["kind"];

const FILE_TAB_KINDS: ReadonlySet<RightPanelTabKind> = new Set<RightPanelTabKind>(["image", "text"]);

/**
 * 是否「工作区文件 Tab」：带工作区相对路径的文件类视图（本机图片、读取失败说明）。
 * Markdown 不再有文件 Tab，统一在「文档」面板里打开。
 * 用它决定是否显示文件操作栏（路径、过期提示、外部打开）。
 */
export function isWorkspaceFileTab(tab: RightPanelTab | null | undefined): boolean {
  if (!tab) return false;
  if (FILE_TAB_KINDS.has(tab.kind)) {
    return (
      typeof (tab as WorkspaceFileMeta).relativePath === "string" &&
      ((tab as WorkspaceFileMeta).relativePath as string).length > 0
    );
  }
  return false;
}

/** 工作区文件 Tab 的稳定 id，renderer 各处必须用同一个函数生成，避免拼错导致去重失效。 */
export function workspaceFileTabId(relativePath: string, target?: WorkspaceFileTarget): string {
  return target
    ? `file:${JSON.stringify([target.hostId ?? "local", target.workspaceRoot ?? null, relativePath])}`
    : `file:${relativePath}`;
}

/** 「文档」面板当前打开的那一篇：原文、草稿和读盘时的新鲜度基线。 */
export type DocsDocState = {
  relativePath: string;
  status: "loading" | "ready" | "error";
  /** status 为 error 时给用户看的说明。 */
  message?: string;
  /** 最近一次读盘 / 保存后的内容，用来判断草稿是否改过。 */
  original: string;
  draft: string;
  /** 读取或保存时的 mtime / 字节数（磁盘完整大小），用于与磁盘现值比对。 */
  mtimeMs: number;
  size: number;
  /** 文件超过读取上限，内容只是前一段：源码只读，避免保存时丢掉后半部分。 */
  truncated: boolean;
  /** 磁盘上已变化，等用户显式重新加载。 */
  isStale: boolean;
};

export type DocsMode = "preview" | "source";

/** 「打开并滚到某行」的一次性请求：`id` 每次递增，让同一行再次打开也能重新触发。 */
export type DocsPendingLine = { path: string; line: number; id: number };

/** 有未保存的改动：截断文件只读，不会有草稿。 */
export function isDocsDocDirty(doc: DocsDocState | null | undefined): boolean {
  return Boolean(doc && doc.status === "ready" && !doc.truncated && doc.draft !== doc.original);
}

/** 最近一次取回的 Markdown 清单（属于 `root`）。 */
export type DocsListing = {
  root: string;
  files: readonly string[];
  truncated: boolean;
  source: "git" | "walk";
  /** 截断时没走完的顶层目录。 */
  incompleteDirs?: readonly string[];
  /** 这份清单是用户点「继续加载」后用放大的上限取的；之后的刷新沿用。 */
  expanded?: boolean;
};

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
  markFileTabStale: (relativePath: string, target?: WorkspaceFileTarget) => void;
  /** 用重新读盘的结果替换 Tab 内容（同时清掉 stale 标记）。 */
  replaceTab: (tab: RightPanelTab) => void;
  /**
   * 「文档」面板的状态（见 `front-文档面板规范.md`）。
   *
   * 必须放在 Provider：面板会随切换标签、收起右栏反复卸载，草稿、选中文件和展开层级留在组件里就会丢。
   */
  docsSelectedPath: string | null;
  /** 选中一篇文档（树点击、交付卡 / 聊天链接）。有未保存草稿时先弹「保存 / 不保存 / 取消」。`line` 见 `DocsPendingLine`。 */
  selectDocsPath: (path: string | null, line?: number) => void;
  /** 等待文档读完后滚到某行的请求；编辑器处理完调 `clearDocsPendingLine`。 */
  docsPendingLine: DocsPendingLine | null;
  clearDocsPendingLine: () => void;
  docsDoc: DocsDocState | null;
  /** 同步读取最新的文档状态（含还没渲染出来的草稿）：⌘S 紧跟在输入之后时，渲染里的值可能还是旧的。 */
  getDocsDoc: () => DocsDocState | null;
  setDocsDoc: (update: DocsDocState | null | ((current: DocsDocState | null) => DocsDocState | null)) => void;
  /** 预览 / 源码；每次打开新文档重置为预览。 */
  docsMode: DocsMode;
  setDocsMode: (mode: DocsMode) => void;
  docsTreeCollapsed: boolean;
  toggleDocsTreeCollapsed: () => void;
  /** 右栏展开到盖住聊天区，用于专心阅读。 */
  docsExpanded: boolean;
  toggleDocsExpanded: () => void;
  docsFilter: DocsFilter;
  setDocsFilter: (filter: DocsFilter) => void;
  /** 展开的文件夹（相对路径），换工作区时清空。 */
  expandedDirs: ReadonlySet<string>;
  toggleDir: (relativePath: string) => void;
  docsListing: DocsListing | null;
  setDocsListing: (listing: DocsListing | null) => void;
  /** 递增即让文档面板重新取 Markdown 清单。 */
  docsRefreshKey: number;
  refreshDocs: () => void;
  /**
   * 告知文档面板当前的工作区根。根变了才清空选中、草稿、展开层级和清单（旧的属于另一个根）。
   * 「上次的根」记在 Provider 里：面板会反复挂载卸载，记在组件里每次重挂都会误判成换根。
   */
  syncDocsRoot: (workspaceRoot: string | undefined) => void;
  /** 有未保存草稿时先问用户，确认离开（保存或丢弃）后才执行 `run`；没有草稿直接执行。 */
  requestDocsLeave: (run: () => void) => void;
  docsPendingLeave: { run: () => void } | null;
  clearDocsPendingLeave: () => void;
  /** 关闭 Tab 的入口：关闭「文档」且有草稿时先问用户。 */
  requestCloseTab: (id: string) => void;
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
  const [activeTabId, setActiveTabId] = useState<string | null>(
    () => (initialTabs ?? createDefaultTabs())[0]?.id ?? null,
  );
  const [expandedDirs, setExpandedDirs] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [docsSelectedPath, setDocsSelectedPath] = useState<string | null>(null);
  const [docsDoc, setDocsDocState] = useState<DocsDocState | null>(null);
  const docsDocRef = useRef<DocsDocState | null>(null);
  const [docsMode, setDocsMode] = useState<DocsMode>("preview");
  const [docsPendingLine, setDocsPendingLine] = useState<DocsPendingLine | null>(null);
  const pendingLineId = useRef(0);
  const [docsTreeCollapsed, setDocsTreeCollapsed] = useState(false);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [docsFilter, setDocsFilter] = useState<DocsFilter>("all");
  const [docsListing, setDocsListing] = useState<DocsListing | null>(null);
  const [docsRefreshKey, setDocsRefreshKey] = useState(0);
  const [docsPendingLeave, setDocsPendingLeave] = useState<{ run: () => void } | null>(null);
  // known=false 表示还没有任何面板挂载过，此时同步根不算「换根」，不该触发清空。
  const docsRootRef = useRef<{ known: boolean; root: string | undefined }>({ known: false, root: undefined });

  const setDocsDoc = useCallback<RightPanelContextValue["setDocsDoc"]>((update) => {
    // 先在 ref 上算出新值再 set，保证随后的同步读取（离开前的未保存判断）看到最新草稿。
    const next = typeof update === "function" ? update(docsDocRef.current) : update;
    docsDocRef.current = next;
    setDocsDocState(next);
  }, []);

  const getDocsDoc = useCallback(() => docsDocRef.current, []);
  const clearDocsPendingLine = useCallback(() => setDocsPendingLine(null), []);

  const selectDocsPath = useCallback(
    (path: string | null, line?: number) => {
      const current = docsDocRef.current;
      const requestLine = () => {
        if (path && line !== undefined && Number.isFinite(line) && line >= 1) {
          pendingLineId.current += 1;
          setDocsPendingLine({ path, line: Math.trunc(line), id: pendingLineId.current });
        } else {
          setDocsPendingLine(null);
        }
      };
      const apply = () => {
        requestLine();
        setDocsSelectedPath(path);
        setDocsDoc(null);
        setDocsMode("preview");
        if (path) {
          setExpandedDirs((dirs) => {
            const missing = ancestorDirs(path).filter((dir) => !dirs.has(dir));
            return missing.length === 0 ? dirs : new Set([...dirs, ...missing]);
          });
        }
      };
      if (isDocsDocDirty(current)) {
        // 同一篇不动它（草稿还在）；换到另一篇要先问。
        if (path === current?.relativePath) {
          // 草稿还在，不重读；带行号的请求仍要滚过去。
          requestLine();
          return;
        }
        setDocsPendingLeave({ run: apply });
        return;
      }
      apply();
    },
    [setDocsDoc],
  );

  const openTab = useCallback(
    (tab: RightPanelTab) => {
      // 「打开并选中」是一次性请求，不存进 Tab，免得 Tab 重放时重复选中。
      const stored: RightPanelTab =
        tab.kind === "docs" && (tab.select !== undefined || tab.line !== undefined)
          ? { id: tab.id, kind: "docs", title: tab.title }
          : tab;
      setTabs((current) => {
        const existingIndex = current.findIndex((item) => item.id === stored.id);
        if (existingIndex === -1) {
          return [...current, stored];
        }
        const next = current.slice();
        next[existingIndex] = stored;
        return next;
      });
      setActiveTabId(stored.id);
      setIsOpen(true);
      if (tab.kind === "docs" && tab.select !== undefined) selectDocsPath(tab.select, tab.line);
    },
    [selectDocsPath],
  );

  const replaceTab = useCallback((tab: RightPanelTab) => {
    setTabs((current) => {
      const index = current.findIndex((item) => item.id === tab.id);
      if (index === -1) return current;
      const next = current.slice();
      next[index] = tab;
      return next;
    });
  }, []);

  const markFileTabStale = useCallback((relativePath: string, target?: WorkspaceFileTarget) => {
    const id = workspaceFileTabId(relativePath, target);
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

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
    setIsOpen(true);
  }, []);

  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);
  const togglePanel = useCallback(() => setIsOpen((open) => !open), []);

  const toggleDocsTreeCollapsed = useCallback(() => setDocsTreeCollapsed((collapsed) => !collapsed), []);
  const toggleDocsExpanded = useCallback(() => setDocsExpanded((expanded) => !expanded), []);

  const toggleDir = useCallback((relativePath: string) => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }, []);

  const refreshDocs = useCallback(() => setDocsRefreshKey((key) => key + 1), []);

  const syncDocsRoot = useCallback(
    (nextRoot: string | undefined) => {
      const current = docsRootRef.current;
      if (current.known && current.root === nextRoot) return;
      docsRootRef.current = { known: true, root: nextRoot };
      if (!current.known) return;
      // 未保存的草稿不能随换根丢掉：先暂存，切回同一个根时恢复。
      const leaving = docsDocRef.current;
      if (current.root && leaving && leaving.status === "ready" && isDocsDocDirty(leaving)) {
        stashDocsDraft(current.root, leaving.relativePath, {
          original: leaving.original,
          draft: leaving.draft,
          mtimeMs: leaving.mtimeMs,
          size: leaving.size,
        });
      }
      // 新根下如果有暂存的草稿，直接重新选中那一篇（读盘后由 use-docs-draft 套回草稿）。
      const restorePath = nextRoot ? latestStashedDocsPath(nextRoot) : null;
      setExpandedDirs(new Set<string>(restorePath ? ancestorDirs(restorePath) : []));
      setDocsSelectedPath(restorePath);
      setDocsDoc(null);
      setDocsMode("preview");
      setDocsListing(null);
      setDocsPendingLeave(null);
      setDocsPendingLine(null);
      setDocsRefreshKey((key) => key + 1);
    },
    [setDocsDoc],
  );

  const requestDocsLeave = useCallback((run: () => void) => {
    if (isDocsDocDirty(docsDocRef.current)) setDocsPendingLeave({ run });
    else run();
  }, []);
  const clearDocsPendingLeave = useCallback(() => setDocsPendingLeave(null), []);

  const requestCloseTab = useCallback(
    (id: string) => {
      if (id !== "docs") {
        closeTab(id);
        return;
      }
      requestDocsLeave(() => {
        setDocsDoc(null);
        setDocsExpanded(false);
        closeTab(id);
      });
    },
    [closeTab, requestDocsLeave, setDocsDoc],
  );

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
      docsSelectedPath,
      selectDocsPath,
      docsPendingLine,
      clearDocsPendingLine,
      docsDoc,
      setDocsDoc,
      getDocsDoc,
      docsMode,
      setDocsMode,
      docsTreeCollapsed,
      toggleDocsTreeCollapsed,
      docsExpanded,
      toggleDocsExpanded,
      docsFilter,
      setDocsFilter,
      expandedDirs,
      toggleDir,
      docsListing,
      setDocsListing,
      docsRefreshKey,
      refreshDocs,
      syncDocsRoot,
      requestDocsLeave,
      docsPendingLeave,
      clearDocsPendingLeave,
      requestCloseTab,
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
    docsSelectedPath,
    selectDocsPath,
    docsPendingLine,
    clearDocsPendingLine,
    docsDoc,
    setDocsDoc,
    getDocsDoc,
    docsMode,
    docsTreeCollapsed,
    toggleDocsTreeCollapsed,
    docsExpanded,
    toggleDocsExpanded,
    docsFilter,
    expandedDirs,
    toggleDir,
    docsListing,
    docsRefreshKey,
    refreshDocs,
    syncDocsRoot,
    requestDocsLeave,
    docsPendingLeave,
    clearDocsPendingLeave,
    requestCloseTab,
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
