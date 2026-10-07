import { Folder, GitBranch, Brain } from "lucide-react";
import { ActorAvatar } from "../avatar/ActorAvatar";
import { STATUS_LABEL } from "../model/selectors";
import type { MemberStatus, RosterActor, SpaceMember } from "../model/types";
import { StatusDot } from "./StatusDot";

const CHIP_TONE: Record<MemberStatus, string> = {
  wait: "bg-warning-soft text-on-warning",
  fail: "bg-danger-soft text-on-danger",
  run: "bg-operational-soft text-operational",
  result: "bg-operational-soft text-operational",
  idle: "bg-surface-subtle text-text-muted",
};

/** Actor 标签页头部：头像、名字、状态胶囊、场景、能力、元信息（设计文档 §4.3）。 */
export function ActorHeader({ member, actor }: { member: SpaceMember; actor: RosterActor | undefined }) {
  const meta = "inline-flex items-center gap-1.5";
  return (
    <header className="flex items-start gap-3 border-b border-line px-5 py-3">
      <ActorAvatar id={member.id} actor={actor} size={40} working={member.status === "run"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-act-md font-semibold text-text-main">{actor?.name ?? member.id}</h1>
          <span className={`inline-flex h-[22px] items-center gap-1.5 rounded-act-pill px-2 text-act-xs font-medium ${CHIP_TONE[member.status]}`}>
            <StatusDot status={member.status} />
            {STATUS_LABEL[member.status]}
          </span>
        </div>
        {actor?.scene ? <p className="text-act-xs text-text-muted">{actor.scene}</p> : null}
        {actor?.abilities.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {actor.abilities.map((a) => (
              <li key={a} className="inline-flex h-5 items-center rounded-act-xs bg-surface-subtle px-[7px] text-act-xxs text-text-muted">{a}</li>
            ))}
          </ul>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-act-xs text-text-faint">
          <span className={meta}><Folder size={12} aria-hidden="true" /><b className="font-medium text-text-muted">{member.dir}</b></span>
          {member.tree ? (
            <span className={meta}><GitBranch size={12} aria-hidden="true" />工作树 <b className="font-medium text-text-muted">{member.tree}</b></span>
          ) : null}
          {actor?.nascent ? (
            <span className={meta}>归属 <b className="font-medium text-text-muted">Space</b></span>
          ) : (
            <span className={meta}><Brain size={12} aria-hidden="true" />自己的记忆 <b className="font-medium text-text-muted">{actor?.memN ?? 0} 条</b></span>
          )}
        </p>
      </div>
    </header>
  );
}
