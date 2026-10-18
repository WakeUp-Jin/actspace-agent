import type { RuntimeV2SessionListItem } from "@actspace/shared/runtime-v2";
import { ArrowUp, Folder } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { openNewSession } from "../../app/new-session";
import { navigate } from "../../app/router";
import { useHostDescription } from "../../connection/use-connection";
import { readLastWorkspace } from "../../sessions/create-session";
import { formatRowTime, groupSessions, rowStatus, sessionTitle, splitSessions, workspaceOf } from "../../sessions/session-row-model";
import { isUnread, seedSeen, useSeen } from "../../sessions/unread-store";
import { useSessionList } from "../../sessions/use-session-list";
import { Button } from "../../ui/Button";
import { GlassPill } from "../../ui/GlassPill";
import { Pressable } from "../../ui/Pressable";
import { ArchivedToggle } from "./ArchivedToggle";
import { ListHeader } from "./ListHeader";
import { SessionRow } from "./SessionRow";

type Item = RuntimeV2SessionListItem;

/** 首页：玻璃顶栏 + 分组会话列表（「需要处理」置顶，其余按时间）+ 底部新建入口。 */
export function SessionListPane({ selectedSessionId }: { readonly selectedSessionId: string | null }) {
  const { sessions, approvals, running, error, refresh } = useSessionList();
  const workspaces = useHostDescription()?.workspaces ?? [];
  const seen = useSeen();
  const [showArchived, setShowArchived] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { active, archived } = useMemo(() => splitSessions(sessions ?? []), [sessions]);
  useEffect(() => { if (sessions) seedSeen(sessions); }, [sessions]);

  const statusOf = (item: Item) => rowStatus({ approvals: approvals.get(item.sessionId)?.length ?? 0, running: running.has(item.sessionId), unread: isUnread(item.sessionId, item.updatedAt, selectedSessionId, seen) });
  const groups = groupSessions(active, item => { const status = statusOf(item); return status === "approval" || status === "unread"; });
  const lastWorkspace = workspaces.find(item => item.id === readLastWorkspace()) ?? workspaces[0] ?? null;

  const renderRow = (item: Item, isArchived: boolean) => (
    <SessionRow
      key={item.sessionId}
      title={sessionTitle(item)}
      workspace={workspaceOf(item.workspaceRoot, workspaces)}
      time={formatRowTime(item.updatedAt)}
      status={statusOf(item)}
      selected={item.sessionId === selectedSessionId}
      archived={isArchived}
      onOpen={() => navigate({ name: "session", sessionId: item.sessionId })}
    />
  );

  return (
    <div className="relative h-full overflow-hidden">
      <div ref={scroller} className="no-scrollbar h-full overflow-y-auto pb-[calc(110px+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+58px)]">
        {sessions === null ? (
          error ? (
            <div className="grid justify-items-center gap-3 px-8 py-16 text-center text-act-md text-text-muted">
              <p className="m-0">无法加载会话列表</p>
              <Button onClick={() => void refresh()}>重试</Button>
            </div>
          ) : <p className="m-0 px-8 py-16 text-center text-act-md text-text-faint">加载中…</p>
        ) : active.length === 0 && archived.length === 0 ? (
          <p className="m-0 px-8 py-16 text-center text-act-md text-text-faint">还没有会话，在下面写一句话开始</p>
        ) : (
          <>
            {groups.map(group => (
              <section key={group.key} aria-label={group.label} className="mt-3.5 first:mt-1.5">
                <h2 className="m-0 flex items-center justify-between px-5 pb-1 text-act-xs font-medium text-text-faint">
                  <span>{group.label}</span>{group.key === "attention" ? <span className="tabular-nums">{group.items.length}</span> : null}
                </h2>
                <div className="inset-group mx-3">{group.items.map(item => renderRow(item, false))}</div>
              </section>
            ))}
            {archived.length ? <ArchivedToggle count={archived.length} open={showArchived} onToggle={() => setShowArchived(value => !value)} /> : null}
            {showArchived ? <div className="inset-group mx-3">{archived.map(item => renderRow(item, true))}</div> : null}
          </>
        )}
      </div>
      <ListHeader onTop={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })} />
      <div aria-hidden className="fade-bottom pointer-events-none absolute inset-x-0 bottom-0 z-1 h-[calc(env(safe-area-inset-bottom)+92px)]" />
      <div className="absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-2">
        <GlassPill strong className="rounded-act-pill">
          <Pressable onClick={openNewSession} aria-label="新建会话" className="flex h-[50px] items-center gap-2 rounded-act-pill pl-4 pr-2">
            <span className="min-w-0 flex-1 truncate text-act-base text-text-subtle">开始新会话…</span>
            {lastWorkspace ? <span className="flex max-w-[150px] items-center gap-1.5 text-act-sm font-medium text-text-muted"><Folder size={14} aria-hidden className="flex-none" /><span className="truncate">{lastWorkspace.name}</span></span> : null}
            <span aria-hidden className="send-btn" data-tone="off"><ArrowUp size={16} strokeWidth={2.4} /></span>
          </Pressable>
        </GlassPill>
      </div>
    </div>
  );
}
