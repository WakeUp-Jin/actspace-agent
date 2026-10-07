import { Fragment } from "react";
import { ActorAvatar } from "../avatar/ActorAvatar";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../model/use-space-demo";
import { nameOf, parseActorRefs } from "../model/selectors";

const REF_CLASS =
  "mx-px inline-flex h-[22px] items-center gap-1.5 rounded-act-sm bg-surface-subtle pl-[3px] pr-2 align-[-1px] text-act-sm leading-[22px] text-text-main transition-colors duration-(--motion-fast) hover:bg-hover-overlay focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";

/** 引用胶囊：16px 头像 + 名字，点了打开那个 Actor 的标签。 */
export function ActorRef({ id }: { id: string }) {
  const actor = useSpaceDemoSelector((s) => s.actors[id]);
  const name = useSpaceDemoSelector((s) => nameOf(s.actors, id));
  const { openActorTab } = useSpaceDemoActions();
  return (
    <button type="button" className={REF_CLASS} onClick={() => openActorTab(id)}>
      <ActorAvatar id={id} actor={actor} size={16} />
      {name}
    </button>
  );
}

/** 把带 [[id]] 的文字渲染成文字加引用胶囊。 */
export function ActorRefText({ text }: { text: string }) {
  const actors = useSpaceDemoSelector((s) => s.actors);
  return (
    <>
      {parseActorRefs(text, actors).map((seg, i) =>
        seg.type === "text" ? <Fragment key={i}>{seg.text}</Fragment> : <ActorRef key={i} id={seg.id} />,
      )}
    </>
  );
}
