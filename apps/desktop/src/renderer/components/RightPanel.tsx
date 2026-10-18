import { SubagentsPanel } from "./right-panel/SubagentsPanel";
import { terminalDisplayTitle } from "./right-panel/terminal-title";
import { Suspense, useEffect, useState } from "react";
import {
  Eye,
  FolderTree,
  GitBranch,
  Loader2,
  MessageSquare,
  SquareTerminal,
} from "lucide-react";
import type { ContextState, TerminalSessionSnapshot } from "@actspace/shared";
import { CodeRenderView } from "./right-panel/CodeRenderView";
import { ContextPanel } from "./right-panel/context/ContextPanel";
import { CsvRenderView } from "./right-panel/CsvRenderView";
import { HtmlRenderView } from "./right-panel/HtmlRenderView";
import { MarkdownRenderView } from "./right-panel/MarkdownRenderView";
import { ReplyHtmlRenderView } from "./right-panel/ReplyHtmlRenderView";
import { ReviewRenderView } from "./right-panel/ReviewRenderView";
import { TurnReviewView } from "./turn-tail/TurnReviewView";
import { WorkspaceFileTree } from "./right-panel/WorkspaceFileTree";
import { RightPanelTabStrip } from "./right-panel/RightPanelTabStrip";
import { RightPanelLauncherList, type RightPanelLauncherItem } from "./right-panel/RightPanelLauncherList";
import {
  isWorkspaceFileTab,
  useRightPanel,
  type RightPanelTab,
} from "./right-panel/RightPanelContext";
import { useFileFreshness } from "./right-panel/useFileFreshness";
import { WorkspaceOperationBar } from "./right-panel/WorkspaceOperationBar";
import { cancelTerminalStart, useOpenTerminal } from "./right-panel/useOpenTerminal";
import { LazyTerminalRenderView, preloadTerminalRenderView } from "./right-panel/terminal-render-loader";
import { terminalApi } from "../api/terminal";

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
  const { activeTab, isFileTreeOpen, isFileTreeCollapsed, syncTerminalTabs } = useRightPanel();
  useFileFreshness({ workspaceRoot, revalidateKey: fileRevalidateKey, enabled: developmentEnabled });

  useEffect(() => {
    if (!developmentEnabled) return;
    if (!sessionId) {
      syncTerminalTabs("", []);
      return;
    }
    let cancelled = false;
    void terminalApi.list({ sessionId }).then((result) => {
      if (!cancelled) syncTerminalTabs(sessionId, result.terminals);
    });
    return () => { cancelled = true; };
  }, [sessionId, syncTerminalTabs, developmentEnabled]);

  // 呈现由「当前 Tab」决定：
  // - 工作区文件 Tab → 进入 shell（树 + 文件预览区），多个文件 Tab 间切换只换 shell 内的内容；
  // - 浏览态显式打开（isFileTreeOpen，例如刚点 + 菜单还没选文件）→ 也进入 shell，但内容区显示占位；
  // - 否则（对象 Tab）→ 走整面板，展示它自己的视图。
  const isFileTab = isWorkspaceFileTab(activeTab);
  const showShell = developmentEnabled && (isFileTab || isFileTreeOpen);
  const showTree = showShell && !isFileTreeCollapsed;

  return (
    <aside className={RIGHT_PANEL_CLASS}>
      <RightPanelTabs developmentEnabled={developmentEnabled} />
      {showShell ? <WorkspaceOperationBar activeTab={activeTab} workspaceRoot={workspaceRoot} /> : null}
      <div className={RIGHT_PANEL_SPLIT_CLASS}>
        <div className={RIGHT_PANEL_CONTENT_CLASS}>
          {showShell && !isFileTab ? (
            <WorkspaceFileEmpty />
          ) : (
            <RightPanelBody
              tab={!developmentEnabled && activeTab && isDevelopmentTab(activeTab) ? null : activeTab}
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
        {showTree ? <WorkspaceFileTree workspaceRoot={workspaceRoot} /> : null}
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
        在右侧文件树中点击文件，将在这里打开预览。上下文、可视化回复等对象请关闭「工作区文件」后查看完整视图。
      </p>
    </div>
  );
}

function isDevelopmentTab(tab: RightPanelTab): boolean {
  return isWorkspaceFileTab(tab) || ["review", "turnReview", "subagents", "terminal", "terminalStarting", "terminalError"].includes(tab.kind);
}

// 展示部分在 RightPanelTabStrip；这里只管普通会话的 Tab 来源和终端的异步关闭。
function RightPanelTabs({ developmentEnabled }: { developmentEnabled: boolean }) {
  const { tabs: allTabs, activeTabId, setActiveTab, closeTab, isFileTreeOpen } = useRightPanel();
  const tabs = developmentEnabled ? allTabs : allTabs.filter((tab) => !isDevelopmentTab(tab));
  const [closeErrors, setCloseErrors] = useState<Record<string, string>>({});
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(() => new Set());

  const closeRightTab = async (tab: RightPanelTab) => {
    if (closingTabIds.has(tab.id)) return;
    if (tab.kind === "terminalStarting") {
      cancelTerminalStart(tab.requestId);
    }
    if (tab.kind === "terminal") {
      setClosingTabIds((current) => new Set(current).add(tab.id));
      try {
        const result = await terminalApi.close({ terminalId: tab.terminalId });
        if (result.ok === false) {
          setCloseErrors((current) => ({ ...current, [tab.id]: result.error.message }));
          setClosingTabIds((current) => {
            const next = new Set(current);
            next.delete(tab.id);
            return next;
          });
          return;
        }
      } catch (error) {
        setCloseErrors((current) => ({
          ...current,
          [tab.id]: error instanceof Error ? error.message : String(error),
        }));
        setClosingTabIds((current) => {
          const next = new Set(current);
          next.delete(tab.id);
          return next;
        });
        return;
      }
    }
    setCloseErrors((current) => {
      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setClosingTabIds((current) => {
      if (!current.has(tab.id)) return current;
      const next = new Set(current);
      next.delete(tab.id);
      return next;
    });
    closeTab(tab.id);
  };

  return (
    <RightPanelTabStrip
      label="右侧面板"
      emptyTitle={developmentEnabled && isFileTreeOpen ? "文件" : "对象"}
      activeId={activeTabId}
      items={tabs.map((tab) => {
        const isClosing = closingTabIds.has(tab.id);
        return {
          id: tab.id,
          title: tab.title,
          label: isClosing ? "正在关闭…" : tab.kind === "terminalStarting" ? "正在启动…" : tab.title,
          closing: isClosing,
          closeHint: closeErrors[tab.id],
        };
      })}
      onSelect={setActiveTab}
      onClose={(id) => {
        const tab = tabs.find((item) => item.id === id);
        if (tab) void closeRightTab(tab);
      }}
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

  if (tab.kind === "subagents") return <SubagentsPanel key={sessionId ?? "none"} sessionId={sessionId ?? null} selected={tab.sessionId === sessionId ? tab.selected : undefined} />;

  if (tab.kind === "replyHtml") {
    return <ReplyHtmlRenderView sessionId={tab.sessionId} />;
  }

  if (tab.kind === "review") {
    return (
      <ReviewRenderView
        workspaceRoot={workspaceRoot}
        sessionId={sessionId}
        refreshKey={tab.refreshKey}
        onReviewChanged={onReviewChanged}
      />
    );
  }

  if (tab.kind === "turnReview") return <TurnReviewView tab={tab} />;

  if (tab.kind === "terminal") {
    return (
      <Suspense fallback={<div className={RIGHT_PANEL_BODY_CLASS}>正在加载终端…</div>}>
        <LazyTerminalRenderView
          terminalId={tab.terminalId}
          sessionId={tab.sessionId}
          shellName={tab.shellName}
          onRestart={(terminal: TerminalSessionSnapshot) => openTab({
            ...tab,
            title: terminalDisplayTitle(terminal.title),
            terminalId: terminal.id,
            shellName: terminal.shellName,
          })}
        />
      </Suspense>
    );
  }

  if (tab.kind === "terminalStarting") {
    return <TerminalStartingView />;
  }

  if (tab.kind === "terminalError") {
    return <TerminalErrorView message={tab.message} />;
  }

  if (tab.kind === "html") {
    return <HtmlTab tab={tab} />;
  }

  if (tab.kind === "markdown") {
    return <MarkdownTab tab={tab} />;
  }

  if (tab.kind === "image") {
    return <ImageRenderView src={tab.src} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "csv") {
    return <CsvRenderView content={tab.content} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "text") {
    return <CodeRenderView content={tab.content} language={tab.language} />;
  }

  return <ContextPanel key={sessionId ?? "none"} sessionId={sessionId ?? null} contextState={contextState} contextRevision={contextRevision} workspaceRoot={workspaceRoot} />;
}

/**
 * 工作区文件 Tab 的预览 / 源码由操作栏按钮控制（受控）；
 * 聊天生成的 markdown/html 没有操作栏，交给视图自己带切换控件（不受控）。
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

function HtmlTab({ tab }: { tab: Extract<RightPanelTab, { kind: "html" }> }) {
  const { isSourceShown, setSourceShown } = useRightPanel();
  if (!isWorkspaceFileTab(tab)) {
    return <HtmlRenderView html={tab.html} trust={tab.trust} relativePath={tab.relativePath} />;
  }
  return (
    <HtmlRenderView
      html={tab.html}
      trust={tab.trust}
      relativePath={tab.relativePath}
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
  const { openFileTree, openTab } = useRightPanel();
  const { openTerminal, creatingTerminal } = useOpenTerminal(sessionId);
  const items: RightPanelLauncherItem[] = [];
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
  if (developmentEnabled) {
    items.push({
      id: "terminal",
      label: creatingTerminal ? "正在启动…" : "终端",
      description: "在这个目录里开终端",
      icon: <SquareTerminal size={15} strokeWidth={1.8} />,
      disabled: !sessionId || creatingTerminal,
      onClick: () => void openTerminal(),
      onPointerEnter: () => void preloadTerminalRenderView(),
      onFocus: () => void preloadTerminalRenderView(),
    });
  }
  items.push({
    id: "reply",
    label: "可视化回复",
    description: "图表、页面形式的回复",
    icon: <MessageSquare size={15} strokeWidth={1.8} />,
    onClick: () => openTab({ id: "reply", kind: "replyHtml", title: "可视化回复", sessionId }),
  });

  return <RightPanelLauncherList label="右侧面板对象" items={items} />;
}

function TerminalStartingView() {
  return (
    <section className="grid min-h-0 flex-1 place-items-center bg-surface px-6" aria-label="Terminal 正在启动">
      <div className="flex max-w-[260px] flex-col items-center text-center">
        <span className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-act-md border border-line bg-surface-subtle text-text-muted">
          <Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </span>
        <h2 className="m-0 text-act-sm font-semibold text-text-main">正在启动终端</h2>
        <p className="mb-0 mt-1.5 text-act-xxs leading-relaxed text-text-faint">正在读取本机 Shell 环境并连接当前工作区。</p>
      </div>
    </section>
  );
}

function TerminalErrorView({ message }: { message: string }) {
  return (
    <section className="grid min-h-0 flex-1 place-items-center bg-surface px-6" aria-label="Terminal 启动失败">
      <div className="max-w-[280px] rounded-act-md border border-line bg-surface-subtle px-4 py-3">
        <h2 className="m-0 text-act-sm font-semibold text-text-main">Terminal 启动失败</h2>
        <p className="mb-0 mt-1.5 text-act-xxs leading-relaxed text-text-muted" role="alert">{message}</p>
      </div>
    </section>
  );
}
// 路径已统一移到工作区操作栏（②），各文件视图不再自带 path 工具条，避免相邻两行重复同一路径。
function ImageRenderView({ src, relativePath }: { src: string; relativePath?: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-surface-subtle p-4">
      <img src={src} alt={relativePath ?? "预览图片"} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
