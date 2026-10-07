import { ActorAvatar, SpaceAvatar } from "../avatar/ActorAvatar";
import { nameOf } from "../model/selectors";
import type { Space } from "../model/types";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../model/use-space-demo";

const CREW_CLASS =
  "flex flex-col items-center gap-1.5 rounded-act-md p-1 text-act-xs text-text-muted transition-colors duration-(--motion-fast) hover:text-text-main focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";

/** 空 Space：星空背景 + Space 头像、目标、可点的成员头像。 */
export function SpaceBlank({ space }: { space: Space }) {
  const actors = useSpaceDemoSelector((s) => s.actors);
  const { openActorTab } = useSpaceDemoActions();
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden">
      <div className="space-sky" aria-hidden="true">
        <div className="space-sky-stars" />
        <div className="space-sky-grid" />
      </div>
      <div className="relative z-1 flex flex-col items-center gap-[18px] px-6 py-12 text-center">
        <SpaceAvatar space={space} size={56} className="space-pop" />
        <div>
          <h2 className="text-act-lg font-semibold text-text-main">{space.name}</h2>
          <p className="mt-1 max-w-[46ch] text-act-sm text-text-muted">为「{space.goal || "一个还没写下的目标"}」而设</p>
        </div>
        <ul className="flex flex-wrap justify-center gap-[18px]">
          {space.members.map((m, i) => (
            <li key={m.id}>
              <button type="button" className={CREW_CLASS} onClick={() => openActorTab(m.id)}>
                <span className="space-float inline-flex" style={{ animationDelay: `${-i * 1.4}s` }}>
                  <ActorAvatar id={m.id} actor={actors[m.id]} size={40} />
                </span>
                {nameOf(actors, m.id)}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-act-xs text-text-faint">说说要做什么，协调 Agent 会交给合适的 Actor。</p>
      </div>
    </div>
  );
}
