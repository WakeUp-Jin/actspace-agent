import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Archive, FolderPlus, MessagesSquare } from "lucide-react";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import { useSessionActions, type NewSessionInput } from "../../session/session-actions-context";
import { useSessionBrowse } from "../../session/SessionBrowseContext";
import { useHostDirectory, type HostDirectorySnapshot } from "../../target/host-directory";
import {
  groupSessionsByWorkspace, isInRegisteredWorkspace, isOrphanSession, sessionsByGroupKey, sessionWorkspaceLabel, workspaceLabelFromRoot,
  type WorkspaceGroup,
} from "./session-grouping";
import {
  FLAT_ORDER_ACCOUNT, GROUPS_ORDER_ACCOUNT, PINNED_ORDER_ACCOUNT, isManualOrder, moveInOrder, orderGroups, orderSessions,
} from "./sidebar-view";
import { sidebarViewStore, useSidebarView } from "./sidebar-view-store";
import { SessionList } from "./SessionList";
import { SidebarSearchBox, SidebarSearchButton, SidebarSectionHeader } from "./SidebarSectionHeader";
import { SidebarTimeView } from "./SidebarTimeView";
import { SidebarViewMenu } from "./SidebarViewMenu";
import { WorkspaceSection } from "./WorkspaceSection";
import { useArchivedSessions } from "./use-archived-sessions";
import { useSessionSearch } from "./use-session-search";
import { useSidebarDrag, type SidebarReorder } from "./use-sidebar-drag";
import { NAV_SECTION_CLASS } from "./styles";

const selectHosts = (snapshot: HostDirectorySnapshot) => snapshot.hosts;

const SESSIONS_SECTION_CLASS = `${NAV_SECTION_CLASS} gap-1`;
const SIDEBAR_NOTE_CLASS = "px-2 text-act-xs leading-4 text-text-muted";
const LIST_EMPTY_CLASS = "sidebar-list-empty mt-10 flex flex-col items-center gap-2 text-act-xs text-text-faint";
const SORT_NOTICE_MS = 3000;

type SidebarSessionsProps = {
  sessions: SessionListItem[];
  workspaces: WorkspaceEntry[];
  activeSessionId: string | null;
  busySessionIds?: ReadonlySet<string>;
  sessionStatuses?: Record<string, unknown>;
  /** 由 Sidebar 包一层（先切回聊天视图）。 */
  onSelectSession: (sessionId: string) => void;
  onNewSession: (input?: NewSessionInput) => void;
  /** 会话分区展开、没在搜索时放在列表最上面（Space 演示的一对一对话）。 */
  leading?: ReactNode;
};

/**
 * 侧栏的会话部分：「已置顶」和「工作区 / 会话」两个分区。视图选项（分组、排序、归档筛选）、手动顺序和折叠状态存在 sidebarViewStore。
 * 拖拽只在手动排序可用的视图里出现；在「最近更新」下拖一次会先拍下当前顺序再切到手动排序。
 */
export function SidebarSessions({
  sessions, workspaces, activeSessionId, busySessionIds, sessionStatuses, onSelectSession, onNewSession, leading,
}: SidebarSessionsProps) {
  const { onAddWorkspace } = useSessionActions();
  const browse = useSessionBrowse();
  const view = useSidebarView();
  const store = sidebarViewStore;
  const { options } = view;
  const manual = isManualOrder(options);
  const savedOrder = (account: string) => (manual ? view.orders[account] : undefined);
  const hosts = useHostDirectory(selectHosts);
  const hostNameOf = useCallback((hostId: string) => hosts.find((host) => host.hostId === hostId)?.name, [hosts]);
  const labelOf = useCallback((session: SessionListItem) => sessionWorkspaceLabel(session, workspaces, hostNameOf), [workspaces, hostNameOf]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useSessionSearch(query, searchOpen);
  const searching = searchOpen && query.trim().length > 0;
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const closeSearch = (restoreFocus: boolean) => { setSearchOpen(false); setQuery(""); if (restoreFocus) searchButtonRef.current?.focus(); };

  // 已归档的只在筛选要求时拉，并且只放进还在侧栏里的工作区。
  const archivedPool = useArchivedSessions(options.archived !== "hide", sessions);
  const pool = useMemo(() => {
    const live = sessions.filter((session) => !session.archived && !isOrphanSession(session, workspaces));
    const archived = archivedPool.filter((session) => isInRegisteredWorkspace(session, workspaces));
    if (options.archived === "only") return archived;
    return options.archived === "all" ? [...live, ...archived] : live;
  }, [archivedPool, options.archived, sessions, workspaces]);

  const pinned = orderSessions(pool.filter((session) => session.pinned && !session.archived), savedOrder(PINNED_ORDER_ACCOUNT));
  const unpinned = useMemo(() => pool.filter((session) => !session.pinned || session.archived), [pool]);
  const flat = orderSessions(unpinned, savedOrder(FLAT_ORDER_ACCOUNT));
  const workspaceGroups = useMemo(() => {
    const groups = groupSessionsByWorkspace(unpinned, workspaces, hostNameOf);
    if (options.archived === "only") return groups.filter((group) => group.sessions.length > 0);
    for (const descriptor of browse?.groups ?? []) {
      // 没有路径的本机分组只来自旧会话，和 groupSessionsByWorkspace 一样不显示。
      if (descriptor.pinned || (!descriptor.hostId && !descriptor.workspaceRoot) || groups.some((group) => group.hostId === descriptor.hostId && (group.workspaceRoot ?? "") === descriptor.workspaceRoot)) continue;
      groups.push({ key: descriptor.hostId ? JSON.stringify([descriptor.hostId, descriptor.workspaceRoot]) : descriptor.workspaceRoot, hostId: descriptor.hostId, workspaceRoot: descriptor.workspaceRoot || undefined, label: descriptor.hostId ? `${hostNameOf(descriptor.hostId) ?? descriptor.hostId} · ${workspaceLabelFromRoot(descriptor.workspaceRoot)}` : workspaceLabelFromRoot(descriptor.workspaceRoot), sessions: [] });
    }
    return groups;
  }, [browse?.groups, hostNameOf, options.archived, unpinned, workspaces]);
  const orderedGroups: WorkspaceGroup[] = orderGroups(workspaceGroups, savedOrder(GROUPS_ORDER_ACCOUNT))
    .map((group) => ({ ...group, sessions: orderSessions(group.sessions, savedOrder(group.key)) }));
  // 「归档全部」会连置顶的会话一起归档，所以判断是否可用时看全部会话。
  const allByGroup = useMemo(() => sessionsByGroupKey(sessions, workspaces), [sessions, workspaces]);

  /** 当前看到的顺序，切到手动排序时拍下来作为起点。已归档的不进账本。 */
  const snapshot = (): Record<string, string[]> => {
    const ids = (list: readonly SessionListItem[]) => list.filter((session) => !session.archived).map((session) => session.id);
    const snap: Record<string, string[]> = {
      [PINNED_ORDER_ACCOUNT]: ids(pinned),
      [FLAT_ORDER_ACCOUNT]: ids(flat),
      [GROUPS_ORDER_ACCOUNT]: orderedGroups.map((group) => group.key),
    };
    for (const group of orderedGroups) snap[group.key] = ids(group.sessions);
    return snap;
  };

  const [sortNotice, setSortNotice] = useState(false);
  useEffect(() => {
    if (!sortNotice) return;
    const timer = setTimeout(() => setSortNotice(false), SORT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [sortNotice]);
  const handleReorder: SidebarReorder = (account, id, targetId, after) => {
    const snap = snapshot();
    const shown = snap[account] ?? [];
    // 还没加载出来的会话保留在原来的相对位置之后。
    const base = [...shown, ...(savedOrder(account) ?? []).filter((value) => !shown.includes(value))];
    store.setOrder(account, moveInOrder(base, id, targetId, after), manual ? undefined : snap);
    if (!manual) setSortNotice(true);
  };
  const { rowDrag, containerProps } = useSidebarDrag(handleReorder);
  const canDrag = options.groupBy !== "time" && !searching;
  const sessionDrag = (account: string) => (canDrag ? (session: SessionListItem) => rowDrag(account, session.id) : undefined);

  const sessionsCollapsed = Boolean(view.sectionCollapsed.sessions);
  const pinnedCollapsed = Boolean(view.sectionCollapsed.pinned);
  const showPinnedSection = !searching && (pinned.length > 0 || (options.archived !== "only" && Boolean(browse?.groups.some((group) => group.pinned && group.hasMore))));
  const listProps = { activeSessionId, busySessionIds, sessionStatuses, onSelectSession, workspaces };

  let body: ReactNode;
  if (searching) {
    const page = search.page;
    body = (
      <div className="sidebar-search-results flex min-w-0 flex-col gap-1" aria-label="会话搜索结果">
        {search.loading ? <p role="status" className={SIDEBAR_NOTE_CLASS}>正在搜索会话…</p> : null}
        {search.error ? <p role="alert" className={SIDEBAR_NOTE_CLASS}>{search.error}</p> : null}
        {page?.readModel?.status === "fallback" ? <p role="status" className={SIDEBAR_NOTE_CLASS}>查询索引暂不可用，已从会话文件读取</p> : null}
        {page && page.items.length === 0 ? <p className="px-2 py-1 text-act-xs text-text-faint">没有匹配的本机会话</p> : null}
        {page && page.items.length > 0 ? (
          <SessionList {...listProps} sessions={page.items} groupKey="search" limited={false} paged={false} workspaceLabelOf={labelOf} />
        ) : null}
        {page?.nextCursor ? (
          <Button className="ml-5 self-start" variant="ghost" size="xs" disabled={search.loading} onClick={() => { void search.next(); }}>下一页结果</Button>
        ) : null}
      </div>
    );
  } else if (sessionsCollapsed) {
    body = null;
  } else {
    const empty = options.groupBy === "workspace" ? orderedGroups.length === 0 : unpinned.length === 0;
    body = (
      <>
        {leading}
        {empty ? (
          options.archived === "only" ? (
            <div className={LIST_EMPTY_CLASS}>
              <Archive size={22} strokeWidth={1.6} aria-hidden="true" />
              <span>暂无已归档会话</span>
              <Button variant="ghost" size="xs" onClick={() => store.setArchived("hide")}>查看其他会话</Button>
            </div>
          ) : (
            <div className={LIST_EMPTY_CLASS}>
              <MessagesSquare size={22} strokeWidth={1.6} aria-hidden="true" />
              <span>暂无会话</span>
            </div>
          )
        ) : options.groupBy === "flat" ? (
          <SessionList {...listProps} sessions={flat} groupKey={FLAT_ORDER_ACCOUNT} limited={false} workspaceLabelOf={labelOf} rowDrag={sessionDrag(FLAT_ORDER_ACCOUNT)} />
        ) : options.groupBy === "time" ? (
          <SidebarTimeView
            {...listProps}
            sessions={unpinned}
            collapsed={view.timeCollapsed}
            onToggle={(key) => store.toggle("timeCollapsed", key)}
            workspaceLabelOf={labelOf}
          />
        ) : (
          orderedGroups.map((group) => (
            <WorkspaceSection
              key={group.key}
              {...listProps}
              group={group}
              allSessions={allByGroup.get(group.key) ?? []}
              collapsed={Boolean(view.groupCollapsed[group.key])}
              onToggleCollapsed={() => store.toggle("groupCollapsed", group.key)}
              drag={canDrag ? rowDrag(GROUPS_ORDER_ACCOUNT, group.key) : undefined}
              rowDrag={sessionDrag(group.key)}
              onNewSession={onNewSession}
            />
          ))
        )}
      </>
    );
  }

  return (
    <>
      {showPinnedSection ? (
        <section className={`nav-section nav-section-pinned ${NAV_SECTION_CLASS}`} {...containerProps}>
          <SidebarSectionHeader label={<span>已置顶</span>} collapsed={pinnedCollapsed} onToggle={() => store.toggle("sectionCollapsed", "pinned")} />
          {pinnedCollapsed ? null : (
            <SessionList
              {...listProps}
              sessions={pinned}
              groupKey={PINNED_ORDER_ACCOUNT}
              limited={false}
              workspaceLabelOf={options.groupBy === "workspace" ? undefined : labelOf}
              rowDrag={sessionDrag(PINNED_ORDER_ACCOUNT)}
            />
          )}
        </section>
      ) : null}

      <section className={`nav-section nav-section-workspaces ${SESSIONS_SECTION_CLASS}`} {...containerProps}>
        <SidebarSectionHeader
          label={<span>{options.groupBy === "workspace" ? "工作区" : "会话"}</span>}
          collapsed={sessionsCollapsed}
          onToggle={() => store.toggle("sectionCollapsed", "sessions")}
          overlay={searchOpen ? <SidebarSearchBox query={query} onQueryChange={setQuery} onClose={closeSearch} /> : undefined}
          actions={<>
            <SidebarSearchButton buttonRef={searchButtonRef} onOpen={() => setSearchOpen(true)} />
            <SidebarViewMenu
              options={options}
              onGroupBy={store.setGroupBy}
              onSort={(sort) => store.setSort(sort, sort === "manual" ? snapshot() : undefined)}
              onArchived={store.setArchived}
              onReset={store.resetOptions}
            />
            <IconButton
              className="sidebar-add-workspace"
              size="xs"
              label="添加工作区"
              tooltip="添加工作区"
              onClick={(event) => { event.stopPropagation(); onAddWorkspace?.(); }}
            >
              <FolderPlus size={14} strokeWidth={1.9} aria-hidden="true" />
            </IconButton>
          </>}
        />
        {sortNotice ? <p role="status" className={`sidebar-sort-notice ${SIDEBAR_NOTE_CLASS}`}>已切换为手动排序</p> : null}
        {body}
      </section>
    </>
  );
}
