import type { ReactNode } from "react";
import { Users, X } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { ActorAvatar, SpaceAvatar } from "../avatar/ActorAvatar";
import { COORD_TAB, currentSpace, currentTab, nameOf } from "../model/selectors";
import type { SpaceMember } from "../model/types";
import { useSpaceDemoActions, useSpaceDemoState } from "../model/use-space-demo";
import { StatusDot } from "../thread/StatusDot";
import { SpaceTabMenu } from "./SpaceTabMenu";
import { useTabOverflow } from "./use-tab-overflow";

// 选中样式向右栏标签靠（RightPanelTabStrip）：30px 高、rounded-act-md、选中 bg-surface-subtle。
const NO_DRAG = "[-webkit-app-region:no-drag]";
const TAB_CLASS = `group relative inline-flex h-[30px] max-w-[220px] shrink-0 items-center rounded-act-md pl-1.5 pr-1.5 text-act-sm leading-none transition-colors duration-(--motion-fast) ease-in-out ${NO_DRAG}`;
const TAB_IDLE_CLASS = "text-text-muted hover:bg-hover-overlay hover:text-text-main";
const TAB_ACTIVE_CLASS = "bg-surface-subtle font-medium text-text-main";
const TAB_BODY_CLASS =
  "flex h-full min-w-0 items-center gap-[7px] rounded-act-md bg-transparent text-[inherit] outline-none [cursor:pointer] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const FADE_CLASS = {
  none: "",
  left: "[mask-image:linear-gradient(to_right,transparent,var(--act-color-text)_24px)]",
  right: "[mask-image:linear-gradient(to_left,transparent,var(--act-color-text)_24px)]",
  both: "[mask-image:linear-gradient(to_right,transparent,var(--act-color-text)_24px,var(--act-color-text)_calc(100%_-_24px),transparent)]",
} as const;

function SingleTab({ children }: { children: ReactNode }) {
  return (
    <div role="tablist" aria-label="标签" className="flex h-full min-w-0 items-center">
      <div role="tab" aria-selected="true" className={`${TAB_CLASS} ${TAB_ACTIVE_CLASS} gap-[7px] font-semibold`}>{children}</div>
    </div>
  );
}

function ActorTab({ member, active }: { member: SpaceMember; active: boolean }) {
  const { selectTab, closeTab } = useSpaceDemoActions();
  const actor = useSpaceDemoState().actors[member.id];
  const name = actor?.name ?? member.id;
  const flagged = member.status === "wait" || member.status === "fail";
  return (
    <div data-tab-id={member.id} data-active={active} className={`${TAB_CLASS} ${active ? TAB_ACTIVE_CLASS : TAB_IDLE_CLASS}`}>
      <button type="button" role="tab" aria-selected={active} className={TAB_BODY_CLASS} onClick={() => selectTab(member.id)}>
        <ActorAvatar id={member.id} actor={actor} size={18} working={member.status === "run"} />
        <span className="min-w-0 truncate">{name}</span>
        {flagged ? <StatusDot status={member.status} /> : null}
        {member.unread ? <span role="img" aria-label="有未读" className="size-1.5 shrink-0 rounded-act-pill bg-info" /> : null}
      </button>
      <IconButton
        label={`关闭 ${name}`} tooltip={false} size="xs"
        className="ml-1 size-[18px] opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100 focus-visible:opacity-100"
        onClick={() => closeTab(member.id)}
      >
        <X size={12} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

/** 窗口顶部 chrome 栏中间的标签栏：协调 Agent 固定最左，Actor 标签横向滚动。 */
export function SpaceTabBar() {
  const state = useSpaceDemoState();
  const { selectTab } = useSpaceDemoActions();
  const space = currentSpace(state);
  const active = currentTab(state);
  const openMembers = space.openTabs.flatMap((id) => space.members.filter((m) => m.id === id));
  const signature = state.view === "space" ? `${space.id}|${openMembers.map((m) => m.id).join(",")}` : state.view;
  const { stripRef, over, fadeLeft, fadeRight, visibleIds } = useTabOverflow(active, signature);

  if (state.view === "roster") {
    return (
      <div className="flex h-full min-w-0 items-center">
        <SingleTab><Users size={16} aria-hidden="true" /><span className="truncate">Actor 名册</span></SingleTab>
      </div>
    );
  }
  if (state.view === "chat" && state.chatWith) {
    return (
      <div className="flex h-full min-w-0 items-center">
        <SingleTab>
          <ActorAvatar id={state.chatWith} actor={state.actors[state.chatWith]} size={18} />
          <span className="truncate">{nameOf(state.actors, state.chatWith)}</span>
        </SingleTab>
      </div>
    );
  }
  if (state.view !== "space") return null;

  const coordActive = active === COORD_TAB;
  const fade = fadeLeft && fadeRight ? "both" : fadeLeft ? "left" : fadeRight ? "right" : "none";
  return (
    <div role="tablist" aria-label="Space 标签" className="flex h-full min-w-0 items-center gap-0.5">
      <div data-tab-id={COORD_TAB} data-active={coordActive} className={`${TAB_CLASS} ${coordActive ? TAB_ACTIVE_CLASS : TAB_IDLE_CLASS}`}>
        <button type="button" role="tab" aria-selected={coordActive} className={TAB_BODY_CLASS} onClick={() => selectTab(COORD_TAB)}>
          <SpaceAvatar space={space} size={18} />
          <span className="min-w-0 truncate font-semibold">{space.name}</span>
        </button>
      </div>
      <div ref={stripRef} className={`scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto ${FADE_CLASS[fade]}`}>
        {openMembers.map((m) => <ActorTab key={m.id} member={m} active={active === m.id} />)}
      </div>
      {over ? <SpaceTabMenu space={space} actors={state.actors} activeTab={active} visibleIds={visibleIds} /> : null}
    </div>
  );
}
