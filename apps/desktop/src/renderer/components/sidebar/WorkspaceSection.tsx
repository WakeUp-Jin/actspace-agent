import { useRef, useState } from "react";
import { Archive, ChevronDown, ChevronRight, Folder, FolderOpen, PanelLeftClose, Plus } from "lucide-react";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { IconButton } from "../ui/IconButton";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "../ui/ContextMenu";
import { useSessionActions, type NewSessionInput } from "../../session/session-actions-context";
import { openContextMenuFromKeyboard } from "./SessionContextMenu";
import type { WorkspaceGroup } from "./session-grouping";
import { isSessionBusy, sessionStatusOf } from "./session-status";
import { SessionList } from "./SessionList";
import {
  NAV_SECTION_ACTIONS_CLASS, NAV_SECTION_CLASS, NAV_SECTION_LABEL_BASE_CLASS, NAV_SECTION_TITLE_CLASS, SESSION_CONTEXT_MENU_ICON_CLASS, SIDEBAR_BUTTON_RESET_CLASS,
} from "./styles";

const WORKSPACE_SECTION_CLASS = `${NAV_SECTION_CLASS} gap-0.5`;
const WORKSPACE_TITLE_ROW_CLASS =
  "workspace-folder-row group/workspace-row relative grid min-h-[26px] grid-cols-[14px_minmax(0,1fr)_auto] gap-2 px-2";
const WORKSPACE_ICON_SLOT_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} workspace-icon-slot relative inline-flex h-[14px] w-[14px] flex-none items-center justify-center rounded-act-sm p-0 text-text-faint transition-colors duration-(--motion-fast) ease-in-out hover:text-text-muted`;
const WORKSPACE_FOLDER_GLYPH_CLASS =
  "workspace-folder-glyph opacity-100 transition-opacity duration-(--motion-fast) ease-in-out group-hover/workspace-row:opacity-0";
const WORKSPACE_CHEVRON_GLYPH_CLASS =
  "workspace-chevron-glyph absolute inset-0 m-auto text-text-muted opacity-0 transition-opacity duration-(--motion-fast) ease-in-out group-hover/workspace-row:opacity-100";
const WORKSPACE_LABEL_CLASS =
  `${NAV_SECTION_LABEL_BASE_CLASS} workspace-folder-label text-act-sm text-text-muted hover:text-text-main`;
const WORKSPACE_NAME_CLASS = "workspace-folder-name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const WORKSPACE_ACTIONS_CLASS = NAV_SECTION_ACTIONS_CLASS;

type WorkspaceSectionProps = {
  group: WorkspaceGroup;
  /** 这个分组的全部会话（含置顶），用来判断「归档全部」是否可用；`group.sessions` 只有未置顶的。 */
  allSessions: SessionListItem[];
  workspaces: WorkspaceEntry[];
  activeSessionId: string | null;
  busySessionIds?: ReadonlySet<string>;
  sessionStatuses?: Record<string, unknown>;
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
  onSelectSession,
  onNewSession,
}: WorkspaceSectionProps) {
  const { onOpenWorkspace, onArchiveWorkspace, onRemoveWorkspace } = useSessionActions();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const titleRowRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLButtonElement | null>(null);
  const menuInteractedOutsideRef = useRef(false);
  const archiveDisabled = allSessions.length === 0 ||
    allSessions.some((session) => isSessionBusy(sessionStatusOf(session.id, busySessionIds, sessionStatuses)));
  const archiveTitle = archiveDisabled
    ? allSessions.length === 0 ? "没有可归档的会话" : "请等待运行中或待处理的会话结束"
    : "归档全部会话";
  const removeDisabled = group.workspaceId === workspaces.find((workspace) => workspace.kind === "default")?.id;

  return (
    <section
      className={`nav-section nav-section-workspace ${WORKSPACE_SECTION_CLASS}${collapsed ? " is-collapsed" : " is-expanded"}${menuOpen ? " is-menu-open" : ""}`}
    >
      <ContextMenu onOpenChange={setMenuOpen}>
        <ContextMenuTrigger asChild>
          <div
            ref={titleRowRef}
            className={`nav-section-title ${NAV_SECTION_TITLE_CLASS} ${WORKSPACE_TITLE_ROW_CLASS}${menuOpen ? " rounded-act-md bg-[var(--act-color-hover-overlay)]" : ""}`}
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
              aria-expanded={menuOpen}
              onKeyDown={(event) => openContextMenuFromKeyboard(event, titleRowRef.current, labelRef.current)}
            >
              <span className={WORKSPACE_NAME_CLASS}>{group.label}</span>
            </button>
            <div className={`nav-section-actions workspace-folder-actions ${WORKSPACE_ACTIONS_CLASS}`} aria-label="工作区操作">
              <IconButton
                className="workspace-add-button opacity-0 group-hover/workspace-row:opacity-100 focus-visible:opacity-100"
                size="xs"
                label="在工作区中新建会话"
                tooltip="在此工作区中新建会话"
                onClick={(event) => {
                  event.stopPropagation();
                  onNewSession({ hostId: group.hostId, workspaceId: group.workspaceId, workspaceRoot: group.workspaceRoot, agentForm: "agent" });
                }}
              >
                <Plus size={13} strokeWidth={2} aria-hidden="true" />
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
            disabled={archiveDisabled || !group.workspaceId || !onArchiveWorkspace}
            title={archiveTitle}
            onSelect={() => { if (group.workspaceId) onArchiveWorkspace?.(group.workspaceId, group.workspaceRoot); }}
          >
            <Archive size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
            归档全部
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            danger
            disabled={removeDisabled || !group.workspaceId || !onRemoveWorkspace}
            title={removeDisabled ? "默认工作区无法移除" : "从侧栏移除"}
            onSelect={() => { if (group.workspaceId) onRemoveWorkspace?.(group.workspaceId, group.workspaceRoot); }}
          >
            <PanelLeftClose size={16} strokeWidth={1.9} className="h-4 w-4" aria-hidden="true" />
            从侧栏移除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {collapsed ? null : (
        <SessionList
          sessions={group.sessions}
          activeSessionId={activeSessionId}
          busySessionIds={busySessionIds}
          sessionStatuses={sessionStatuses}
          onSelectSession={onSelectSession}
          groupKey={group.key}
          workspaces={workspaces}
        />
      )}
    </section>
  );
}
