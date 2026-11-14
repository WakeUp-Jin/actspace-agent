import { BackgroundTasksPanel } from "./right-panel/BackgroundTasksPanel";
import { SubagentsPanel } from "./lazy-pages";
import { Suspense, memo, useContext, useEffect, useMemo, useState } from "react";
import { BookOpen, Eye, GitBranch, GitFork, Layers, MessageSquare } from "lucide-react";
import type { SessionListItem } from "@actspace/shared";
import type { ContextState } from "@actspace/shared";
import { CodeRenderView } from "./right-panel/CodeRenderView";
import { ContextPanel } from "./right-panel/context/ContextPanel";
import { DocsLeaveDialog } from "./right-panel/docs/DocsLeaveDialog";
import { DocsPanel } from "./right-panel/docs/DocsPanel";
import { editedMarkdownPaths } from "./right-panel/docs/docs-tree-model";
import { ReviewRenderView } from "./right-panel/ReviewRenderView";
import { TurnReviewView } from "./turn-tail/TurnReviewView";
import { RightPanelTabStrip } from "./right-panel/RightPanelTabStrip";
import { RightPanelLauncherList, type RightPanelLauncherItem } from "./right-panel/RightPanelLauncherList";
import { SideChatView } from "./right-panel/side-chat/SideChatView";
import { useSideChatRuntime } from "./right-panel/side-chat/side-chat-runtime";
import { sideChatAge, sideChatListTitle } from "./right-panel/side-chat/side-chat-transcript";
import { useOpenSideChat } from "./right-panel/side-chat/use-open-side-chat";
import { SESSION_STATUS_META, type SessionUiStatusKind } from "./sidebar/session-status";
import { ActiveSessionContext } from "../session/active-session-context";
import { isWorkspaceFileTab, useRightPanel, type RightPanelTab } from "./right-panel/RightPanelContext";
import { useFileFreshness } from "./right-panel/useFileFreshness";
import { WorkspaceOperationBar } from "./right-panel/WorkspaceOperationBar";

const RIGHT_PANEL_CLASS = "flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-surface";
// 右面板纵向两段：① tab 条（全宽）→ ② 内容。文件标签（本机图片）在内容上方多一条操作栏；
// 「MD 文档」标签的操作栏和目录树都在它自己的面板里（`right-panel/docs`）。
const RIGHT_PANEL_CONTENT_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
export const RightPanel = memo(function RightPanel({
  developmentEnabled = true,
  contextState,
  contextRevision,
  sessionId,
  workspaceRoot,
  fileRevalidateKey,
  agentEditedPaths,
  onOpenReview,
  onSendToAgent,
}: {
  developmentEnabled?: boolean;
  contextState?: ContextState | null;
  contextRevision?: number;
  sessionId?: string | null;
  workspaceRoot?: string;
  /** 递增即触发已打开文件 Tab 的新鲜度重校验、文档清单刷新（当前会话 turn 结束时由 App 递增）。 */
  fileRevalidateKey?: number;
  /** 当前会话里 Agent 写过 / 改过的文件路径（绝对或工作区相对），「MD 文档」面板据此标绿点。 */
  agentEditedPaths?: readonly string[];
  onOpenReview?: () => void;
  onSendToAgent?: (text: string) => void;
}) {
  const { activeTab } = useRightPanel();
  useFileFreshness({ workspaceRoot, revalidateKey: fileRevalidateKey, enabled: developmentEnabled });
  const editedPaths = useMemo(
    () => editedMarkdownPaths(agentEditedPaths ?? [], workspaceRoot),
    [agentEditedPaths, workspaceRoot],
  );

  // 侧边对话只在它的主会话下出现；切到别的会话时它的 tab 隐藏，激活的那个退回启动页。
  const visibleActiveTab = activeTab && !isVisibleTab(activeTab, sessionId ?? null) ? null : activeTab;
  const showFileBar = developmentEnabled && isWorkspaceFileTab(activeTab);

  return (
    <aside className={RIGHT_PANEL_CLASS}>
      <RightPanelTabs developmentEnabled={developmentEnabled} sessionId={sessionId ?? null} />
      {showFileBar ? <WorkspaceOperationBar activeTab={activeTab} workspaceRoot={workspaceRoot} /> : null}
      <div className={RIGHT_PANEL_CONTENT_CLASS}>
        <RightPanelBody
          tab={!developmentEnabled && visibleActiveTab && isDevelopmentTab(visibleActiveTab) ? null : visibleActiveTab}
          developmentEnabled={developmentEnabled}
          contextState={contextState}
          contextRevision={contextRevision}
          sessionId={sessionId}
          workspaceRoot={workspaceRoot}
          fileRevalidateKey={fileRevalidateKey}
          editedPaths={editedPaths}
          onOpenReview={onOpenReview}
          onSendToAgent={onSendToAgent}
        />
      </div>
      <DocsLeaveDialog workspaceRoot={workspaceRoot} />
    </aside>
  );
});

function isVisibleTab(tab: RightPanelTab, sessionId: string | null): boolean {
  return tab.kind !== "sideChat" || tab.parentSessionId === sessionId;
}

/** 侧边对话 tab 前的状态：运行中转圈，待审批、未读、失败是小圆点，空闲是分叉图标。 */
function SideChatTabIcon({ status }: { status: SessionUiStatusKind | undefined }) {
  if (!status || status === "idle") return <GitFork size={12} aria-hidden="true" />;
  const meta = SESSION_STATUS_META[status];
  return <span className={`inline-block ${meta.dotClass}`} role="img" aria-label={meta.label} />;
}

function isDevelopmentTab(tab: RightPanelTab): boolean {
  return isWorkspaceFileTab(tab) || ["docs", "review", "turnReview", "subagents", "backgroundTasks"].includes(tab.kind);
}

// 展示部分在 RightPanelTabStrip；这里只管普通会话的 Tab 来源。
function RightPanelTabs({ developmentEnabled, sessionId }: { developmentEnabled: boolean; sessionId: string | null }) {
  const { tabs: allTabs, activeTabId, setActiveTab, requestCloseTab } = useRightPanel();
  const sideChat = useSideChatRuntime();
  const tabs = allTabs.filter((tab) => isVisibleTab(tab, sessionId) && (developmentEnabled || !isDevelopmentTab(tab)));
  return (
    <RightPanelTabStrip
      label="右侧面板"
      emptyTitle="对象"
      activeId={activeTabId}
      items={tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        label: tab.title,
        ...(tab.kind === "sideChat"
          ? { icon: <SideChatTabIcon status={sideChat?.statuses[tab.sessionId]} />, closeVerb: "收起" }
          : {}),
      }))}
      onSelect={setActiveTab}
      onClose={requestCloseTab}
    />
  );
}

function RightPanelBody({
  developmentEnabled,
  tab,
  contextState,
  contextRevision,
  sessionId,
  workspaceRoot,
  fileRevalidateKey,
  editedPaths,
  onOpenReview,
  onSendToAgent,
}: {
  developmentEnabled: boolean;
  tab: RightPanelTab | null;
  contextState?: ContextState | null;
  contextRevision?: number;
  sessionId?: string | null;
  workspaceRoot?: string;
  fileRevalidateKey?: number;
  editedPaths: ReadonlySet<string>;
  onOpenReview?: () => void;
  onSendToAgent?: (text: string) => void;
}) {
  if (!tab) {
    return (
      <RightPanelLauncher
        developmentEnabled={developmentEnabled}
        sessionId={sessionId ?? null}
        onOpenReview={onOpenReview}
      />
    );
  }

  if (tab.kind === "sideChat") return <SideChatView tab={tab} />;

  if (tab.kind === "subagents")
    return (
      <Suspense fallback={null}>
        <SubagentsPanel
          key={sessionId ?? "none"}
          sessionId={sessionId ?? null}
          focus={tab.sessionId === sessionId ? tab.focus : undefined}
        />
      </Suspense>
    );

  if (tab.kind === "backgroundTasks")
    return (
      <BackgroundTasksPanel
        key={sessionId ?? "none"}
        sessionId={sessionId ?? null}
        focus={tab.sessionId === sessionId ? tab.focus : undefined}
      />
    );

  if (tab.kind === "review") {
    return (
      <ReviewRenderView
        workspaceRoot={tab.workspaceRoot ?? workspaceRoot}
        sessionId={sessionId}
        refreshKey={tab.refreshKey}
      />
    );
  }

  if (tab.kind === "turnReview") return <TurnReviewView tab={tab} />;

  if (tab.kind === "docs") {
    return <DocsPanel workspaceRoot={workspaceRoot} revalidateKey={fileRevalidateKey} editedPaths={editedPaths} />;
  }

  if (tab.kind === "image") {
    return <ImageRenderView src={tab.src} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "text") {
    return <CodeRenderView content={tab.content} />;
  }

  return (
    <ContextPanel
      key={sessionId ?? "none"}
      sessionId={sessionId ?? null}
      contextState={contextState}
      contextRevision={contextRevision}
      workspaceRoot={workspaceRoot}
    />
  );
}

function RightPanelLauncher({
  developmentEnabled,
  sessionId,
  onOpenReview,
}: {
  developmentEnabled: boolean;
  sessionId: string | null;
  onOpenReview?: () => void;
}) {
  const { openTab, tabs } = useRightPanel();
  const sideChat = useOpenSideChat(sessionId);
  const collapsedSideChats = useCollapsedSideChats(sessionId, tabs);
  const items: RightPanelLauncherItem[] = [];
  if (sideChat.available || sideChat.error) {
    items.push({
      id: "side-chat",
      label: sideChat.opening ? "正在打开…" : "侧边对话",
      description: sideChat.error ?? "另起一条线问，带上目前为止的上下文",
      icon: <GitFork size={15} />,
      disabled: !sideChat.available || sideChat.opening,
      onClick: () => void sideChat.open().catch(() => undefined),
    });
  }
  if (developmentEnabled) {
    items.push(
      {
        id: "subagents",
        label: "子 Agent",
        description: "这次对话派出的子智能体，每个做完一件事就结束",
        icon: <MessageSquare size={15} />,
        disabled: !sessionId,
        onClick: () => sessionId && openTab({ id: "subagents", kind: "subagents", title: "子 Agent", sessionId }),
      },
      {
        id: "background-tasks",
        label: "后台任务",
        description: "在后台跑的命令",
        icon: <Layers size={15} />,
        disabled: !sessionId,
        onClick: () =>
          sessionId && openTab({ id: "background-tasks", kind: "backgroundTasks", title: "后台任务", sessionId }),
      },
      {
        id: "docs",
        label: "MD 文档",
        description: "工作区里的 Markdown，可预览和编辑",
        icon: <BookOpen size={15} />,
        onClick: () => openTab({ id: "docs", kind: "docs", title: "MD 文档" }),
      },
      {
        id: "review",
        label: "改动",
        description: "这次的改动",
        icon: <GitBranch size={15} />,
        disabled: !onOpenReview,
        onClick: onOpenReview,
      },
    );
  }
  items.push({
    id: "context",
    label: "上下文",
    description: "上下文用了多少",
    icon: <Eye size={15} />,
    onClick: () => openTab({ id: "context", kind: "context", title: "上下文" }),
  });
  return (
    <RightPanelLauncherList
      label="右侧面板对象"
      items={items}
      groups={[
        {
          id: "side-chats",
          caption: "本会话的侧边对话 · 已收起",
          items: collapsedSideChats.map(({ item, title }) => ({
            id: `side-chat:${item.id}`,
            label: title,
            description: sideChatAge(item.updatedAt),
            icon: <GitFork size={15} />,
            onClick: () => sideChat.reopen(item, title),
          })),
        },
      ]}
    />
  );
}

/** 当前主会话下、没有开着 tab 的侧边对话，按创建先后编号。 */
function useCollapsedSideChats(sessionId: string | null, tabs: readonly RightPanelTab[]) {
  const runtime = useSideChatRuntime();
  const parentTitle = useContext(ActiveSessionContext)?.title;
  const [items, setItems] = useState<SessionListItem[]>([]);
  const list = runtime?.available ? runtime.list : null;
  useEffect(() => {
    if (!sessionId || !list) {
      setItems([]);
      return;
    }
    let cancelled = false;
    void list(sessionId).then(
      (next) => {
        if (!cancelled) setItems(next);
      },
      (error: unknown) => console.error("Failed to list side chats", error),
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId, list, tabs.length]);
  const open = new Set(tabs.flatMap((tab) => (tab.kind === "sideChat" ? [tab.sessionId] : [])));
  return items
    .map((item, index) => ({ item, title: sideChatListTitle(item, parentTitle, index) }))
    .filter(({ item }) => !open.has(item.id));
}

// 路径在文件操作栏里，图片视图不再自带 path 工具条，避免相邻两行重复同一路径。
function ImageRenderView({ src, relativePath }: { src: string; relativePath?: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-surface-subtle p-4">
      <img src={src} alt={relativePath ?? "预览图片"} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
