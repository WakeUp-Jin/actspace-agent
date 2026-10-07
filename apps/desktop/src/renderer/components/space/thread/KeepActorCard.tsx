import type { CSSProperties } from "react";
import { Button } from "../../ui/Button";
import { ballFor, companionFor } from "../avatar/avatar-assets";
import { nameOf } from "../model/selectors";
import type { KeepState } from "../model/types";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../model/use-space-demo";

const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  return { i, x: `${(Math.cos(angle) * 26).toFixed(1)}px`, y: `${(Math.sin(angle) * 26).toFixed(1)}px` };
});

const CARD_CLASS = "flex items-center gap-3 rounded-act-lg border border-line bg-surface p-3 shadow-act-soft";
const IMAGE_CLASS = "absolute inset-0 h-full w-full rounded-act-lg object-cover";

/** 协调 Agent 只问一次：要不要把这个新起的 Actor 留下（设计文档 §5.4）。 */
export function KeepActorCard({ aid, state }: { aid: string; state: KeepState }) {
  const actor = useSpaceDemoSelector((s) => s.actors[aid]);
  const name = useSpaceDemoSelector((s) => nameOf(s.actors, aid));
  const { keepActor, declineActor, goRoster } = useSpaceDemoActions();

  if (state === "declined") {
    return (
      <div className={`${CARD_CLASS} border-dashed bg-transparent shadow-none`}>
        <p className="flex-1 text-act-sm leading-relaxed text-text-faint">没有留下 {name}，它只留在这个 Space 里。</p>
      </div>
    );
  }

  const stage = state === "growing" ? "space-growing" : state === "kept" ? "space-kept" : "";
  return (
    <div className={CARD_CLASS} data-keep-state={state}>
      <div className={`space-grow ${stage} size-10 shrink-0`} aria-hidden="true">
        <img className={`space-grow-from ${IMAGE_CLASS}`} src={ballFor(aid)} alt="" draggable={false} />
        <img className={`space-grow-to ${IMAGE_CLASS}`} src={companionFor(actor?.growImg ?? actor?.img ?? 1)} alt="" draggable={false} />
        {SPARKS.map((s) => (
          <i key={s.i} className="space-spark" style={{ "--i": s.i, "--x": s.x, "--y": s.y } as CSSProperties} />
        ))}
      </div>
      {state === "kept" ? (
        <>
          <p className="min-w-0 flex-1 text-act-sm leading-relaxed text-text-main">
            留下了。<b className="font-semibold">{name}</b>现在在名册里，以后可以直接找它。
          </p>
          <Button variant="ghost" size="sm" onClick={goRoster}>去名册</Button>
        </>
      ) : (
        <>
          <div className="min-w-0 flex-1 text-act-sm leading-relaxed text-text-main">
            <b className="font-semibold">{name}</b> 这次做完了，要不要留下它？
            <small className="block text-act-xs text-text-faint">留下后它会进入名册，以后同类的事可以直接找它。</small>
          </div>
          {state === "ask" ? (
            <div className="flex shrink-0 gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => declineActor(aid)}>不用</Button>
              <Button variant="primary" size="sm" onClick={() => keepActor(aid)}>留下</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
