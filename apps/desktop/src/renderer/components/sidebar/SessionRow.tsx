import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Archive, ArchiveRestore, MoreHorizontal, Pin, PinOff } from "lucide-react";
import type { SessionListItem } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { IconButton } from "../ui/IconButton";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/Popover";
import { ContextMenu, ContextMenuTrigger } from "../ui/ContextMenu";
import { openContextMenuAt, openContextMenuFromKeyboard, SessionContextMenuContent } from "./SessionContextMenu";
import { isSessionBusy, SESSION_STATUS_META, type SessionUiStatusKind } from "./session-status";
import { formatRelativeTimeZh } from "./sidebar-view";
import { DropIndicator } from "./DropIndicator";
import type { RowDrag } from "./use-sidebar-drag";
import { SIDEBAR_BUTTON_RESET_CLASS } from "./styles";

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

// 行高 30px，三列：状态槽 16px、标题、尾部（时间 / 待审批 / 已归档，悬停时换成操作按钮）。
const SESSION_ROW_CLASS =
  "session-row group/session-row relative grid min-h-[30px] w-full min-w-0 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-act-md px-2 transition-[background,color,opacity] duration-(--motion-fast) ease-in-out hover:bg-[var(--act-color-hover-overlay)]";
const SESSION_ROW_ACTIVE_CLASS = "is-active bg-sidebar-selected";
const SESSION_ROW_PINNED_CLASS = "is-pinned";
const SESSION_ROW_DRAGGING_CLASS = "opacity-40";
const SESSION_ROW_MARKER_CLASS = "relative flex h-4 w-4 flex-none items-center justify-center";
const SESSION_ROW_TITLE_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-act-sm font-medium";
const SESSION_ROW_UNREAD_TITLE_CLASS = "font-semibold text-text-main";
const SESSION_ROW_WORKSPACE_CLASS = "session-row-workspace max-w-[34%] flex-none overflow-hidden text-ellipsis whitespace-nowrap text-act-xxs text-text-faint";
const SESSION_ROW_END_CLASS = "flex flex-none items-center justify-end";
// 悬停、键盘聚焦或菜单打开时尾部文字让位给操作按钮。
const SESSION_ROW_END_HIDE_CLASS = "group-hover/session-row:hidden group-has-[:focus-visible]/session-row:hidden group-[.is-menu-open]/session-row:hidden";
const SESSION_ROW_TIME_CLASS = `min-w-[22px] whitespace-nowrap text-right text-act-xxs text-text-faint ${SESSION_ROW_END_HIDE_CLASS}`;
const SESSION_ROW_WAITING_CLASS = "text-warning";
const SESSION_ROW_ARCHIVED_TAG_CLASS = `rounded-act-xs bg-surface-subtle px-1 text-act-xxs text-text-faint ${SESSION_ROW_END_HIDE_CLASS}`;
const SESSION_ROW_MAIN_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} flex min-w-0 items-baseline gap-1.5 p-0 text-left text-text-muted transition-colors duration-(--motion-fast) ease-in-out group-hover/session-row:text-text-main group-[.is-active]/session-row:text-text-main`;
const SESSION_ROW_MAIN_ARCHIVED_CLASS = "text-text-faint";
const SESSION_ROW_RENAME_INPUT_CLASS =
  "min-w-0 flex-1 rounded-act-sm border border-focus-ring bg-surface-raised px-1.5 py-0.5 text-act-sm font-medium text-text-main outline-none ring-2 ring-focus-ring/20";
// 操作按钮平时不占位，悬停、键盘聚焦或菜单打开时替换掉时间。
const SESSION_ROW_ACTIONS_CLASS =
  "session-row-actions hidden flex-none items-center gap-px group-hover/session-row:inline-flex group-has-[:focus-visible]/session-row:inline-flex group-[.is-menu-open]/session-row:inline-flex";
const SESSION_STATUS_CONTAINER_CLASS = "relative grid h-[22px] w-4 flex-none place-items-center";
const SESSION_STATUS_POPOVER_CLASS = "session-status-menu w-44 px-2 py-1.5 text-left text-act-xs";
const SESSION_STATUS_MENU_LABEL_CLASS = "font-medium text-text-main";
const SESSION_STATUS_MENU_DETAIL_CLASS = "mt-0.5 leading-snug text-text-faint";
const SESSION_STATUS_DOT_CLASS = "session-status-dot block transition-opacity duration-(--motion-fast) ease-in-out";

// 点击状态点弹出的说明（16 T16b 改用 ui/Popover）。IconButton 自带 Tooltip，不能套 PopoverTrigger，所以用 PopoverAnchor 定位；
// 点按钮本身不算点外面，否则按下时关闭、松开时又被 onClick 打开。打开期间行的悬停提示由 SessionRow 收起（和右键菜单一样），
// 否则提示会盖在说明上面，Esc 先关掉的是提示。
function SessionStatusButton({ status, dotClass, open, onOpenChange: setOpen }: { status: SessionUiStatusKind; dotClass: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const meta = SESSION_STATUS_META[status];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={SESSION_STATUS_CONTAINER_CLASS} ref={rootRef}>
          <IconButton
            className="session-status-button"
            size="xs"
            label={`会话状态： ${meta.label}`}
            tooltip={meta.label}
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(!open);
            }}
          >
            <span className={dotClass} data-state={status} aria-hidden="true" />
          </IconButton>
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={2}
        aria-label={`会话状态：${meta.label}`}
        className={SESSION_STATUS_POPOVER_CLASS}
        onInteractOutside={(event) => {
          if (rootRef.current?.contains(event.target as Node)) event.preventDefault();
        }}
      >
        <div className={SESSION_STATUS_MENU_LABEL_CLASS}>{meta.label}</div>
        <div className={SESSION_STATUS_MENU_DETAIL_CLASS}>{meta.detail}</div>
      </PopoverContent>
    </Popover>
  );
}


type SessionRowProps = {
  session: SessionListItem;
  workspaceRoot?: string;
  /** 单列表和按时间分组时，标题后面跟一个灰色的工作区名。 */
  workspaceLabel?: string;
  isActive: boolean;
  status: SessionUiStatusKind;
  /** 手动排序拖拽；按时间分组、已归档的行没有。 */
  drag?: RowDrag;
  onSelect: () => void;
  onTogglePin?: () => void;
  onRename?: (title: string) => void;
  onCopySessionId?: () => void;
  onCopyTranscript?: () => void;
  onFork?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
};

export function SessionRow({
  session,
  workspaceRoot,
  workspaceLabel,
  isActive,
  status: liveStatus,
  drag,
  onSelect,
  onTogglePin,
  onRename,
  onCopySessionId,
  onCopyTranscript,
  onFork,
  onArchive,
  onRestore,
}: SessionRowProps) {
  const archived = Boolean(session.archived);
  // 已归档的会话不显示运行状态；当前打开的会话已经在看了，不算未读。
  const status: SessionUiStatusKind = archived || (isActive && liveStatus === "unread") ? "idle" : liveStatus;
  const displayTitle = formatSessionTitle(session.title);
  const statusMeta = SESSION_STATUS_META[status];
  const archiveDisabled = isActive || !onArchive;
  const archiveLabel = isActive ? "当前会话无法归档" : "归档会话";
  const forkDisabled = isSessionBusy(status) || !onFork;
  const forkLabel = forkDisabled && onFork
    ? "请等待当前轮次结束后再分叉"
    : "分叉会话";
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(displayTitle);
  const rowRef = useRef<HTMLDivElement | null>(null);
  // 从菜单选了重命名：菜单关闭时不还焦点，焦点留在重命名输入框里。
  const renameFromMenuRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleButtonRef = useRef<HTMLButtonElement | null>(null);
  // 用 Enter / Esc 结束重命名时，输入框卸载后把焦点还给标题按钮；点别处失焦提交的不抢焦点。
  const focusTitleAfterRenameRef = useRef(false);
  const skipNextBlurCommitRef = useRef(false);
  const rowDrag = isRenaming ? undefined : drag;
  const rowClass = [
    SESSION_ROW_CLASS,
    isActive ? SESSION_ROW_ACTIVE_CLASS : "",
    statusMeta.rowClass,
    session.pinned ? SESSION_ROW_PINNED_CLASS : "",
    archived ? "is-archived" : "",
    menuOpen ? "is-menu-open bg-[var(--act-color-hover-overlay)]" : "",
    rowDrag?.isDragging ? SESSION_ROW_DRAGGING_CLASS : "",
    isRenaming ? "is-renaming" : "",
  ].filter(Boolean).join(" ");
  const mainClass = `${SESSION_ROW_MAIN_CLASS} ${archived ? SESSION_ROW_MAIN_ARCHIVED_CLASS : ""}`;

  useEffect(() => {
    if (!isRenaming) {
      setDraftTitle(displayTitle);
    }
  }, [displayTitle, isRenaming]);

  useEffect(() => {
    if (!isRenaming) {
      if (focusTitleAfterRenameRef.current) titleButtonRef.current?.focus();
      focusTitleAfterRenameRef.current = false;
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isRenaming]);

  const startRename = () => {
    if (!onRename) return;
    skipNextBlurCommitRef.current = false;
    setDraftTitle(displayTitle);
    setIsRenaming(true);
  };

  // 菜单、状态说明、重命名或拖拽接管这一行时提示要让开：传给 Radix 的 open 是 false。这期间 Radix 想「关」提示时值没变，
  // 不回调 onOpenChange，「开」却照样回调；不挡掉这次「开」，tooltipOpen 会停在 true，指针移走后再关掉浮层，提示会自己冒出来。
  const tooltipSuppressed = menuOpen || statusOpen || isRenaming || Boolean(rowDrag?.isDragging);

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
      focusTitleAfterRenameRef.current = true;
      commitRename();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      focusTitleAfterRenameRef.current = true;
      cancelRename();
    }
  };

  const endLabel = archived
    ? <span className={`session-row-archived-tag ${SESSION_ROW_ARCHIVED_TAG_CLASS}`}>已归档</span>
    : status === "waiting_approval"
      ? <span className={`session-row-time ${SESSION_ROW_TIME_CLASS} ${SESSION_ROW_WAITING_CLASS}`}>待审批</span>
      : <span className={`session-row-time ${SESSION_ROW_TIME_CLASS}`}>{formatRelativeTimeZh(session.updatedAt)}</span>;

  return (
    <ContextMenu onOpenChange={setMenuOpen}>
      <Tooltip
        delayDuration={350}
        open={tooltipOpen && !tooltipSuppressed}
        onOpenChange={(open) => setTooltipOpen(open && !tooltipSuppressed)}
      >
        <TooltipTrigger asChild>
          <ContextMenuTrigger asChild>
            <div
              ref={rowRef}
              className={rowClass}
              data-session-id={session.id}
              onKeyDown={(event) => openContextMenuFromKeyboard(event, rowRef.current)}
              role="presentation"
              draggable={rowDrag ? true : undefined}
              onDragStart={rowDrag?.onDragStart}
              onDragOver={rowDrag?.onDragOver}
              onDrop={rowDrag?.onDrop}
              onDragEnd={rowDrag?.onDragEnd}
            >
              <DropIndicator position={rowDrag?.dropPosition ?? null} />
              <span className={`session-row-marker ${SESSION_ROW_MARKER_CLASS}`}>
                <SessionStatusButton status={status} dotClass={`${SESSION_STATUS_DOT_CLASS} ${statusMeta.dotClass}`} open={statusOpen} onOpenChange={setStatusOpen} />
              </span>
              {isRenaming ? (
                <div className={mainClass}>
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
                  ref={titleButtonRef}
                  className={mainClass}
                  type="button"
                  onClick={onSelect}
                  onDoubleClick={startRename}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={`session-row-title ${SESSION_ROW_TITLE_CLASS} ${status === "unread" ? SESSION_ROW_UNREAD_TITLE_CLASS : ""}`}>{displayTitle}</span>
                  {workspaceLabel ? <span className={SESSION_ROW_WORKSPACE_CLASS}>{workspaceLabel}</span> : null}
                  {session.hostName ? <span className="shrink-0 text-act-xxs text-text-faint" title={session.connectionState}>{session.hostName}{session.connectionState !== "connected" ? " · 离线" : ""}</span> : null}
                </button>
              )}
              <div className={SESSION_ROW_END_CLASS}>
                {isRenaming ? null : endLabel}
                <div className={SESSION_ROW_ACTIONS_CLASS}>
                  <IconButton
                    className="session-row-more"
                    size="xs"
                    label={`更多操作：${displayTitle}`}
                    tooltip="更多"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={(event) => {
                      event.stopPropagation();
                      openContextMenuAt(rowRef.current, event.currentTarget);
                    }}
                  >
                    <MoreHorizontal size={14} strokeWidth={1.9} aria-hidden="true" />
                  </IconButton>
                  {archived ? (
                    <IconButton
                      className="session-row-archive"
                      size="xs"
                      label="取消归档"
                      disabled={!onRestore}
                      onClick={(event) => { event.stopPropagation(); onRestore?.(); }}
                    >
                      <ArchiveRestore size={13} strokeWidth={1.9} aria-hidden="true" />
                    </IconButton>
                  ) : (
                    <IconButton
                      className="session-row-archive"
                      size="xs"
                      label={archiveLabel}
                      disabled={archiveDisabled}
                      onClick={(event) => { event.stopPropagation(); if (!archiveDisabled) onArchive?.(); }}
                    >
                      <Archive size={13} strokeWidth={1.9} aria-hidden="true" />
                    </IconButton>
                  )}
                  {onTogglePin && !archived ? (
                    <IconButton
                      className={`session-row-pin ${session.pinned ? "is-active text-text-main" : ""}`}
                      size="xs"
                      label={session.pinned ? "取消置顶会话" : "置顶会话"}
                      onClick={(event) => { event.stopPropagation(); onTogglePin(); }}
                    >
                      {session.pinned
                        ? <PinOff size={13} strokeWidth={1.9} aria-hidden="true" />
                        : <Pin size={13} strokeWidth={1.9} aria-hidden="true" />}
                    </IconButton>
                  ) : null}
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="max-w-[360px] select-none px-2.5 py-2 font-normal"
        >
          <span className="block text-act-xs font-medium text-text-main">{displayTitle}</span>
          <span className="mt-0.5 block text-act-xxs font-normal text-text-muted [overflow-wrap:anywhere]">
            {workspaceRoot ?? "工作区路径不可用"}
          </span>
        </TooltipContent>
      </Tooltip>
      <SessionContextMenuContent
        title={displayTitle}
        pinned={Boolean(session.pinned)}
        archived={archived}
        forkDisabled={forkDisabled}
        forkLabel={forkLabel}
        archiveDisabled={archiveDisabled}
        archiveLabel={archiveLabel}
        shouldRestoreFocus={() => {
          const fromRename = renameFromMenuRef.current;
          renameFromMenuRef.current = false;
          return !fromRename;
        }}
        onStartRename={() => {
          renameFromMenuRef.current = true;
          startRename();
        }}
        onTogglePin={onTogglePin}
        onRename={onRename}
        onCopySessionId={onCopySessionId}
        onCopyTranscript={onCopyTranscript}
        onFork={onFork}
        onArchive={onArchive}
        onRestore={onRestore}
      />
    </ContextMenu>
  );
}
