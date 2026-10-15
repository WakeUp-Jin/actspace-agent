import { useMemo } from "react";
import type { SessionListItem, WorkspaceEntry } from "@actspace/shared";
import { needsAttention, sessionStatusOf } from "./session-status";
import { bucketByTime } from "./sidebar-view";
import { SessionList } from "./SessionList";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { useRemotePaging } from "./use-remote-paging";
import { Button } from "../ui/Button";

const TIME_GROUP_CLASS = "sidebar-time-group flex min-w-0 flex-col gap-px";
const TIME_DATE_CLASS = "font-normal text-text-faint/70";
const TIME_COUNT_CLASS = "min-w-4 rounded-act-pill bg-warning/15 px-1.5 text-center text-act-xxs leading-4 font-semibold text-warning";

type SidebarTimeViewProps = {
  /** 未置顶的会话（按归档筛选过）；这里按最近更新分进各时间段。 */
  sessions: SessionListItem[];
  workspaces: WorkspaceEntry[];
  activeSessionId: string | null;
  busySessionIds?: ReadonlySet<string>;
  sessionStatuses?: Record<string, unknown>;
  collapsed: Record<string, boolean>;
  onToggle: (key: string) => void;
  onSelectSession: (sessionId: string) => void;
  workspaceLabelOf: (session: SessionListItem) => string | undefined;
};

/**
 * 按时间分组（Codex）：最上面「需要处理」收待审批、失败和跑完未看的会话，其余落进今天、昨天、近 7 天、本月更早、各月。
 * 时间段内不限条数；服务端还有没加载的会话时，在最后统一「加载更多会话」。
 */
export function SidebarTimeView({
  sessions, workspaces, activeSessionId, busySessionIds, sessionStatuses, collapsed, onToggle, onSelectSession, workspaceLabelOf,
}: SidebarTimeViewProps) {
  const buckets = useMemo(
    () => bucketByTime(sessions, new Date(), (session) => !session.archived && needsAttention(sessionStatusOf(session.id, busySessionIds, sessionStatuses))),
    [busySessionIds, sessionStatuses, sessions],
  );
  const paging = useRemotePaging({ pinned: false, sessions });
  return (
    <>
      {buckets.map((bucket) => {
        const bucketCollapsed = Boolean(collapsed[bucket.key]);
        return (
          <div key={bucket.key} className={TIME_GROUP_CLASS} data-time-bucket={bucket.key}>
            <SidebarSectionHeader
              compact
              className={bucket.attention ? "text-warning" : undefined}
              collapsed={bucketCollapsed}
              onToggle={() => onToggle(bucket.key)}
              label={<>
                <span className={bucket.attention ? "text-warning" : undefined}>{bucket.label}</span>
                {bucket.date ? <span className={TIME_DATE_CLASS}>{bucket.date}</span> : null}
                {bucket.attention ? <span className={TIME_COUNT_CLASS}>{bucket.sessions.length}</span> : null}
              </>}
            />
            {bucketCollapsed ? null : (
              <SessionList
                sessions={bucket.sessions}
                activeSessionId={activeSessionId}
                busySessionIds={busySessionIds}
                sessionStatuses={sessionStatuses}
                onSelectSession={onSelectSession}
                groupKey={`time:${bucket.key}`}
                workspaces={workspaces}
                limited={false}
                paged={false}
                workspaceLabelOf={workspaceLabelOf}
              />
            )}
          </div>
        );
      })}
      {paging.error ? <p role="alert" className="px-2 text-act-xs leading-4 text-text-muted">{paging.error}</p> : null}
      {paging.hasMore ? (
        <Button className="session-list-toggle ml-5 self-start" variant="ghost" size="xs" busy={paging.loading} disabled={paging.loading} onClick={() => { void paging.loadMore(); }}>
          {paging.loading ? "正在加载…" : "加载更多会话"}
        </Button>
      ) : null}
    </>
  );
}
