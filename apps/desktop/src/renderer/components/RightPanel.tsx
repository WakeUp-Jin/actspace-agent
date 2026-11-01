import { BackgroundTasksPanel } from "./right-panel/BackgroundTasksPanel";
import { SubagentsPanel } from "./right-panel/SubagentsPanel";
import { useContext, useEffect, useState } from "react";
import {
  Eye,
  FolderTree,
  GitBranch,
  GitFork,
  Layers,
  MessageSquare,
} from "lucide-react";
import type { SessionListItem } from "@actspace/shared";
import type { ContextState } from "@actspace/shared";
import { CodeRenderView } from "./right-panel/CodeRenderView";
import { ContextPanel } from "./right-panel/context/ContextPanel";
import { MarkdownRenderView } from "./right-panel/MarkdownRenderView";
import { ReviewRenderView } from "./right-panel/ReviewRenderView";
import { TurnReviewView } from "./turn-tail/TurnReviewView";
import { WorkspaceFileTree } from "./right-panel/WorkspaceFileTree";
import { RightPanelTabStrip } from "./right-panel/RightPanelTabStrip";
import { RightPanelLauncherList, type RightPanelLauncherItem } from "./right-panel/RightPanelLauncherList";
import { SideChatView } from "./right-panel/side-chat/SideChatView";
import { useSideChatRuntime } from "./right-panel/side-chat/side-chat-runtime";
import { sideChatAge, sideChatListTitle } from "./right-panel/side-chat/side-chat-transcript";
import { useOpenSideChat } from "./right-panel/side-chat/use-open-side-chat";
import { SESSION_STATUS_META, type SessionUiStatusKind } from "./sidebar/session-status";
import { ActiveSessionContext } from "../session/active-session-context";
import {
  isWorkspaceFileTab,
  useRightPanel,
  type RightPanelTab,
} from "./right-panel/RightPanelContext";
import { useFileFreshness } from "./right-panel/useFileFreshness";
import { WorkspaceOperationBar } from "./right-panel/WorkspaceOperationBar";

const RIGHT_PANEL_CLASS = "flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-surface";
// 右面板纵向三段（对齐 Cursor 右侧）：① tab 条（全宽）→ ② 工作区操作栏（全宽，仅浏览态出现）→ ③ 两栏 [内容 | 文件树]。
// 文件树在**右**栏：内容区紧邻聊天区，视线从消息移到代码不用跨过一条树栏。
const RIGHT_PANEL_SPLIT_CLASS = "flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden";
const RIGHT_PANEL_CONTENT_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
const RIGHT_PANEL_BODY_CLASS = "min-h-0 flex-1 overflow-auto p-[18px] leading-[1.6] text-text-main";
const RIGHT_PANEL_HEADING_CLASS = "m-0 mb-2 text-act-md font-semibold";
const RIGHT_PANEL_TEXT_CLASS = "m-0 text-act-sm text-text-muted";
export function RightPanel({
  developmentEnabled = true,
  contextState,
  contextRevision,
  sessionId,
  workspaceRoot,
  fileRevalidateKey,
  onOpenReview,
  onReviewChanged,
  onSendToAgent,
}: {
  developmentEnabled?: boolean;
  contextState?: ContextState | null;
  contextRevision?: number;
  sessionId?: string | null;
  workspaceRoot?: string;
  /** 递增即触发已打开文件 Tab 的新鲜度重校验（当前会话 turn 结束时由 App 递增）。 */
  fileRevalidateKey?: number;
  onOpenReview?: () => void;
  onReviewChanged?: () => void;
  onSendToAgent?: (text: string) => void;
}) {
  const { activeTab, isFileTreeOpen, isFileTreeCollapsed } = useRightPanel();
  useFileFreshness({ workspaceRoot, revalidateKey: fileRevalidateKey, enabled: developmentEnabled });

  // 呈现由「当前 Tab」决定：
  // - 工作区文件 Tab → 进入 shell（树 + 文件预览区），多个文件 Tab 间切换只换 shell 内的内容；
  // - 浏览态显式打开（isFileTreeOpen，例如刚点 + 菜单还没选文件）→ 也进入 shell，但内容区显示占位；
  // - 否则（对象 Tab）→ 走整面板，展示它自己的视图。
  // 侧边对话只在它的主会话下出现；切到别的会话时它的 tab 隐藏，激活的那个退回启动页。
  const visibleActiveTab = activeTab && !isVisibleTab(activeTab, sessionId ?? null) ? null : activeTab;
  const isFileTab = isWorkspaceFileTab(activeTab);
  const showShell = developmentEnabled && (isFileTab || isFileTreeOpen);
  const showTree = showShell && !isFileTreeCollapsed;

  return (
    <aside className={RIGHT_PANEL_CLASS}>
      <RightPanelTabs developmentEnabled={developmentEnabled} sessionId={sessionId ?? null} />
      {showShell ? <WorkspaceOperationBar activeTab={activeTab} workspaceRoot={workspaceRoot} /> : null}
      <div className={RIGHT_PANEL_SPLIT_CLASS}>
        <div className={RIGHT_PANEL_CONTENT_CLASS}>
          {showShell && !isFileTab ? (
            <WorkspaceFileEmpty />
          ) : (
            <RightPanelBody
              tab={!developmentEnabled && visibleActiveTab && isDevelopmentTab(visibleActiveTab) ? null : visibleActiveTab}
              developmentEnabled={developmentEnabled}
              contextState={contextState}
              contextRevision={contextRevision}
              sessionId={sessionId}
              workspaceRoot={workspaceRoot}
              onOpenReview={onOpenReview}
              onReviewChanged={onReviewChanged}
              onSendToAgent={onSendToAgent}
            />
          )}
        </div>
        {showTree ? <WorkspaceFileTree key={workspaceRoot ?? ""} workspaceRoot={workspaceRoot} /> : null}
      </div>
    </aside>
  );
}

/** 工作区态下激活的是对象 Tab 时的文件预览区占位。 */
function WorkspaceFileEmpty() {
  return (
    <div className={RIGHT_PANEL_BODY_CLASS}>
      <h2 className={RIGHT_PANEL_HEADING_CLASS}>选择文件查看</h2>
      <p className={RIGHT_PANEL_TEXT_CLASS}>
        在右侧文件树中点击文件，将在这里打开预览。上下文等对象请关闭「工作区文件」后查看完整视图。
      </p>
    </div>
  );
}

function isVisibleTab(tab: RightPanelTab, sessionId: string | null): boolean {
  return tab.kind !== "sideChat" || tab.parentSessionId === sessionId;
}

/** 侧边对话 tab 前的状态：运行中转圈，待审批、未读、失败是小圆点，空闲是分叉图标。 */
function SideChatTabIcon({ status }: { status: SessionUiStatusKind | undefined }) {
  if (!status || status === "idle") return <GitFork size={12} strokeWidth={2} aria-hidden="true" />;
  const meta = SESSION_STATUS_META[status];
  return <span className={`inline-block ${meta.dotClass}`} role="img" aria-label={meta.label} />;
}

function isDevelopmentTab(tab: RightPanelTab): boolean {
  return isWorkspaceFileTab(tab) || ["review", "turnReview", "subagents", "backgroundTasks"].includes(tab.kind);
}

// 展示部分在 RightPanelTabStrip；这里只管普通会话的 Tab 来源。
function RightPanelTabs({ developmentEnabled, sessionId }: { developmentEnabled: boolean; sessionId: string | null }) {
  const { tabs: allTabs, activeTabId, setActiveTab, closeTab, isFileTreeOpen } = useRightPanel();
  const sideChat = useSideChatRuntime();
  const tabs = allTabs.filter((tab) => isVisibleTab(tab, sessionId) && (developmentEnabled || !isDevelopmentTab(tab)));
  return (
    <RightPanelTabStrip
      label="右侧面板"
      emptyTitle={developmentEnabled && isFileTreeOpen ? "文件" : "对象"}
      activeId={activeTabId}
      items={tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        label: tab.title,
        ...(tab.kind === "sideChat" ? { icon: <SideChatTabIcon status={sideChat?.statuses[tab.sessionId]} />, closeVerb: "收起" } : {}),
      }))}
      onSelect={setActiveTab}
      onClose={closeTab}
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
  onOpenReview,
  onReviewChanged,
  onSendToAgent,
}: {
  developmentEnabled: boolean;
  tab: RightPanelTab | null;
  contextState?: ContextState | null;
  contextRevision?: number;
  sessionId?: string | null;
  workspaceRoot?: string;
  onOpenReview?: () => void;
  onReviewChanged?: () => void;
  onSendToAgent?: (text: string) => void;
}) {
  const { openTab } = useRightPanel();
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

  if (tab.kind === "subagents") return <SubagentsPanel key={sessionId ?? "none"} sessionId={sessionId ?? null} selected={tab.sessionId === sessionId ? tab.selected : undefined} focus={tab.sessionId === sessionId ? tab.focus : undefined} />;

  if (tab.kind === "backgroundTasks") return <BackgroundTasksPanel key={sessionId ?? "none"} sessionId={sessionId ?? null} focus={tab.sessionId === sessionId ? tab.focus : undefined} />;

  if (tab.kind === "review") {
    return (
      <ReviewRenderView
        workspaceRoot={tab.workspaceRoot ?? workspaceRoot}
        sessionId={sessionId}
        refreshKey={tab.refreshKey}
        onReviewChanged={onReviewChanged}
      />
    );
  }

  if (tab.kind === "turnReview") return <TurnReviewView tab={tab} />;

  if (tab.kind === "markdown") {
    return <MarkdownTab tab={tab} />;
  }

  if (tab.kind === "image") {
    return <ImageRenderView src={tab.src} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "text") {
    return <CodeRenderView content={tab.content} />;
  }

  return <ContextPanel key={sessionId ?? "none"} sessionId={sessionId ?? null} contextState={contextState} contextRevision={contextRevision} workspaceRoot={workspaceRoot} />;
}

/**
 * 工作区文件 Tab 的预览 / 源码由操作栏按钮控制（受控）；
 * 聊天生成的 markdown 没有操作栏，交给视图自己带切换控件（不受控）。
 */
function MarkdownTab({ tab }: { tab: Extract<RightPanelTab, { kind: "markdown" }> }) {
  const { isSourceShown, setSourceShown } = useRightPanel();
  if (!isWorkspaceFileTab(tab)) {
    return <MarkdownRenderView source={tab.source} />;
  }
  return (
    <MarkdownRenderView
      source={tab.source}
      mode={isSourceShown(tab.id) ? "source" : "preview"}
      onModeChange={(next) => setSourceShown(tab.id, next === "source")}
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
  const { openFileTree, openTab, tabs } = useRightPanel();
  const sideChat = useOpenSideChat(sessionId);
  const collapsedSideChats = useCollapsedSideChats(sessionId, tabs);
  const items: RightPanelLauncherItem[] = [];
  if (sideChat.available || sideChat.error) {
    items.push({
      id: "side-chat",
      label: sideChat.opening ? "正在打开…" : "侧边对话",
      description: sideChat.error ?? "另起一条线问，带上目前为止的上下文",
      icon: <GitFork size={15} strokeWidth={1.8} />,
      disabled: !sideChat.available || sideChat.opening,
      onClick: () => void sideChat.open().catch(() => undefined),
    });
  }
  if (developmentEnabled) {
    items.push(
      {
        id: "subagents",
        label: "子 Agent",
        description: "这次对话派出的一次性助手",
        icon: <MessageSquare size={15} strokeWidth={1.8} />,
        disabled: !sessionId,
        onClick: () => sessionId && openTab({ id: "subagents", kind: "subagents", title: "子 Agent", sessionId }),
      },
      {
        id: "background-tasks",
        label: "后台任务",
        description: "在后台跑的命令",
        icon: <Layers size={15} strokeWidth={1.8} />,
        disabled: !sessionId,
        onClick: () => sessionId && openTab({ id: "background-tasks", kind: "backgroundTasks", title: "后台任务", sessionId }),
      },
      {
        id: "files",
        label: "文件",
        description: "浏览工作目录",
        icon: <FolderTree size={15} strokeWidth={1.8} />,
        onClick: openFileTree,
      },
      {
        id: "review",
        label: "Review",
        description: "这次的改动",
        icon: <GitBranch size={15} strokeWidth={1.8} />,
        disabled: !onOpenReview,
        onClick: onOpenReview,
      },
    );
  }
  items.push({
    id: "context",
    label: "上下文",
    description: "上下文用了多少",
    icon: <Eye size={15} strokeWidth={1.8} />,
    onClick: () => openTab({ id: "context", kind: "context", title: "上下文" }),
  });
  return (
    <RightPanelLauncherList
      label="右侧面板对象"
      items={items}
      groups={[{
        id: "side-chats",
        caption: "本会话的侧边对话 · 已收起",
        items: collapsedSideChats.map(({ item, title }) => ({
          id: `side-chat:${item.id}`,
          label: title,
          description: sideChatAge(item.updatedAt),
          icon: <GitFork size={15} strokeWidth={1.8} />,
          onClick: () => sideChat.reopen(item, title),
        })),
      }]}
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
    if (!sessionId || !list) { setItems([]); return; }
    let cancelled = false;
    void list(sessionId).then((next) => { if (!cancelled) setItems(next); }, (error: unknown) => console.error("Failed to list side chats", error));
    return () => { cancelled = true; };
  }, [sessionId, list, tabs.length]);
  const open = new Set(tabs.flatMap((tab) => tab.kind === "sideChat" ? [tab.sessionId] : []));
  return items
    .map((item, index) => ({ item, title: sideChatListTitle(item, parentTitle, index) }))
    .filter(({ item }) => !open.has(item.id));
}

// 路径已统一移到工作区操作栏（②），各文件视图不再自带 path 工具条，避免相邻两行重复同一路径。
function ImageRenderView({ src, relativePath }: { src: string; relativePath?: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-surface-subtle p-4">
      <img src={src} alt={relativePath ?? "预览图片"} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
