import { useRef, useState } from "react";
import { Archive, ChevronDown, Folder, FolderOpen, MoreHorizontal, PanelLeftClose, Plus } from "lucide-react";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { IconButton } from "../ui/IconButton";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "../ui/ContextMenu";
import { useSessionActions, type NewSessionInput } from "../../session/session-actions-context";
import { openContextMenuAt, openContextMenuFromKeyboard } from "./SessionContextMenu";
import type { WorkspaceGroup } from "./session-grouping";
import { isSessionBusy, sessionStatusOf } from "./session-status";
import { SessionList } from "./SessionList";
import { DropIndicator } from "./DropIndicator";
import type { RowDrag } from "./use-sidebar-drag";
import {
  NAV_SECTION_ACTIONS_CLASS, NAV_SECTION_CLASS, NAV_SECTION_LABEL_BASE_CLASS, SESSION_CONTEXT_MENU_ICON_CLASS, SIDEBAR_BUTTON_RESET_CLASS,
} from "./styles";

const WORKSPACE_SECTION_CLASS = `${NAV_SECTION_CLASS} gap-px`;
const WORKSPACE_TITLE_ROW_CLASS =
  "workspace-folder-row group/workspace-row relative grid min-h-[30px] grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-act-md px-2 transition-[background,opacity] duration-(--motion-fast) ease-in-out hover:bg-[var(--act-color-hover-overlay)]";
// 文件夹和箭头叠在同一格里（Cursor）：悬停时文件夹淡出、箭头淡入；收起时箭头转到朝右。
const WORKSPACE_ICON_SLOT_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} workspace-icon-slot relative grid h-4 w-4 flex-none place-items-center rounded-act-sm p-0 text-text-faint`;
const WORKSPACE_FOLDER_GLYPH_CLASS =
  "workspace-folder-glyph col-start-1 row-start-1 opacity-100 transition-opacity duration-(--motion-base) ease-in-out group-hover/workspace-row:opacity-0";
const WORKSPACE_FOLDER_ACTIVE_CLASS = "text-accent";
const WORKSPACE_CHEVRON_GLYPH_CLASS =
  "workspace-chevron-glyph col-start-1 row-start-1 text-text-muted opacity-0 transition-[opacity,transform] duration-(--motion-slow) ease-(--ease-standard) group-hover/workspace-row:opacity-100";
const WORKSPACE_LABEL_CLASS =
  `${NAV_SECTION_LABEL_BASE_CLASS} workspace-folder-label h-[30px] text-act-sm text-text-muted hover:text-text-main group-hover/workspace-row:text-text-main`;
const WORKSPACE_NAME_CLASS = "workspace-folder-name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const WORKSPACE_ACTIONS_CLASS = `${NAV_SECTION_ACTIONS_CLASS} gap-px`;
const WORKSPACE_ACTION_REVEAL_CLASS = "opacity-0 group-hover/workspace-row:opacity-100 group-has-[:focus-visible]/workspace-row:opacity-100 focus-visible:opacity-100";

type WorkspaceSectionProps = {
  /** `group.sessions` 已按当前排序和归档筛选排好，只含未置顶的。 */
  group: WorkspaceGroup;
  /** 这个分组的全部会话（含置顶），用来判断「归档全部」是否可用。 */
  allSessions: SessionListItem[];
  workspaces: WorkspaceEntry[];
  activeSessionId: string | null;
  busySessionIds?: ReadonlySet<string>;
  sessionStatuses?: Record<string, unknown>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** 工作区行自己的拖拽（调整工作区顺序）。 */
  drag?: RowDrag;
  /** 组内会话的拖拽。 */
  rowDrag?: (session: SessionListItem) => RowDrag | undefined;
  /** 下面两个由 Sidebar 包一层（先切回聊天视图）；工作区操作直接读 SessionActionsContext。 */
  onSelectSession: (sessionId: string) => void;
  onNewSession: (input?: NewSessionInput) => void;
};

export function WorkspaceSection({
  group,
  allSessions,
  workspaces,
  activeSessionId,
  busySessionIds,
  sessionStatuses,
  collapsed,
  onToggleCollapsed,
  drag,
  rowDrag,
  onSelectSession,
  onNewSession,
}: WorkspaceSectionProps) {
  const { onOpenWorkspace, onArchiveWorkspace, onRemoveWorkspace } = useSessionActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const titleRowRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLButtonElement | null>(null);
  const menuInteractedOutsideRef = useRef(false);
  const archiveDisabled = allSessions.length === 0 ||
    allSessions.some((session) => isSessionBusy(sessionStatusOf(session.id, busySessionIds, sessionStatuses)));
  const archiveTitle = archiveDisabled
    ? allSessions.length === 0 ? "没有可归档的会话" : "请等待运行中或待处理的会话结束"
    : "归档全部会话";
  // 当前会话在这个分组里：文件夹用强调色，收起时也能看出当前会话在哪。
  const hasActive = activeSessionId !== null && group.sessions.some((session) => session.id === activeSessionId);
  const FolderGlyph = collapsed ? Folder : FolderOpen;

  return (
    <section
      className={`nav-section nav-section-workspace ${WORKSPACE_SECTION_CLASS}${collapsed ? " is-collapsed" : " is-expanded"}${menuOpen ? " is-menu-open" : ""}`}
    >
      <ContextMenu onOpenChange={setMenuOpen}>
        <ContextMenuTrigger asChild>
          <div
            ref={titleRowRef}
            className={`nav-section-title ${WORKSPACE_TITLE_ROW_CLASS}${menuOpen ? " is-menu-open bg-[var(--act-color-hover-overlay)]" : ""}${drag?.isDragging ? " opacity-40" : ""}`}
            draggable={drag ? true : undefined}
            onDragStart={drag?.onDragStart}
            onDragOver={drag?.onDragOver}
            onDrop={drag?.onDrop}
            onDragEnd={drag?.onDragEnd}
          >
            <DropIndicator position={drag?.dropPosition ?? null} />
            <button
              className={WORKSPACE_ICON_SLOT_CLASS}
              type="button"
              tabIndex={-1}
              onClick={onToggleCollapsed}
              aria-label={collapsed ? `展开 ${group.label}` : `收起 ${group.label}`}
              aria-expanded={!collapsed}
            >
              <FolderGlyph size={15} strokeWidth={1.8} className={`${WORKSPACE_FOLDER_GLYPH_CLASS} ${hasActive ? WORKSPACE_FOLDER_ACTIVE_CLASS : ""}`} aria-hidden="true" />
              <ChevronDown size={14} strokeWidth={2} className={`${WORKSPACE_CHEVRON_GLYPH_CLASS} ${collapsed ? "-rotate-90" : ""}`} aria-hidden="true" />
            </button>
            <button
              ref={labelRef}
              className={`nav-section-label ${WORKSPACE_LABEL_CLASS}`}
              type="button"
              title={group.workspaceRoot}
              aria-expanded={!collapsed}
              onClick={onToggleCollapsed}
              onKeyDown={(event) => openContextMenuFromKeyboard(event, titleRowRef.current, labelRef.current)}
            >
              <span className={WORKSPACE_NAME_CLASS}>{group.label}</span>
            </button>
            <div className={`nav-section-actions workspace-folder-actions ${WORKSPACE_ACTIONS_CLASS}`} aria-label="工作区操作">
              <IconButton
                className={`workspace-more-button ${menuOpen ? "opacity-100" : WORKSPACE_ACTION_REVEAL_CLASS}`}
                size="xs"
                label={`更多操作：${group.label}`}
                tooltip="更多"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  openContextMenuAt(titleRowRef.current, event.currentTarget);
                }}
              >
                <MoreHorizontal size={14} strokeWidth={1.9} aria-hidden="true" />
              </IconButton>
              <IconButton
                className={`workspace-add-button ${WORKSPACE_ACTION_REVEAL_CLASS}`}
                size="xs"
                label="在工作区中新建会话"
                tooltip="在此工作区中新建会话"
                onClick={(event) => {
                  event.stopPropagation();
                  onNewSession({ hostId: group.hostId, workspaceId: group.workspaceId, workspaceRoot: group.workspaceRoot, agentForm: "agent" });
                }}
              >
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-[208px]"
          aria-label={`工作区操作： ${group.label}`}
          onInteractOutside={() => { menuInteractedOutsideRef.current = true; }}
          onCloseAutoFocus={(event) => {
            // 选了菜单项或按 Esc 关闭后，焦点回到工作区名称；点外面关闭的不管。
            if (menuInteractedOutsideRef.current) {
              menuInteractedOutsideRef.current = false;
              return;
            }
            event.preventDefault();
            labelRef.current?.focus();
          }}
        >
          <ContextMenuItem
            disabled={!group.workspaceId || !onOpenWorkspace}
            onSelect={() => { if (group.workspaceId) onOpenWorkspace?.(group.workspaceId); }}
          >
            <FolderOpen size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
            在 IDE 中打开
          </ContextMenuItem>
          <ContextMenuItem
            disabled={archiveDisabled || !onArchiveWorkspace}
            title={archiveTitle}
            onSelect={() => { onArchiveWorkspace?.(group.key, group.workspaceRoot); }}
          >
            <Archive size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
            归档全部
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            danger
            disabled={!group.workspaceId || !onRemoveWorkspace}
            title="从侧栏移除"
            onSelect={() => { if (group.workspaceId) onRemoveWorkspace?.(group.workspaceId, group.workspaceRoot); }}
          >
            <PanelLeftClose size={16} strokeWidth={1.9} className="h-4 w-4" aria-hidden="true" />
            从侧栏移除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {collapsed ? null : (
        group.sessions.length === 0
          ? <p className="workspace-empty py-1 pl-[30px] text-act-xs text-text-faint">暂无会话</p>
          : (
            <SessionList
              sessions={group.sessions}
              activeSessionId={activeSessionId}
              busySessionIds={busySessionIds}
              sessionStatuses={sessionStatuses}
              onSelectSession={onSelectSession}
              groupKey={group.key}
              group={group}
              workspaces={workspaces}
              rowDrag={rowDrag}
            />
          )
      )}
    </section>
  );
}
