import { COORD_TAB, currentSpace, currentTab, findMember } from "../model/selectors";
import { useSpaceDemoState } from "../model/use-space-demo";
import { ActorThread } from "./ActorThread";
import { CoordinatorThread } from "./CoordinatorThread";
import { SpaceBlank } from "./SpaceBlank";
import { ThreadColumn } from "./ThreadColumn";
import { useStickToBottom } from "./use-stick-to-bottom";

/** Space 中栏内容：按当前标签渲染协调 Agent 对话、Actor 对话或空 Space，自带滚动和自动贴底。 */
export function SpaceThread() {
  const state = useSpaceDemoState();
  const space = currentSpace(state);
  const tab = currentTab(state);
  const member = tab === COORD_TAB ? undefined : findMember(space, tab);

  const last = space.msgs[space.msgs.length - 1];
  const lastKey = last ? `${last.k}:${"shown" in last ? last.shown : ""}:${"typing" in last ? last.typing : ""}:${"state" in last ? last.state : ""}` : "";
  const followKey = member
    ? `${member.transcript.length}:${member.status}:${member.denied ? 1 : 0}`
    : `${space.msgs.length}:${lastKey}`;
  const { ref, onScroll } = useStickToBottom(followKey, `${space.id}:${tab}`);

  const blank = !member && space.msgs.length === 0;
  return (
    <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto" data-space-thread={member ? "actor" : blank ? "blank" : "coord"}>
      {member ? (
        <ActorThread member={member} actor={state.actors[member.id]} />
      ) : blank ? (
        <SpaceBlank space={space} />
      ) : (
        <ThreadColumn><CoordinatorThread msgs={space.msgs} /></ThreadColumn>
      )}
    </div>
  );
}
