import type { RosterActor, Space } from "../model/types";
import { ballFor, companionFor, spaceImageFor } from "./avatar-assets";

/** 设计文档 §6 的头像尺寸档位。 */
export type SpaceAvatarSize = 16 | 18 | 22 | 40 | 56;

// 圆角取最接近边长 28% 的圆角 token；尺寸只有这几档，写成固定类免得拼动态类名。
const SIZE_CLASS: Record<SpaceAvatarSize, string> = {
  16: "h-4 w-4 rounded-act-xs",
  18: "h-[18px] w-[18px] rounded-act-xs",
  22: "h-[22px] w-[22px] rounded-act-sm",
  40: "h-10 w-10 rounded-act-lg",
  56: "h-14 w-14 rounded-act-xl",
};

const AVATAR_CLASS = "relative inline-flex shrink-0 bg-surface-subtle";
const IMAGE_CLASS = "h-full w-full object-cover [border-radius:inherit]";

/** 名册 Actor 用角色图，新起的 Actor 用小球；头像只回答「是谁」，不随状态换色。 */
export function actorImage(actor: RosterActor | undefined, id: string): string {
  if (!actor || actor.nascent || !actor.img) return ballFor(id);
  return companionFor(actor.img);
}

export function ActorAvatar({
  id,
  actor,
  size,
  working = false,
  className = "",
}: {
  id: string;
  actor: RosterActor | undefined;
  size: SpaceAvatarSize;
  /** 工作中：外圈转动的翡翠绿光环（space.css）。 */
  working?: boolean;
  className?: string;
}) {
  const ring = working ? `space-avatar-working ${size <= 18 ? "space-avatar-working-sm" : size >= 40 ? "space-avatar-working-lg" : ""}` : "";
  return (
    <span className={`${AVATAR_CLASS} ${SIZE_CLASS[size]} ${ring} ${className}`} data-actor-avatar={id} aria-hidden="true">
      <img className={IMAGE_CLASS} src={actorImage(actor, id)} alt="" draggable={false} />
    </span>
  );
}

export function SpaceAvatar({ space, size, className = "" }: { space: Pick<Space, "img">; size: SpaceAvatarSize; className?: string }) {
  return (
    <span className={`${AVATAR_CLASS} ${SIZE_CLASS[size]} ${className}`} aria-hidden="true">
      <img className={IMAGE_CLASS} src={spaceImageFor(space.img)} alt="" draggable={false} />
    </span>
  );
}
