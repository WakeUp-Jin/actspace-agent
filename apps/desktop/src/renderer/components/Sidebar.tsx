import { useSessionBrowse } from "../session/SessionBrowseContext";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlignLeft,
  Archive,
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  FolderPlus,
  GitFork,
  Hash,
  Pencil,
  Pin,
  PanelLeftClose,
  Plus,
  Blocks,
  Settings,
  Sparkles,
  SquarePen,
} from "lucide-react";
import type { MainAgentForm, SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

export type SidebarMode = "expanded" | "hidden";
export type SidebarView = "chat" | "lab" | "settings" | "extensions";
export type NewSessionInput = {
  workspaceId?: string;
  workspaceRoot?: string;
  agentForm?: MainAgentForm;
};
export type SessionUiStatusKind = "idle" | "running" | "waiting_approval" | "failed";
type SessionStatusMeta = { label: string; detail: string; dotClass: string; rowClass: string };

const DEFAULT_WORKSPACE_KEY = "__default__";
const DEFAULT_WORKSPACE_LABEL = "默认工作区";
const SESSION_VISIBLE_LIMIT = 10;
const SESSION_CONTEXT_MENU_WIDTH = 184;
const SESSION_CONTEXT_MENU_MAX_HEIGHT = 220;
const SESSION_CONTEXT_MENU_MARGIN = 8;
const WORKSPACE_CONTEXT_MENU_WIDTH = 208;
const WORKSPACE_CONTEXT_MENU_MAX_HEIGHT = 152;

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatSessionTitle(title: string): string {
  const normalized = title.replace(/^Session\s+/i, "").replace(/^session-/i, "");
  if (normalized === title) {
    return title;
  }

  return normalized
    .split("-")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function workspaceLabelFromRoot(root: string | undefined | null): string {
  if (!root) return DEFAULT_WORKSPACE_LABEL;
  const normalized = root.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? DEFAULT_WORKSPACE_LABEL;
}

function workspaceKey(root: string | undefined | null): string {
  return root && root.length > 0 ? root : DEFAULT_WORKSPACE_KEY;
}

function clampContextMenuPosition(position: { x: number; y: number }): { x: number; y: number } {
  if (typeof window === "undefined") return position;

  return {
    x: Math.max(
      SESSION_CONTEXT_MENU_MARGIN,
      Math.min(position.x, window.innerWidth - SESSION_CONTEXT_MENU_WIDTH - SESSION_CONTEXT_MENU_MARGIN),
    ),
    y: Math.max(
      SESSION_CONTEXT_MENU_MARGIN,
      Math.min(position.y, window.innerHeight - SESSION_CONTEXT_MENU_MAX_HEIGHT - SESSION_CONTEXT_MENU_MARGIN),
    ),
  };
}

type WorkspaceGroup = {
  key: string;
  label: string;
  workspaceId?: string;
  workspaceRoot?: string;
  sessions: SessionListItem[];
};

function sessionWorkspaceRoot(session: SessionListItem, workspaces: WorkspaceEntry[]): string | undefined {
  return workspaces.find((workspace) => workspace.id === session.workspaceId)?.path ??
    workspaces.find((workspace) => session.workspaceRoot && workspace.path === session.workspaceRoot)?.path ??
    session.workspaceRoot ??
    workspaces.find((workspace) => workspace.kind === "default")?.path;
}

function groupSessionsByWorkspace(sessions: SessionListItem[], workspaces: WorkspaceEntry[] = []): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>();
  for (const workspace of workspaces) {
    groups.set(workspace.id, {
      key: workspace.id,
      label: workspace.label,
      workspaceId: workspace.id,
      workspaceRoot: workspace.path,
      sessions: [],
    });
  }

  const defaultWorkspace = workspaces.find((workspace) => workspace.kind === "default");
  for (const session of sessions) {
    const matchedWorkspace =
      workspaces.find((workspace) => workspace.id === session.workspaceId) ??
      workspaces.find((workspace) => session.workspaceRoot && workspace.path === session.workspaceRoot) ??
      (session.workspaceRoot ? undefined : defaultWorkspace);
    const key = matchedWorkspace?.id ?? session.workspaceId ?? workspaceKey(session.workspaceRoot);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: matchedWorkspace?.label ?? workspaceLabelFromRoot(session.workspaceRoot),
        workspaceId: matchedWorkspace?.id ?? session.workspaceId,
        workspaceRoot: matchedWorkspace?.path ?? session.workspaceRoot,
        sessions: [],
      });
    }
    groups.get(key)!.sessions.push(session);
  }

  // 组内会话按 updatedAt 降序（最近修改/创建在前）；下方组排序依赖 sessions[0] 为最新。
  for (const group of groups.values()) {
    group.sessions.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  const ordered = [...groups.values()];
  ordered.sort((a, b) => {
    if (a.key === DEFAULT_WORKSPACE_KEY) return 1;
    if (b.key === DEFAULT_WORKSPACE_KEY) return -1;
    const aLatest = a.sessions[0]?.updatedAt ?? "";
    const bLatest = b.sessions[0]?.updatedAt ?? "";
    return bLatest.localeCompare(aLatest);
  });

  return ordered;
}

const SESSION_STATUS_META: Record<SessionUiStatusKind, SessionStatusMeta> = {
  idle: {
    label: "空闲",
    detail: "可以开始下一轮对话。",
    dotClass: "bg-text-faint opacity-55",
    rowClass: "",
  },
  running: {
    label: "运行中",
    detail: "Agent 正在执行当前轮次。",
    dotClass: "animate-[session-status-pulse_1500ms_ease-in-out_infinite] bg-operational",
    rowClass: "is-busy",
  },
  waiting_approval: {
    label: "等待审批",
    detail: "工具调用已暂停，等待审批。",
    dotClass: "animate-[session-status-pulse_1500ms_ease-in-out_infinite] bg-warning",
    rowClass: "is-waiting-approval",
  },
  failed: {
    label: "失败",
    detail: "最近一轮执行失败或需要处理。",
    dotClass: "bg-danger",
    rowClass: "is-failed",
  },
};

function resolveSessionStatus(status: unknown): SessionUiStatusKind {
  return typeof status === "string" && status in SESSION_STATUS_META ? status as SessionUiStatusKind : "idle";
}

const SIDEBAR_CLASS =
  "sidebar relative flex h-full min-h-0 min-w-0 flex-col gap-3 bg-sidebar pb-2.5 pl-2.5 pr-2 pt-[var(--window-chrome-strip-height)]";
const SIDEBAR_PRIMARY_ACTIONS_CLASS = "mt-1.5 flex min-w-0 flex-col gap-px p-0";
const SIDEBAR_PRIMARY_ACTION_CLASS =
  "flex min-h-[34px] min-w-0 items-center gap-2.5 rounded-act-md border-0 bg-transparent px-2.5 py-0 text-[13px] font-medium text-text-muted transition-[background,color] duration-[130ms] ease-in-out hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main";
const SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS = "bg-selected font-semibold text-text-main";
const SIDEBAR_PRIMARY_ACTION_LABEL_CLASS = "min-w-0 flex-1 text-left";
const SIDEBAR_PRIMARY_ACTION_SHORTCUT_CLASS = "text-xs font-medium tracking-[0.02em] text-text-faint";
const SIDEBAR_BUTTON_RESET_CLASS = "appearance-none border-0 bg-transparent font-[inherit]";
const SESSION_NAV_CLASS = "sidebar-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 overflow-x-hidden overflow-y-auto pt-2";
const NAV_SECTION_CLASS = "flex min-w-0 flex-col gap-0.5 pb-0";
const NAV_SECTION_WORKSPACES_CLASS = `${NAV_SECTION_CLASS} gap-1`;
const NAV_SECTION_TITLE_CLASS = "group/nav-title flex min-h-6 items-center justify-between gap-2 px-2";
const NAV_SECTION_LABEL_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} inline-flex min-w-0 flex-1 items-center gap-1 p-0 text-left text-xs font-medium tracking-[0] text-text-faint transition-colors duration-[130ms] ease-in-out hover:text-text-main`;
const NAV_SECTION_ACTIONS_CLASS = "inline-flex items-center gap-1 text-text-faint";
const NAV_SECTION_ACTION_BUTTON_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid h-5 w-5 place-items-center rounded-act-sm opacity-0 transition-[opacity,background,color] duration-[130ms] ease-in-out group-hover/nav-title:opacity-100 group-focus-within/nav-title:opacity-100 hover:bg-[var(--act-color-hover-overlay)] hover:text-text-muted`;
const SESSION_LIST_CLASS = "flex min-w-0 flex-col gap-px";
const SESSION_ROW_CLASS =
  "session-row group/session-row relative grid min-h-9 w-full min-w-0 grid-cols-[14px_minmax(0,1fr)_46px_auto] items-center gap-2 rounded-act-md px-2 transition-[background,color] duration-[130ms] ease-in-out hover:bg-[var(--act-color-hover-overlay)]";
const SESSION_ROW_ACTIVE_CLASS = "is-active bg-sidebar-selected";
const SESSION_ROW_PINNED_CLASS = "is-pinned";
const SESSION_ROW_MARKER_CLASS = "relative flex h-[14px] w-[14px] flex-none items-center justify-center";
const SESSION_ROW_TITLE_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium";
const SESSION_ROW_TIME_CLASS = "min-w-[22px] whitespace-nowrap text-right text-[11px] text-text-faint";
const SESSION_ROW_MAIN_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid min-w-0 grid-cols-[minmax(0,1fr)] items-center p-0 text-left text-text-muted transition-colors duration-[130ms] ease-in-out group-hover/session-row:text-text-main group-[.is-active]/session-row:text-text-main`;
const SESSION_ROW_MAIN_MUTED_CLASS = "text-text-muted";
const SESSION_ROW_RENAME_INPUT_CLASS =
  "min-w-0 rounded-act-sm border border-focus-ring bg-surface-raised px-1.5 py-0.5 text-[13px] font-medium text-text-main outline-none ring-2 ring-focus-ring/20";
const SESSION_ROW_ACTIONS_CLASS = "inline-flex w-[46px] flex-none items-center justify-end gap-0.5";
const SESSION_ROW_ARCHIVE_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid h-[22px] w-[22px] flex-none place-items-center rounded-act-sm text-text-faint opacity-0 transition-[opacity,background,color] duration-[130ms] ease-in-out group-hover/session-row:opacity-100 focus-visible:opacity-100 hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main`;
const SESSION_STATUS_CONTAINER_CLASS = "relative grid h-[22px] w-[14px] flex-none place-items-center";
const SESSION_STATUS_BUTTON_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} session-status-button grid h-[22px] w-[22px] place-items-center rounded-act-sm text-text-faint transition-[background,color] duration-[130ms] ease-in-out hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main focus-visible:bg-[var(--act-color-hover-overlay)] focus-visible:text-text-main`;
const SESSION_STATUS_MENU_CLASS =
  "session-status-menu absolute left-0 top-6 z-20 w-44 rounded-act-md border border-line bg-surface-raised px-2 py-1.5 text-left text-[12px] shadow-act-popover";
const SESSION_STATUS_MENU_LABEL_CLASS = "font-medium text-text-main";
const SESSION_STATUS_MENU_DETAIL_CLASS = "mt-0.5 leading-snug text-text-faint";
const SESSION_ROW_PIN_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} session-row-pin grid h-[22px] w-[22px] flex-none place-items-center rounded-act-sm text-text-muted opacity-0 transition-[opacity,background,color] duration-[130ms] ease-in-out group-hover/session-row:opacity-100 focus-visible:opacity-100 hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main`;
const SESSION_ROW_PIN_ACTIVE_CLASS = "is-active text-text-main";
const SESSION_CONTEXT_MENU_CLASS =
  "session-context-menu fixed z-[80] rounded-act-md border border-line bg-surface-raised p-1 text-[13px] text-text-main shadow-act-popover";
const SESSION_CONTEXT_SUBMENU_CLASS =
  "session-context-submenu absolute left-[calc(100%+4px)] top-0 z-[81] w-52 rounded-act-md border border-line bg-surface-raised p-1 text-[13px] text-text-main shadow-act-popover";
const SESSION_CONTEXT_MENU_ITEM_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} flex h-8 w-full items-center gap-2 rounded-act-sm px-2 text-left text-text-main transition-[background,color] duration-[120ms] ease-in-out hover:bg-[var(--act-color-hover-overlay)] disabled:cursor-not-allowed disabled:text-text-faint disabled:hover:bg-transparent`;
const SESSION_CONTEXT_MENU_ICON_CLASS = "h-4 w-4 text-text-muted";
const SESSION_CONTEXT_MENU_SEPARATOR_CLASS = "my-1 h-px bg-line";
const SESSION_STATUS_DOT_CLASS =
  "session-status-dot h-1.5 w-1.5 rounded-full bg-operational transition-opacity duration-[130ms] ease-in-out";
const SESSION_STATUS_DOT_MUTED_CLASS = "is-muted bg-text-faint opacity-55";
const SESSION_STATUS_DOT_ACTIVE_CLASS = "is-active bg-operational";
const SESSION_STATUS_DOT_BUSY_CLASS = "is-busy animate-[session-status-pulse_1500ms_ease-in-out_infinite] bg-operational";
const SESSION_LIST_TOGGLE_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} inline-flex h-[26px] items-center px-[18px] pt-0.5 text-left text-xs font-medium text-text-faint transition-colors duration-[130ms] ease-in-out hover:text-text-main`;
const WORKSPACE_SECTION_CLASS = `${NAV_SECTION_CLASS} gap-0.5`;
const WORKSPACE_TITLE_ROW_CLASS =
  "workspace-folder-row group/workspace-row relative grid min-h-[26px] grid-cols-[14px_minmax(0,1fr)_auto] gap-2 px-2";
const WORKSPACE_ICON_SLOT_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} workspace-icon-slot relative inline-flex h-[14px] w-[14px] flex-none items-center justify-center rounded-act-sm p-0 text-text-faint transition-colors duration-[130ms] ease-in-out hover:text-text-muted`;
const WORKSPACE_FOLDER_GLYPH_CLASS =
  "workspace-folder-glyph opacity-100 transition-opacity duration-[130ms] ease-in-out group-hover/workspace-row:opacity-0";
const WORKSPACE_CHEVRON_GLYPH_CLASS =
  "workspace-chevron-glyph absolute inset-0 m-auto text-text-muted opacity-0 transition-opacity duration-[130ms] ease-in-out group-hover/workspace-row:opacity-100";
const WORKSPACE_LABEL_CLASS =
  `${NAV_SECTION_LABEL_CLASS} workspace-folder-label text-[13px] text-text-muted hover:text-text-main`;
const WORKSPACE_NAME_CLASS = "workspace-folder-name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const WORKSPACE_ACTIONS_CLASS = NAV_SECTION_ACTIONS_CLASS;
const WORKSPACE_ADD_BUTTON_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} workspace-add-button grid h-[22px] w-[22px] place-items-center rounded-act-sm text-text-faint opacity-0 transition-[opacity,background,color] duration-[130ms] ease-in-out group-hover/workspace-row:opacity-100 focus-visible:opacity-100 hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main`;
const WORKSPACE_CONTEXT_MENU_CLASS =
  "workspace-context-menu fixed z-[90] rounded-act-md border border-line bg-surface-raised p-1 text-[13px] text-text-main shadow-act-popover";
const WORKSPACE_CONTEXT_MENU_ITEM_CLASS = SESSION_CONTEXT_MENU_ITEM_CLASS;
const WORKSPACE_CONTEXT_MENU_DANGER_ITEM_CLASS = `${WORKSPACE_CONTEXT_MENU_ITEM_CLASS} text-danger`;
const SETTINGS_ENTRY_CLASS =
  "flex min-h-[34px] min-w-0 items-center gap-[9px] rounded-act-md border-0 bg-transparent px-2.5 py-0 text-left text-[13px] font-medium text-text-muted transition-[background,color] duration-[130ms] ease-in-out hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main";

type NavSectionHeaderProps = {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  extraActions?: ReactNode;
};

/**
 * 分组标题统一渲染：左侧只放纯文字 label（点击折叠），右侧 actions 区在
 * hover 时露出 chevron（视觉指示折叠态）；额外按钮（如 Workspaces 的"排序"）
 * 通过 extraActions slot 注入，统一布在 chevron 之前。
 */
function NavSectionHeader({ label, collapsed, onToggle, extraActions }: NavSectionHeaderProps) {
  return (
    <div className={`nav-section-title ${NAV_SECTION_TITLE_CLASS}`}>
      <button
        className={`nav-section-label ${NAV_SECTION_LABEL_CLASS}`}
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span>{label}</span>
      </button>
      <div className={`nav-section-actions ${NAV_SECTION_ACTIONS_CLASS}`}>
        {extraActions}
        <button
          className={`nav-section-chevron ${NAV_SECTION_ACTION_BUTTON_CLASS}`}
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? `展开 ${label}` : `收起 ${label}`}
        >
          {collapsed
            ? <ChevronRight size={13} strokeWidth={1.9} />
            : <ChevronDown size={13} strokeWidth={1.9} />}
        </button>
      </div>
    </div>
  );
}

type SessionRowProps = {
  session: SessionListItem;
  workspaceRoot?: string;
  isActive: boolean;
  status: unknown;
  onSelect: () => void;
  onTogglePin?: () => void;
  onRename?: (title: string) => void;
  onCopySessionId?: () => void;
  onCopyTranscript?: () => void;
  onFork?: () => void;
  onArchive?: () => void;
};

function SessionStatusButton({ status, dotClass }: { status: unknown; dotClass: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const resolvedStatus = resolveSessionStatus(status);
  const meta = SESSION_STATUS_META[resolvedStatus];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={SESSION_STATUS_CONTAINER_CLASS} ref={rootRef}>
      <button
        className={SESSION_STATUS_BUTTON_CLASS}
        type="button"
        aria-label={`会话状态： ${meta.label}`}
        aria-expanded={open}
        title={meta.label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <span className={dotClass} aria-hidden="true" />
      </button>
      {open ? (
        <div className={SESSION_STATUS_MENU_CLASS} role="status">
          <div className={SESSION_STATUS_MENU_LABEL_CLASS}>{meta.label}</div>
          <div className={SESSION_STATUS_MENU_DETAIL_CLASS}>{meta.detail}</div>
        </div>
      ) : null}
    </div>
  );
}

function SessionRow({
  session,
  workspaceRoot,
  isActive,
  status,
  onSelect,
  onTogglePin,
  onRename,
  onCopySessionId,
  onCopyTranscript,
  onFork,
  onArchive,
}: SessionRowProps) {
  const displayTitle = formatSessionTitle(session.title);
  const resolvedStatus = resolveSessionStatus(status);
  const statusMeta = SESSION_STATUS_META[resolvedStatus];
  const archiveDisabled = isActive || !onArchive;
  const archiveLabel = isActive ? "当前会话无法归档" : "归档会话";
  const forkDisabled = resolvedStatus === "running" || resolvedStatus === "waiting_approval" || !onFork;
  const forkLabel = forkDisabled && onFork
    ? "请等待当前轮次结束后再分叉"
    : "分叉会话";
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(displayTitle);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const dotClass = isActive && resolvedStatus === "idle"
    ? `${SESSION_STATUS_DOT_CLASS} ${SESSION_STATUS_DOT_ACTIVE_CLASS}`
    : `${SESSION_STATUS_DOT_CLASS} ${statusMeta.dotClass}`;
  const rowClass = [
    SESSION_ROW_CLASS,
    isActive ? SESSION_ROW_ACTIVE_CLASS : "",
    statusMeta.rowClass,
    session.pinned ? SESSION_ROW_PINNED_CLASS : "",
    isRenaming ? "is-renaming" : "",
  ].filter(Boolean).join(" ");

  useEffect(() => {
    if (!isRenaming) {
      setDraftTitle(displayTitle);
    }
  }, [displayTitle, isRenaming]);

  useEffect(() => {
    if (!menuPosition) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuPosition(null);
        setCopyMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuPosition(null);
        setCopyMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuPosition]);

  useEffect(() => {
    if (!isRenaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isRenaming]);

  const startRename = () => {
    if (!onRename) return;
    skipNextBlurCommitRef.current = false;
    setDraftTitle(displayTitle);
    setIsRenaming(true);
    setMenuPosition(null);
    setCopyMenuOpen(false);
  };

  const commitRename = () => {
    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      return;
    }

    const nextTitle = draftTitle.trim();
    skipNextBlurCommitRef.current = true;
    setIsRenaming(false);
    if (!nextTitle || nextTitle === displayTitle) return;
    onRename?.(nextTitle);
  };

  const cancelRename = () => {
    skipNextBlurCommitRef.current = true;
    setDraftTitle(displayTitle);
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setCopyMenuOpen(false);
    setTooltipOpen(false);
    setMenuPosition(clampContextMenuPosition({ x: event.clientX, y: event.clientY }));
  };

  const closeContextMenu = () => {
    setCopyMenuOpen(false);
    setMenuPosition(null);
  };

  return (
    <Tooltip
      delayDuration={350}
      open={tooltipOpen && !menuPosition && !isRenaming}
      onOpenChange={setTooltipOpen}
    >
      <TooltipTrigger asChild>
        <div
          className={rowClass}
          data-session-id={session.id}
          onContextMenu={handleContextMenu}
          role="presentation"
        >
          <span className={`session-row-marker ${SESSION_ROW_MARKER_CLASS}`}>
            <SessionStatusButton status={resolvedStatus} dotClass={dotClass} />
          </span>
          {isRenaming ? (
            <div
              className={`${SESSION_ROW_MAIN_CLASS} ${!isActive && resolvedStatus === "idle" ? SESSION_ROW_MAIN_MUTED_CLASS : ""}`}
            >
              <input
                ref={inputRef}
                className={`session-row-rename-input ${SESSION_ROW_RENAME_INPUT_CLASS}`}
                value={draftTitle}
                aria-label={`重命名会话 ${displayTitle}`}
                onChange={(event) => setDraftTitle(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={handleRenameKeyDown}
              />
            </div>
          ) : (
            <button
              className={`${SESSION_ROW_MAIN_CLASS} ${!isActive && resolvedStatus === "idle" ? SESSION_ROW_MAIN_MUTED_CLASS : ""}`}
              type="button"
              onClick={onSelect}
              aria-current={isActive ? "page" : undefined}
            >
              <span className={`session-row-title ${SESSION_ROW_TITLE_CLASS}`}>{displayTitle}</span>
            </button>
          )}
          <div className={`session-row-actions ${SESSION_ROW_ACTIONS_CLASS}`}>
            {onTogglePin ? (
              <button
                className={`${SESSION_ROW_PIN_CLASS} ${session.pinned ? SESSION_ROW_PIN_ACTIVE_CLASS : ""}`}
                type="button"
                aria-label={session.pinned ? "取消置顶会话" : "置顶会话"}
                title={session.pinned ? "取消置顶会话" : "置顶会话"}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePin();
                }}
              >
                {session.pinned ? (
                  <Pin size={11} strokeWidth={1.9} fill="currentColor" />
                ) : (
                  <Pin size={11} strokeWidth={1.9} />
                )}
              </button>
            ) : null}
            <button
              className={`session-row-archive ${SESSION_ROW_ARCHIVE_CLASS} ${archiveDisabled ? "cursor-not-allowed group-hover/session-row:opacity-40 focus-visible:opacity-40 hover:bg-transparent hover:text-text-faint" : ""}`}
              type="button"
              disabled={archiveDisabled}
              aria-label={archiveLabel}
              title={archiveLabel}
              onClick={(event) => {
                event.stopPropagation();
                if (!archiveDisabled) onArchive?.();
              }}
            >
              <Archive size={12} strokeWidth={1.9} />
            </button>
          </div>
          <span className={`session-row-time ${SESSION_ROW_TIME_CLASS}`}>
            {formatRelativeTime(session.updatedAt)}
          </span>
          {menuPosition ? (
            <div
              ref={menuRef}
              className={SESSION_CONTEXT_MENU_CLASS}
              role="menu"
              aria-label={`会话操作： ${displayTitle}`}
              style={{
                left: menuPosition.x,
                top: menuPosition.y,
                width: SESSION_CONTEXT_MENU_WIDTH,
              }}
            >
              <button
                className={SESSION_CONTEXT_MENU_ITEM_CLASS}
                type="button"
                role="menuitem"
                disabled={!onTogglePin}
                onClick={() => {
                  setMenuPosition(null);
                  onTogglePin?.();
                }}
              >
                <Pin
                  size={16}
                  strokeWidth={1.9}
                  fill={session.pinned ? "currentColor" : "none"}
                  className={SESSION_CONTEXT_MENU_ICON_CLASS}
                  aria-hidden="true"
                />
                {session.pinned ? "取消置顶" : "置顶"}
              </button>
              <button
                className={SESSION_CONTEXT_MENU_ITEM_CLASS}
                type="button"
                role="menuitem"
                disabled={!onRename}
                onClick={startRename}
              >
                <Pencil
                  size={16}
                  strokeWidth={1.9}
                  className={SESSION_CONTEXT_MENU_ICON_CLASS}
                  aria-hidden="true"
                />
                重命名
              </button>
              <div className="relative" onMouseEnter={() => setCopyMenuOpen(true)}>
                <button
                  className={SESSION_CONTEXT_MENU_ITEM_CLASS}
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={copyMenuOpen}
                  disabled={!onCopySessionId && !onCopyTranscript}
                  onFocus={() => setCopyMenuOpen(true)}
                  onClick={() => setCopyMenuOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      setCopyMenuOpen(true);
                    }
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      setCopyMenuOpen(false);
                    }
                  }}
                >
                  <Copy size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
                  <span className="flex-1">复制</span>
                  <ChevronRight size={14} strokeWidth={1.9} className="text-text-faint" aria-hidden="true" />
                </button>
                {copyMenuOpen ? (
                  <div
                    className={SESSION_CONTEXT_SUBMENU_CLASS}
                    role="menu"
                    aria-label={`复制会话 ${displayTitle}`}
                  >
                    <button
                      className={SESSION_CONTEXT_MENU_ITEM_CLASS}
                      type="button"
                      role="menuitem"
                      disabled={!onCopySessionId}
                      onClick={() => {
                        closeContextMenu();
                        onCopySessionId?.();
                      }}
                    >
                      <Hash
                        size={16}
                        strokeWidth={1.9}
                        className={SESSION_CONTEXT_MENU_ICON_CLASS}
                        aria-hidden="true"
                      />
                      复制 ID
                    </button>
                    <button
                      className={SESSION_CONTEXT_MENU_ITEM_CLASS}
                      type="button"
                      role="menuitem"
                      disabled={!onCopyTranscript}
                      onClick={() => {
                        closeContextMenu();
                        onCopyTranscript?.();
                      }}
                    >
                      <AlignLeft
                        size={16}
                        strokeWidth={1.9}
                        className={SESSION_CONTEXT_MENU_ICON_CLASS}
                        aria-hidden="true"
                      />
                      复制会话记录
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                className={SESSION_CONTEXT_MENU_ITEM_CLASS}
                type="button"
                role="menuitem"
                disabled={forkDisabled}
                title={forkLabel}
                onClick={() => {
                  closeContextMenu();
                  if (!forkDisabled) onFork?.();
                }}
              >
                <GitFork
                  size={16}
                  strokeWidth={1.9}
                  className={SESSION_CONTEXT_MENU_ICON_CLASS}
                  aria-hidden="true"
                />
                分叉
              </button>
              <div className={SESSION_CONTEXT_MENU_SEPARATOR_CLASS} role="separator" />
              <button
                className={SESSION_CONTEXT_MENU_ITEM_CLASS}
                type="button"
                role="menuitem"
                disabled={archiveDisabled}
                title={archiveLabel}
                onClick={() => {
                  closeContextMenu();
                  if (!archiveDisabled) onArchive?.();
                }}
              >
                <Archive
                  size={16}
                  strokeWidth={1.9}
                  className={SESSION_CONTEXT_MENU_ICON_CLASS}
                  aria-hidden="true"
                />
                归档
              </button>
            </div>
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="start"
        sideOffset={8}
        className="max-w-[360px] select-none px-2.5 py-2 font-normal"
      >
        <span className="block text-[12px] font-medium text-text-main">{displayTitle}</span>
        <span className="mt-0.5 block text-[11px] font-normal text-text-muted [overflow-wrap:anywhere]">
          {workspaceRoot ?? "工作区路径不可用"}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function resolvedSessionStatus(
  sessionId: string,
  busySessionIds: Set<string>,
  sessionStatuses?: Record<string, unknown>,
): SessionUiStatusKind {
  return resolveSessionStatus(sessionStatuses?.[sessionId] ?? (busySessionIds.has(sessionId) ? "running" : "idle"));
}

type CollapsibleSessionListProps = {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  busySessionIds: Set<string>;
  sessionStatuses?: Record<string, unknown>;
  onSelectSession?: (sessionId: string) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  onRename?: (sessionId: string, title: string) => void;
  onCopySessionId?: (sessionId: string) => void;
  onCopyTranscript?: (sessionId: string) => void;
  onFork?: (sessionId: string) => void;
  onArchive?: (sessionId: string) => void;
  groupKey: string;
  workspaces?: WorkspaceEntry[];
};

function CollapsibleSessionList({
  sessions,
  activeSessionId,
  busySessionIds,
  sessionStatuses,
  onSelectSession,
  onTogglePin,
  onRename,
  onCopySessionId,
  onCopyTranscript,
  onFork,
  onArchive,
  groupKey,
  workspaces = [],
}: CollapsibleSessionListProps) {
  const browse = useSessionBrowse();
  const [limit, setLimit] = useState(SESSION_VISIBLE_LIMIT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remoteGroups = browse?.groups.filter(g => groupKey === 'pinned' ? g.pinned : !g.pinned && g.workspaceRoot === (sessions[0]?.workspaceRoot ?? '')) ?? [];
  const remoteMore = remoteGroups.some(g => g.hasMore);
  const hasOverflow = browse ? remoteMore : sessions.length > limit;
  const visibleSessions = browse ? sessions : sessions.slice(0, limit);
  const loadMore = async () => {
    if (!browse) { setLimit(n => n + 10); return; }
    if (loading) return;
    setLoading(true); setError(null);
    try {
      for (const group of remoteGroups.filter(g => g.hasMore)) {
        const last = [...sessions].filter(s => (s.workspaceRoot ?? '') === group.workspaceRoot).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).at(-1);
        await browse.loadMore({ workspaceRoot: group.workspaceRoot, pinned: group.pinned, after: last?.id });
      }
    } catch (e) { setError(e instanceof Error ? e.message : '会话加载失败'); }
    finally { setLoading(false); }
  };

  return (
    <div className={SESSION_LIST_CLASS} data-group-key={groupKey}>
      {visibleSessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          workspaceRoot={sessionWorkspaceRoot(session, workspaces)}
          isActive={session.id === activeSessionId}
          status={resolvedSessionStatus(session.id, busySessionIds, sessionStatuses)}
          onSelect={() => onSelectSession?.(session.id)}
          onTogglePin={onTogglePin ? () => onTogglePin(session.id, !session.pinned) : undefined}
          onRename={onRename ? (title) => onRename(session.id, title) : undefined}
          onCopySessionId={onCopySessionId ? () => onCopySessionId(session.id) : undefined}
          onCopyTranscript={onCopyTranscript ? () => onCopyTranscript(session.id) : undefined}
          onFork={onFork ? () => onFork(session.id) : undefined}
          onArchive={onArchive ? () => onArchive(session.id) : undefined}
        />
      ))}
      {error && <p role="alert" className="px-2 text-xs text-text-muted">{error} <button onClick={() => { void loadMore(); }}>重试</button></p>}
      {hasOverflow ? (
        <button
          className={`session-list-toggle ${SESSION_LIST_TOGGLE_CLASS}`}
          type="button"
          disabled={loading}
          onClick={() => { void loadMore(); }}
        >
          {loading ? "正在加载…" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

export function Sidebar({
  sessions,
  workspaces = [],
  activeSessionId,
  mode,
  view,
  busySessionIds,
  sessionStatuses,
  onNewSession,
  onAddWorkspace,
  onSelectSession,
  onTogglePin,
  onSelectView,
  onRename,
  onCopySessionId,
  onCopyTranscript,
  onFork,
  onArchive,
  onOpenWorkspace,
  onArchiveWorkspace,
  onRemoveWorkspace,
}: {
  sessions: SessionListItem[];
  workspaces?: WorkspaceEntry[];
  activeSessionId: string | null;
  mode: SidebarMode;
  view: SidebarView;
  busySessionIds?: Set<string>;
  sessionStatuses?: Record<string, unknown>;
  /** 折叠按钮回调；现由 WorkbenchLayout 通过 WindowChromeBar 调用，Sidebar 内部不直接渲染 chrome row。 */
  onToggleMode?: () => void;
  onNewSession?: (input?: NewSessionInput) => void;
  onAddWorkspace?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  onSelectView?: (next: SidebarView) => void;
  onRename?: (sessionId: string, title: string) => void;
  onCopySessionId?: (sessionId: string) => void;
  onCopyTranscript?: (sessionId: string) => void;
  onFork?: (sessionId: string) => void;
  /** Archive 占位回调；未传时按钮仅做视觉占位。 */
  onArchive?: (sessionId: string) => void;
  onOpenWorkspace?: (workspaceId: string) => void;
  onArchiveWorkspace?: (workspaceId: string, workspaceRoot?: string) => void;
  onRemoveWorkspace?: (workspaceId: string, workspaceRoot?: string) => void;
}) {
  const [newSessionMenuOpen, setNewSessionMenuOpen] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [workspacesCollapsed, setWorkspacesCollapsed] = useState(false);
  const busyIds = busySessionIds ?? new Set<string>();
  const statuses = sessionStatuses ?? {};

  const pinnedSessions = useMemo(
    () => sessions.filter((session) => session.pinned),
    [sessions],
  );
  const unpinnedSessions = useMemo(
    () => sessions.filter((session) => !session.pinned),
    [sessions],
  );
  const browse = useSessionBrowse();
  const workspaceGroups = useMemo(
    () => groupSessionsByWorkspace(unpinnedSessions, workspaces),
    [unpinnedSessions, workspaces],
  );
  const workspaceGroupSessions = useMemo(() => {
    const groups = new Map<string, SessionListItem[]>();
    for (const session of sessions) {
      const matchedWorkspace =
        workspaces.find((workspace) => workspace.id === session.workspaceId) ??
        workspaces.find((workspace) => session.workspaceRoot && workspace.path === session.workspaceRoot) ??
        (!session.workspaceRoot ? workspaces.find((workspace) => workspace.kind === "default") : undefined);
      const key = matchedWorkspace?.id ?? session.workspaceId ?? workspaceKey(session.workspaceRoot);
      const current = groups.get(key) ?? [];
      current.push(session);
      groups.set(key, current);
    }
    return groups;
  }, [sessions, workspaces]);

  if (mode === "hidden") {
    return null;
  }

  const handleNewAgent = (input?: NewSessionInput) => {
    onSelectView?.("chat");
    onNewSession?.(input);
  };

  const handleSelectChatSession = (sessionId: string) => {
    onSelectView?.("chat");
    onSelectSession?.(sessionId);
  };

  return (
    <aside className={SIDEBAR_CLASS}>
      <div className={SIDEBAR_PRIMARY_ACTIONS_CLASS}>
        <div className="relative flex items-center">
          <button
            className={`${SIDEBAR_PRIMARY_ACTION_CLASS} min-w-0 flex-1 ${view === "chat" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
            type="button"
            onClick={() => handleNewAgent({ agentForm: "agent" })}
          >
            <SquarePen size={14} strokeWidth={1.9} />
            <span className={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}>新建会话</span>
            <span className={SIDEBAR_PRIMARY_ACTION_SHORTCUT_CLASS} aria-hidden="true">⌘N</span>
          </button>
          <button
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-act-md text-text-faint hover:bg-hover-overlay hover:text-text-main"
            type="button"
            aria-label="选择新会话形态"
            aria-haspopup="menu"
            aria-expanded={newSessionMenuOpen}
            onClick={() => setNewSessionMenuOpen((open) => !open)}
          >
            <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
          </button>
          {newSessionMenuOpen ? (
            <div className="absolute left-2 right-2 top-[calc(100%_+_4px)] z-40 rounded-act-md border border-line bg-surface-raised p-1 shadow-act-popover" role="menu" aria-label="选择会话形态">
              {(["agent", "chat"] as const).map((agentForm) => (
                <button
                  className="flex min-h-8 w-full items-center rounded-act-sm px-2 text-left text-sm text-text-main hover:bg-hover-overlay"
                  key={agentForm}
                  type="button"
                  role="menuitem"
                  onClick={() => { setNewSessionMenuOpen(false); handleNewAgent({ agentForm }); }}
                >
                  {agentForm === "agent" ? "Agent" : "Chat"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          className={`${SIDEBAR_PRIMARY_ACTION_CLASS} ${view === "extensions" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
          type="button"
          aria-current={view === "extensions" ? "page" : undefined}
          onClick={() => onSelectView?.("extensions")}
        >
          <Blocks size={14} strokeWidth={1.9} />
          <span className={SIDEBAR_PRIMARY_ACTION_LABEL_CLASS}>扩展</span>
        </button>
      </div>

      <nav className={SESSION_NAV_CLASS} aria-label="会话">
        {browse?.listLoading && <p role="status" className="px-2 text-xs text-text-muted">正在加载会话…</p>}
        {browse?.listError && <p role="alert" className="px-2 text-xs text-text-muted">{browse.listError} <button onClick={browse.retryList}>重试</button></p>}
        {pinnedSessions.length > 0 ? (
          <section className={`nav-section ${NAV_SECTION_CLASS}`}>
            <NavSectionHeader
              label="已置顶"
              collapsed={pinnedCollapsed}
              onToggle={() => setPinnedCollapsed((value) => !value)}
            />
            {pinnedCollapsed ? null : (
              <CollapsibleSessionList
                sessions={pinnedSessions}
                activeSessionId={activeSessionId}
                busySessionIds={busyIds}
                sessionStatuses={statuses}
                onSelectSession={handleSelectChatSession}
                onTogglePin={onTogglePin}
                onRename={onRename}
                onCopySessionId={onCopySessionId}
                onCopyTranscript={onCopyTranscript}
                onFork={onFork}
                onArchive={onArchive}
                groupKey="pinned"
                workspaces={workspaces}
              />
            )}
          </section>
        ) : null}

        <section className={`nav-section nav-section-workspaces ${NAV_SECTION_WORKSPACES_CLASS}`}>
          <NavSectionHeader
            label="工作区"
            collapsed={workspacesCollapsed}
            onToggle={() => setWorkspacesCollapsed((value) => !value)}
            extraActions={
              <>
                <button
                  className={NAV_SECTION_ACTION_BUTTON_CLASS}
                  type="button"
                  aria-label="排序工作区"
                  title="排序（即将推出）"
                >
                  <ArrowDownUp size={13} strokeWidth={1.9} />
                </button>
                <button
                  className={NAV_SECTION_ACTION_BUTTON_CLASS}
                  type="button"
                  aria-label="添加工作区"
                  title="添加工作区"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddWorkspace?.();
                  }}
                >
                  <FolderPlus size={13} strokeWidth={1.9} />
                </button>
              </>
            }
          />

          {workspacesCollapsed
            ? null
            : workspaceGroups.map((group) => (
                <WorkspaceSection
                  key={group.key}
                  group={group}
                  allSessions={workspaceGroupSessions.get(group.key) ?? []}
                  workspaces={workspaces}
                  activeSessionId={activeSessionId}
                  busySessionIds={busyIds}
                  sessionStatuses={statuses}
                  onSelectSession={handleSelectChatSession}
                  onNewSession={handleNewAgent}
                  onTogglePin={onTogglePin}
                  onRename={onRename}
                  onCopySessionId={onCopySessionId}
                  onCopyTranscript={onCopyTranscript}
                  onFork={onFork}
                  onArchive={onArchive}
                  onOpenWorkspace={onOpenWorkspace}
                  onArchiveWorkspace={onArchiveWorkspace}
                  onRemoveWorkspace={onRemoveWorkspace}
                />
              ))}
        </section>
      </nav>

      <button
        className={`${SETTINGS_ENTRY_CLASS} ${view === "settings" ? SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS : ""}`}
        type="button"
        onClick={() => onSelectView?.("settings")}
      >
        <Settings size={14} strokeWidth={1.9} />
        设置
      </button>
    </aside>
  );
}

type WorkspaceSectionProps = {
  group: WorkspaceGroup;
  allSessions: SessionListItem[];
  workspaces: WorkspaceEntry[];
  activeSessionId: string | null;
  busySessionIds: Set<string>;
  sessionStatuses?: Record<string, unknown>;
  onSelectSession?: (sessionId: string) => void;
  onNewSession?: (input?: NewSessionInput) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  onRename?: (sessionId: string, title: string) => void;
  onCopySessionId?: (sessionId: string) => void;
  onCopyTranscript?: (sessionId: string) => void;
  onFork?: (sessionId: string) => void;
  onArchive?: (sessionId: string) => void;
  onOpenWorkspace?: (workspaceId: string) => void;
  onArchiveWorkspace?: (workspaceId: string, workspaceRoot?: string) => void;
  onRemoveWorkspace?: (workspaceId: string, workspaceRoot?: string) => void;
};

function WorkspaceSection({
  group,
  allSessions,
  workspaces,
  activeSessionId,
  busySessionIds,
  sessionStatuses,
  onSelectSession,
  onNewSession,
  onTogglePin,
  onRename,
  onCopySessionId,
  onCopyTranscript,
  onFork,
  onArchive,
  onOpenWorkspace,
  onArchiveWorkspace,
  onRemoveWorkspace,
}: WorkspaceSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const labelRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const archiveDisabled = allSessions.length === 0 || allSessions.some((session) => {
    const status = resolvedSessionStatus(session.id, busySessionIds, sessionStatuses);
    return status === "running" || status === "waiting_approval";
  });
  const archiveTitle = archiveDisabled
    ? allSessions.length === 0 ? "没有可归档的会话" : "请等待运行中或待处理的会话结束"
    : "归档全部会话";
  const removeDisabled = group.workspaceId === workspaces.find((workspace) => workspace.kind === "default")?.id;

  useEffect(() => {
    if (!menuPosition) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !labelRef.current?.contains(event.target as Node)) {
        setMenuPosition(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuPosition(null);
        labelRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuPosition]);

  const openMenu = (position?: { x: number; y: number }) => {
    const rect = labelRef.current?.getBoundingClientRect();
    const next = position ?? { x: rect?.left ?? 8, y: (rect?.bottom ?? 8) + 4 };
    setMenuPosition({
      x: Math.max(8, Math.min(next.x, window.innerWidth - WORKSPACE_CONTEXT_MENU_WIDTH - 8)),
      y: Math.max(8, Math.min(next.y, window.innerHeight - WORKSPACE_CONTEXT_MENU_MAX_HEIGHT - 8)),
    });
  };

  const closeMenu = (restoreFocus = false) => {
    setMenuPosition(null);
    if (restoreFocus) labelRef.current?.focus();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex < 0 ? (delta > 0 ? 0 : items.length - 1) : (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  useEffect(() => {
    if (menuPosition) {
      menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
    }
  }, [menuPosition]);

  return (
    <section
      className={`nav-section nav-section-workspace ${WORKSPACE_SECTION_CLASS}${collapsed ? " is-collapsed" : " is-expanded"}${menuPosition ? " is-menu-open" : ""}`}
    >
      <div
        className={`nav-section-title ${NAV_SECTION_TITLE_CLASS} ${WORKSPACE_TITLE_ROW_CLASS}${menuPosition ? " rounded-act-md bg-[var(--act-color-hover-overlay)]" : ""}`}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <button
          className={WORKSPACE_ICON_SLOT_CLASS}
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? `展开 ${group.label}` : `收起 ${group.label}`}
          aria-expanded={!collapsed}
        >
          <Folder size={13} strokeWidth={1.9} className={WORKSPACE_FOLDER_GLYPH_CLASS} aria-hidden="true" />
          {collapsed
            ? <ChevronRight size={13} strokeWidth={1.9} className={WORKSPACE_CHEVRON_GLYPH_CLASS} aria-hidden="true" />
            : <ChevronDown size={13} strokeWidth={1.9} className={WORKSPACE_CHEVRON_GLYPH_CLASS} aria-hidden="true" />}
        </button>
        <button
          ref={labelRef}
          className={`nav-section-label ${WORKSPACE_LABEL_CLASS}`}
          type="button"
          aria-haspopup="menu"
          aria-expanded={Boolean(menuPosition)}
          onKeyDown={(event) => {
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
              event.preventDefault();
              openMenu();
            }
          }}
        >
          <span className={WORKSPACE_NAME_CLASS}>{group.label}</span>
        </button>
        <div className={`nav-section-actions workspace-folder-actions ${WORKSPACE_ACTIONS_CLASS}`} aria-label="工作区操作">
          <button
            className={WORKSPACE_ADD_BUTTON_CLASS}
            type="button"
            aria-label="在工作区中新建会话"
            title="在此工作区中新建会话"
            onClick={(event) => {
              event.stopPropagation();
              onNewSession?.({ workspaceId: group.workspaceId, workspaceRoot: group.workspaceRoot, agentForm: "agent" });
            }}
          >
            <Plus size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
      {collapsed ? null : (
        <CollapsibleSessionList
          sessions={group.sessions}
          activeSessionId={activeSessionId}
          busySessionIds={busySessionIds}
          sessionStatuses={sessionStatuses}
          onSelectSession={onSelectSession}
          onTogglePin={onTogglePin}
          onRename={onRename}
          onCopySessionId={onCopySessionId}
          onCopyTranscript={onCopyTranscript}
          onFork={onFork}
          onArchive={onArchive}
          groupKey={group.key}
          workspaces={workspaces}
        />
      )}
      {menuPosition && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          className={WORKSPACE_CONTEXT_MENU_CLASS}
          role="menu"
          aria-label={`工作区操作： ${group.label}`}
          onKeyDown={handleMenuKeyDown}
          style={{ left: menuPosition.x, top: menuPosition.y, width: WORKSPACE_CONTEXT_MENU_WIDTH }}
        >
          <button
            className={WORKSPACE_CONTEXT_MENU_ITEM_CLASS}
            type="button"
            role="menuitem"
            disabled={!group.workspaceId || !onOpenWorkspace}
            onClick={() => {
              closeMenu(true);
              if (group.workspaceId) onOpenWorkspace?.(group.workspaceId);
            }}
          >
            <FolderOpen size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
            在 IDE 中打开
          </button>
          <button
            className={WORKSPACE_CONTEXT_MENU_ITEM_CLASS}
            type="button"
            role="menuitem"
            disabled={archiveDisabled || !group.workspaceId || !onArchiveWorkspace}
            title={archiveTitle}
            onClick={() => {
              closeMenu(true);
              if (!archiveDisabled && group.workspaceId) onArchiveWorkspace?.(group.workspaceId, group.workspaceRoot);
            }}
          >
            <Archive size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
            归档全部
          </button>
          <div className={SESSION_CONTEXT_MENU_SEPARATOR_CLASS} role="separator" />
          <button
            className={WORKSPACE_CONTEXT_MENU_DANGER_ITEM_CLASS}
            type="button"
            role="menuitem"
            disabled={removeDisabled || !group.workspaceId || !onRemoveWorkspace}
            title={removeDisabled ? "默认工作区无法移除" : "从侧栏移除"}
            onClick={() => {
              closeMenu(true);
              if (!removeDisabled && group.workspaceId) onRemoveWorkspace?.(group.workspaceId, group.workspaceRoot);
            }}
          >
            <PanelLeftClose size={16} strokeWidth={1.9} className="h-4 w-4" aria-hidden="true" />
            从侧栏移除
          </button>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
