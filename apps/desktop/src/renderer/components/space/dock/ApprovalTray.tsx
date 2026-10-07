import { ChevronLeft, ChevronRight } from "lucide-react";
import { ActorAvatar } from "../avatar/ActorAvatar";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { useSpaceDemoActions, useSpaceDemoState } from "../model/use-space-demo";
import { currentSpace, currentTab, nameOf, trayList } from "../model/selectors";
import type { RosterActor, SpaceDemoActions, SpaceMember } from "../model/types";

// 审批托盘：输入区上方的一张琥珀色卡片，一次处理一个。正在看的 Actor 的审批已经在眼前，不进托盘。
const TRAY_CLASS =
  "mx-auto flex w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] items-center gap-2.5 rounded-act-lg border border-warning/25 bg-warning-soft py-2.5 pr-3 pl-3 max-[600px]:w-[calc(100%_-_36px)]";

export function ApprovalTray() {
  const state = useSpaceDemoState();
  const actions = useSpaceDemoActions();
  const list = state.view === "space" ? trayList(currentSpace(state), currentTab(state)) : [];
  const open = state.trayOpen && list.length > 0;
  return (
    <div aria-live="polite" className="empty:hidden">
      {open ? <TrayCard list={list} index={Math.min(state.trayIdx, list.length - 1)} actors={state.actors} actions={actions} /> : null}
    </div>
  );
}

function TrayCard({ list, index, actors, actions }: {
  list: SpaceMember[];
  index: number;
  actors: Record<string, RosterActor>;
  actions: SpaceDemoActions;
}) {
  const member = list[index];
  const name = nameOf(actors, member.id);
  return (
    <div className={TRAY_CLASS} role="group" aria-label="待你决定的命令">
      <ActorAvatar id={member.id} actor={actors[member.id]} size={22} />
      <div className="min-w-0 flex-1">
        <div className="text-act-sm font-medium text-text-main">{name}想运行一条命令</div>
        <div className="truncate font-mono text-act-xs text-text-muted" title={member.approval?.cmd}>{member.approval?.cmd}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {list.length > 1 ? (
          <>
            <IconButton label="上一个" size="xs" onClick={actions.trayPrev}><ChevronLeft size={14} aria-hidden="true" /></IconButton>
            <span className="text-act-xs text-text-muted tabular-nums">{index + 1}/{list.length}</span>
            <IconButton label="下一个" size="xs" onClick={actions.trayNext}><ChevronRight size={14} aria-hidden="true" /></IconButton>
          </>
        ) : null}
        <Button variant="ghost" size="xs" onClick={() => actions.trayView(member.id)}>查看</Button>
        <Button variant="secondary" size="xs" onClick={() => actions.deny(member.id)}>拒绝</Button>
        <Button variant="primary" size="xs" onClick={() => actions.approve(member.id)}>运行</Button>
      </div>
    </div>
  );
}
