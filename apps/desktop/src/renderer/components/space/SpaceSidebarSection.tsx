import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Grid2x2Plus, Plus } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { NAV_SECTION_ACTIONS_CLASS, NAV_SECTION_CLASS, NAV_SECTION_LABEL_BASE_CLASS, NAV_SECTION_TITLE_CLASS, SIDEBAR_BUTTON_RESET_CLASS } from "../sidebar/styles";
import { ActorAvatar, SpaceAvatar, actorImage } from "./avatar/ActorAvatar";
import { nameOf, rosterActors, waitCount } from "./model/selectors";
import { useSpaceDemoActions, useSpaceDemoState } from "./model/use-space-demo";

/**
 * 左栏里 Space 演示的几处入口（设计文档 §4.2、D30）。
 * 主操作行的样式由 Sidebar 传进来，保证和「新建会话」「扩展」完全一致。
 * `inSpace` 表示工作台当前显示的是 Space 演示区（SidebarView === "space"）。
 */

const REVEAL_CLASS = "opacity-0 group-hover/nav-title:opacity-100 group-focus-within/nav-title:opacity-100";
const DEMO_TAG_CLASS = "rounded-act-xs bg-info-soft px-1 text-act-xxs leading-4 font-medium text-on-info";
const ROW_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid min-h-9 w-full min-w-0 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-act-md px-2 text-left text-act-sm font-medium text-text-muted transition-[background,color] duration-(--motion-fast) ease-in-out hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main focus-visible:outline-2 focus-visible:outline-focus-ring`;
// 用 aria-current 变体：基础类里的 bg-transparent 在样式表里排在 bg-sidebar-selected 之后，直接加类会被盖掉。
const ROW_ACTIVE_CLASS = "aria-[current=page]:bg-sidebar-selected aria-[current=page]:text-text-main";
const PRIMARY_ACTIVE_CLASS = "aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-text-main";
const SOLO_ROW_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} grid min-h-9 w-full min-w-0 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-act-md px-2 text-left text-act-sm font-medium text-text-muted transition-[background,color] duration-(--motion-fast) ease-in-out hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main focus-visible:outline-2 focus-visible:outline-focus-ring`;
const NAME_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const WAIT_BADGE_CLASS = "min-w-4 rounded-act-pill bg-warning-soft px-1 text-center text-act-xxs leading-4 font-semibold text-on-warning";
const COUNT_CLASS = "text-act-xs leading-4 font-medium text-text-faint";
const STACK_IMG_CLASS = "h-3 w-3 rounded-act-xs object-cover ring-1 ring-sidebar";

export function NewSpaceAction({ className, labelClassName, onNewSpace }: { className: string; labelClassName: string; onNewSpace: () => void }) {
  return (
    <button className={className} type="button" onClick={onNewSpace}>
      <Grid2x2Plus size={14} strokeWidth={1.9} />
      <span className={labelClassName}>新建 Space</span>
    </button>
  );
}

export function ActorRosterAction({
  className,
  labelClassName,
  inSpace,
  onEnter,
}: {
  className: string;
  labelClassName: string;
  inSpace: boolean;
  onEnter: () => void;
}) {
  const state = useSpaceDemoState();
  const { goRoster } = useSpaceDemoActions();
  const roster = useMemo(() => rosterActors(state.actors), [state.actors]);
  const active = inSpace && state.view === "roster";
  return (
    <button
      className={`${className} ${PRIMARY_ACTIVE_CLASS}`}
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => {
        goRoster();
        onEnter();
      }}
    >
      <span className="relative h-3.5 w-3.5 shrink-0" aria-hidden="true">
        {roster.slice(0, 2).map((actor, index) => (
          <img
            key={actor.id}
            className={`${STACK_IMG_CLASS} absolute ${index === 0 ? "left-0 top-0" : "bottom-0 right-0"}`}
            src={actorImage(actor, actor.id)}
            alt=""
            draggable={false}
          />
        ))}
      </span>
      <span className={labelClassName}>Actor 名册</span>
      <span className={COUNT_CLASS}>{roster.length}</span>
    </button>
  );
}

export function SpaceSidebarSection({ inSpace, onEnter, onNewSpace }: { inSpace: boolean; onEnter: () => void; onNewSpace: () => void }) {
  const state = useSpaceDemoState();
  const { switchSpace } = useSpaceDemoActions();
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed((value) => !value);
  return (
    <section className={NAV_SECTION_CLASS} aria-label="Space">
      <div className={NAV_SECTION_TITLE_CLASS}>
        <button className={`${NAV_SECTION_LABEL_BASE_CLASS} text-act-xs`} type="button" onClick={toggle} aria-expanded={!collapsed}>
          <span>Space</span>
          <span className={DEMO_TAG_CLASS} title="开发中演示，数据是模拟的">演示</span>
        </button>
        <div className={NAV_SECTION_ACTIONS_CLASS}>
          <IconButton className={REVEAL_CLASS} size="xs" label="新建 Space" onClick={onNewSpace}>
            <Plus size={13} strokeWidth={1.9} aria-hidden="true" />
          </IconButton>
          <IconButton className={REVEAL_CLASS} size="xs" label={collapsed ? "展开 Space" : "收起 Space"} onClick={toggle}>
            {collapsed ? <ChevronRight size={13} strokeWidth={1.9} aria-hidden="true" /> : <ChevronDown size={13} strokeWidth={1.9} aria-hidden="true" />}
          </IconButton>
        </div>
      </div>
      {collapsed ? null : (
        <div className="flex min-w-0 flex-col gap-px">
          {state.spaces.map((space) => {
            const active = inSpace && state.view === "space" && state.spaceId === space.id;
            const wait = waitCount(space);
            return (
              <button
                key={space.id}
                className={`${ROW_CLASS} ${ROW_ACTIVE_CLASS}`}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  switchSpace(space.id);
                  onEnter();
                }}
              >
                <SpaceAvatar space={space} size={18} />
                <span className={NAME_CLASS}>{space.name}</span>
                {wait > 0 ? <span className={WAIT_BADGE_CLASS} title={`${wait} 个 Actor 等你决定`}>{wait}</span> : <span />}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** 一对一对话就是普通会话，放在工作区的会话列表里（D30）。 */
export function SpaceSoloChatRows({ inSpace, onEnter }: { inSpace: boolean; onEnter: () => void }) {
  const state = useSpaceDemoState();
  const { openSoloChat } = useSpaceDemoActions();
  if (state.soloChats.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-px" aria-label="和 Actor 的一对一对话">
      {state.soloChats.map((id) => {
        const active = inSpace && state.view === "chat" && state.chatWith === id;
        return (
          <button
            key={id}
            className={`${SOLO_ROW_CLASS} ${ROW_ACTIVE_CLASS}`}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => {
              openSoloChat(id);
              onEnter();
            }}
          >
            <ActorAvatar id={id} actor={state.actors[id]} size={16} />
            <span className={NAME_CLASS}>{nameOf(state.actors, id)}</span>
            <span className="text-act-xxs text-text-faint">刚刚</span>
          </button>
        );
      })}
    </div>
  );
}
