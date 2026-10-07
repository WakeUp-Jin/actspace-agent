import { memo, useRef } from "react";
import { Check, ChevronDown, Users } from "lucide-react";
import { ActorAvatar } from "../avatar/ActorAvatar";
import {
  currentSpace, currentTab, describeMember, groupMembers, showTodo, STATUS_LABEL,
} from "../model/selectors";
import type { MemberStatus, RosterActor, SpaceMember } from "../model/types";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../model/use-space-demo";
import { PanelEmpty } from "./PanelEmpty";
import { useFlipRows } from "./use-flip-rows";

/**
 * 右栏「Actor」标签：按状态分组（等你决定 → 出错 → 工作中 → 有结果 → 空闲），分组条可折叠。
 * 行在分组间移动时用 FLIP 平移，协调 Agent 交事时被点亮的行闪一下。
 */

const GROUP_HEAD_BASE =
  "flex h-[30px] w-full items-center gap-1.5 rounded-act-sm border-0 py-0 pl-1.5 pr-2.5 text-left text-act-xs transition-colors duration-(--motion-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";
const GROUP_HEAD_NORMAL = "bg-surface-subtle font-medium text-text-muted hover:bg-hover-overlay hover:text-text-main";
// 等你决定：折叠后也要一眼看到
const GROUP_HEAD_WAIT = "bg-warning-soft font-semibold text-warning hover:brightness-95";
const ROW_CLASS =
  "space-row-flip flex h-9 w-full min-w-0 items-center gap-2 rounded-act-sm border-0 bg-transparent py-0 pl-2 pr-2.5 text-left transition-colors duration-(--motion-fast) hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";

/** 待办小圆环：done/total 的弧 */
function TodoRing({ done, total }: { done: number; total: number }) {
  const circumference = 2 * Math.PI * 5;
  const offset = circumference * (1 - (total ? done / total : 0));
  return (
    <svg className="size-[13px] shrink-0 -rotate-90" viewBox="0 0 13 13" aria-hidden="true">
      <circle className="fill-none stroke-line [stroke-width:1.8]" cx="6.5" cy="6.5" r="5" />
      <circle
        className="fill-none stroke-line-strong transition-[stroke-dashoffset] duration-(--motion-slow) [stroke-linecap:round] [stroke-width:1.8]"
        cx="6.5" cy="6.5" r="5" strokeDasharray={circumference.toFixed(2)} strokeDashoffset={offset.toFixed(2)}
      />
    </svg>
  );
}

interface RowProps {
  member: SpaceMember;
  actor: RosterActor | undefined;
  current: boolean;
  lit: boolean;
  fresh: boolean;
  tabbable: boolean;
  onOpen: (id: string) => void;
}

// 保留原生 <button>：这是头像 + 多列文字的行，ui/Button 固定内边距和单行布局，套不上。
const ActorRow = /* @__PURE__ */ memo(function ActorRow({ member: m, actor, current, lit, fresh, tabbable, onOpen }: RowProps) {
  const d = describeMember(m);
  const name = actor?.name ?? m.id;
  const todo = showTodo(m) ? m.todo : undefined;
  const cls = [ROW_CLASS, current ? "bg-selected" : "", lit ? "space-row-lit" : "", fresh ? "space-row-fresh" : ""].filter(Boolean).join(" ");
  return (
    <button
      type="button" className={cls} data-row={m.id} aria-current={current} tabIndex={tabbable ? 0 : -1}
      title={`${name} · ${d.title}`} onClick={() => onOpen(m.id)}
    >
      <ActorAvatar id={m.id} actor={actor} size={22} working={m.status === "run"} />
      <span className={`max-w-[46%] shrink overflow-hidden text-ellipsis whitespace-nowrap text-act-sm text-text-main ${m.unread ? "font-semibold" : "font-medium"}`}>
        {name}
      </span>
      <span className={`inline-flex min-w-0 flex-1 items-center gap-1 text-act-xs ${d.faint ? "text-text-faint" : "text-text-muted"}`}>
        {d.check ? <Check size={12} strokeWidth={2.2} className="shrink-0 text-operational" aria-hidden="true" /> : null}
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{d.text}</span>
      </span>
      {m.unread ? <span className="size-1.5 shrink-0 rounded-full bg-accent" role="img" aria-label="未读" /> : null}
      {todo ? (
        <span
          className="inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-act-pill border border-line pl-[5px] pr-[7px] text-act-xxs tabular-nums text-text-muted"
          title={`待办 ${todo[0]}/${todo[1]}`}
        >
          <TodoRing done={todo[0]} total={todo[1]} />
          {todo[0]}/{todo[1]}
        </span>
      ) : null}
      {m.time ? <span className="min-w-[3.5em] shrink-0 whitespace-nowrap text-right text-act-xxs tabular-nums text-text-faint">{m.time}</span> : null}
    </button>
  );
});

function GroupHead({ status, count, closed, onToggle }: { status: MemberStatus; count: number; closed: boolean; onToggle: (s: MemberStatus) => void }) {
  const wait = status === "wait";
  return (
    <button
      type="button" className={`${GROUP_HEAD_BASE} ${wait ? GROUP_HEAD_WAIT : GROUP_HEAD_NORMAL}`}
      aria-expanded={!closed} onClick={() => onToggle(status)}
    >
      <ChevronDown
        size={13} strokeWidth={2} aria-hidden="true"
        className={`shrink-0 transition-transform duration-(--motion-base) ${closed ? "-rotate-90" : ""} ${wait ? "" : "text-text-faint"}`}
      />
      <span>{STATUS_LABEL[status]}</span>
      <span className={`font-normal tabular-nums ${wait ? "" : "text-text-faint"}`}>{count}</span>
    </button>
  );
}

export function ActorGroups() {
  const space = useSpaceDemoSelector(currentSpace);
  const actors = useSpaceDemoSelector((s) => s.actors);
  const tab = useSpaceDemoSelector(currentTab);
  const collapsed = useSpaceDemoSelector((s) => s.collapsed);
  const litRows = useSpaceDemoSelector((s) => s.litRows);
  const revision = useSpaceDemoSelector((s) => s.rowsRevision);
  const { toggleGroup, openActorTab } = useSpaceDemoActions();
  const rootRef = useRef<HTMLDivElement>(null);
  const fresh = useFlipRows(rootRef, revision);
  const groups = groupMembers(space.members);

  if (!groups.length) return <PanelEmpty icon={<Users size={22} strokeWidth={1.6} />}>这个 Space 还没有成员。</PanelEmpty>;

  return (
    <div ref={rootRef}>
      {groups.map((g) => {
        const closed = !!collapsed[g.status];
        return (
          <div key={g.status} className="mb-1.5" data-group={g.status}>
            <GroupHead status={g.status} count={g.members.length} closed={closed} onToggle={toggleGroup} />
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-(--motion-slow) ease-(--ease-standard) ${closed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"}`}
              aria-hidden={closed}
            >
              <div className="flex min-h-0 flex-col gap-px overflow-hidden pt-[3px]">
                {g.members.map((m) => (
                  <ActorRow
                    key={m.id} member={m} actor={actors[m.id]} current={tab === m.id}
                    lit={litRows.includes(m.id)} fresh={fresh.has(m.id)} tabbable={!closed} onOpen={openActorTab}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
