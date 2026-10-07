import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Archive, Pin } from "lucide-react";
import type { SessionListItem } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { IconButton } from "../ui/IconButton";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/Popover";
import { ContextMenu, ContextMenuTrigger } from "../ui/ContextMenu";
import { openContextMenuFromKeyboard, SessionContextMenuContent } from "./SessionContextMenu";
import { isSessionBusy, SESSION_STATUS_META, type SessionUiStatusKind } from "./session-status";
import { SIDEBAR_BUTTON_RESET_CLASS } from "./styles";

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

const SESSION_ROW_CLASS =
  "session-row group/session-row relative grid min-h-9 w-full min-w-0 grid-cols-[14px_minmax(0,1fr)_46px_auto] items-center gap-2 rounded-act-md px-2 transition-[background,color] duration-(--motion-fast) ease-in-out hover:bg-[var(--act-color-hover-overlay)]";
const SESSION_ROW_ACTIVE_CLASS = "is-active bg-sidebar-selected";
const SESSION_ROW_PINNED_CLASS = "is-pinned";
const SESSION_ROW_MARKER_CLASS = "relative flex h-[14px] w-[14px] flex-none items-center justify-center";
const SESSION_ROW_TITLE_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-act-sm font-medium";
const SESSION_ROW_TIME_CLASS = "min-w-[22px] whitespace-nowrap text-right text-act-xxs text-text-faint";
const SESSION_ROW_MAIN_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid min-w-0 grid-cols-[minmax(0,1fr)] items-center p-0 text-left text-text-muted transition-colors duration-(--motion-fast) ease-in-out group-hover/session-row:text-text-main group-[.is-active]/session-row:text-text-main`;
const SESSION_ROW_MAIN_MUTED_CLASS = "text-text-muted";
const SESSION_ROW_RENAME_INPUT_CLASS =
  "min-w-0 rounded-act-sm border border-focus-ring bg-surface-raised px-1.5 py-0.5 text-act-sm font-medium text-text-main outline-none ring-2 ring-focus-ring/20";
const SESSION_ROW_ACTIONS_CLASS = "inline-flex w-[46px] flex-none items-center justify-end gap-0.5";
const SESSION_ROW_ARCHIVE_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid h-[22px] w-[22px] flex-none place-items-center rounded-act-sm text-text-faint opacity-0 transition-[opacity,background,color] duration-(--motion-fast) ease-in-out group-hover/session-row:opacity-100 focus-visible:opacity-100 hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main`;
const SESSION_STATUS_CONTAINER_CLASS = "relative grid h-[22px] w-[14px] flex-none place-items-center";
const SESSION_STATUS_POPOVER_CLASS = "session-status-menu w-44 px-2 py-1.5 text-left text-act-xs";
const SESSION_STATUS_MENU_LABEL_CLASS = "font-medium text-text-main";
const SESSION_STATUS_MENU_DETAIL_CLASS = "mt-0.5 leading-snug text-text-faint";
const SESSION_ROW_PIN_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} session-row-pin grid h-[22px] w-[22px] flex-none place-items-center rounded-act-sm text-text-muted opacity-0 transition-[opacity,background,color] duration-(--motion-fast) ease-in-out group-hover/session-row:opacity-100 focus-visible:opacity-100 hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main`;
const SESSION_ROW_PIN_ACTIVE_CLASS = "is-active text-text-main";
const SESSION_STATUS_DOT_CLASS =
  "session-status-dot h-1.5 w-1.5 rounded-full bg-operational transition-opacity duration-(--motion-fast) ease-in-out";
const SESSION_STATUS_DOT_ACTIVE_CLASS = "is-active bg-operational";

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
  isActive: boolean;
  status: SessionUiStatusKind;
  onSelect: () => void;
  onTogglePin?: () => void;
  onRename?: (title: string) => void;
  onCopySessionId?: () => void;
  onCopyTranscript?: () => void;
  onFork?: () => void;
  onArchive?: () => void;
};

export function SessionRow({
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
  const dotClass = isActive && status === "idle"
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

  // 菜单、状态说明或重命名接管这一行时提示要让开：传给 Radix 的 open 是 false。这期间 Radix 想「关」提示时值没变，
  // 不回调 onOpenChange，「开」却照样回调；不挡掉这次「开」，tooltipOpen 会停在 true，指针移走后再关掉浮层，提示会自己冒出来。
  const tooltipSuppressed = menuOpen || statusOpen || isRenaming;

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
            >
              <span className={`session-row-marker ${SESSION_ROW_MARKER_CLASS}`}>
                <SessionStatusButton status={status} dotClass={dotClass} open={statusOpen} onOpenChange={setStatusOpen} />
              </span>
              {isRenaming ? (
                <div
                  className={`${SESSION_ROW_MAIN_CLASS} ${!isActive && status === "idle" ? SESSION_ROW_MAIN_MUTED_CLASS : ""}`}
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
                  ref={titleButtonRef}
                  className={`${SESSION_ROW_MAIN_CLASS} ${!isActive && status === "idle" ? SESSION_ROW_MAIN_MUTED_CLASS : ""}`}
                  type="button"
                  onClick={onSelect}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={`session-row-title ${SESSION_ROW_TITLE_CLASS}`}>{displayTitle}</span>
                  {session.hostName ? <span className="shrink-0 text-act-xxs text-text-faint" title={session.connectionState}>{session.hostName}{session.connectionState !== "connected" ? " · 离线" : ""}</span> : null}
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
      />
    </ContextMenu>
  );
}
