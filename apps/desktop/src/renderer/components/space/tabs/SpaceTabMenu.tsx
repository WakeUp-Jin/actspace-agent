import { useState, type ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../../ui/Menu";
import { ActorAvatar, SpaceAvatar } from "../avatar/ActorAvatar";
import { COORD_TAB, nameOf } from "../model/selectors";
import type { RosterActor, Space } from "../model/types";
import { useSpaceDemoActions } from "../model/use-space-demo";
import { StatusDot } from "../thread/StatusDot";

const NO_DRAG = "[-webkit-app-region:no-drag]";

/**
 * 「全部标签」菜单：只在放不下时出现。顶部「关闭其他标签」，每行勾选标记 + 头像 + 名字 + 状态点，
 * 栏里已经看得到的灰一点，悬停出现 ×。
 */
export function SpaceTabMenu({
  space, actors, activeTab, visibleIds,
}: { space: Space; actors: Record<string, RosterActor>; activeTab: string; visibleIds: () => Set<string> }) {
  const { selectTab, closeTab, closeOtherTabs } = useSpaceDemoActions();
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const openTabs = space.openTabs.flatMap((id) => {
    const member = space.members.find((m) => m.id === id);
    return member ? [member] : [];
  });
  const others = openTabs.filter((m) => m.id !== activeTab);

  const row = (id: string, avatar: ReactNode, name: string, extra?: ReactNode) => (
    <MenuItem key={id} className={`group ${seen.has(id) || id === COORD_TAB ? "text-text-muted" : ""}`} onSelect={() => selectTab(id)} data-tab-menu-id={id}>
      <span className="grid h-3.5 w-3.5 shrink-0 place-items-center text-text-main">{activeTab === id ? <Check size={12} aria-hidden="true" /> : null}</span>
      {avatar}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {extra}
    </MenuItem>
  );

  return (
    <Menu onOpenChange={(open) => { if (open) setSeen(visibleIds()); }}>
      <MenuTrigger asChild>
        <IconButton label="全部标签" tooltip={false} size="xs" className={`ml-0.5 ${NO_DRAG}`}>
          <ChevronDown size={14} aria-hidden="true" />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" className="w-[260px]">
        {others.length ? (
          <>
            <MenuItem className="text-text-muted" onSelect={closeOtherTabs}>关闭其他标签</MenuItem>
            <MenuSeparator />
          </>
        ) : null}
        {row(COORD_TAB, <SpaceAvatar space={space} size={18} />, space.name)}
        {openTabs.map((m) =>
          row(
            m.id,
            <ActorAvatar id={m.id} actor={actors[m.id]} size={18} working={m.status === "run"} />,
            nameOf(actors, m.id),
            <>
              {m.status === "wait" || m.status === "fail" ? <StatusDot status={m.status} /> : null}
              <IconButton
                label={`关闭 ${nameOf(actors, m.id)}`} tooltip={false} size="xs"
                className="-mr-1 opacity-0 group-data-[highlighted]:opacity-100 focus-visible:opacity-100"
                onClick={(event) => { event.stopPropagation(); closeTab(m.id); }}
                onPointerUp={(event) => event.stopPropagation()}
              >
                <X size={12} aria-hidden="true" />
              </IconButton>
            </>,
          ),
        )}
      </MenuContent>
    </Menu>
  );
}
