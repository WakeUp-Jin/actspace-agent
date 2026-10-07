import type { RosterActor, SpaceMember } from "../model/types";
import { ActorBlockView } from "./ActorBlocks";
import { ActorHeader } from "./ActorHeader";
import { ThreadColumn } from "./ThreadColumn";

/** Actor 标签页：头部 + 对话。头部在滚动区里，随对话一起滚。 */
export function ActorThread({ member, actor }: { member: SpaceMember; actor: RosterActor | undefined }) {
  const name = actor?.name ?? member.id;
  return (
    <>
      <ActorHeader member={member} actor={actor} />
      <ThreadColumn>
        {member.transcript.length ? (
          member.transcript.map((b, i) => <ActorBlockView key={i} block={b} member={member} />)
        ) : (
          <p className="py-7 text-center text-act-sm text-text-faint">在这个 Space 里还没有交给 {name} 的事。</p>
        )}
      </ThreadColumn>
    </>
  );
}
