import { useEffect } from "react";
import { Search } from "lucide-react";
import { ActorAvatar } from "../avatar/ActorAvatar";
import { useSpaceDemoActions, useSpaceDemoState } from "../model/use-space-demo";
import { filterRoster, rosterActors } from "../model/selectors";
import type { RosterActor } from "../model/types";

const CARD_CLASS =
  "flex min-w-0 flex-col gap-2.5 rounded-act-lg border border-line bg-surface p-3.5 text-left transition-[border-color,transform,box-shadow] duration-(--motion-base) hover:-translate-y-px hover:border-line-strong hover:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const CHIP_CLASS = "inline-flex h-5 items-center whitespace-nowrap rounded-act-xs bg-surface-subtle px-[7px] text-act-xs text-text-muted";

// 原生 button：整张卡片是一个入口，里面有头像、两行场景和能力，Button 的单行文字样式装不下；type="button" 并带可见 focus 环。
function ActorCard({ actor, fresh, onOpen }: { actor: RosterActor; fresh: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`${CARD_CLASS} ${fresh ? "space-card-fresh" : ""}`} onClick={onOpen} data-actor-card={actor.id}>
      <span className="flex min-w-0 items-center gap-3">
        <ActorAvatar id={actor.id} actor={actor} size={56} />
        <span className="min-w-0">
          <span className="block truncate text-act-md font-semibold text-text-main">{actor.name}</span>
          <span className="line-clamp-2 text-act-xs leading-normal text-text-muted">{actor.scene}</span>
        </span>
      </span>
      {actor.abilities.length ? (
        <span className="flex flex-wrap gap-1.5">
          {actor.abilities.slice(0, 3).map((ability) => <span key={ability} className={CHIP_CLASS}>{ability}</span>)}
        </span>
      ) : null}
      <span className="mt-auto text-act-xs text-text-faint">{actor.last || "刚刚长成"} · 在 {actor.spaces || 1} 个 Space 里</span>
    </button>
  );
}

/** Actor 名册页：标题、搜索、卡片网格。点卡片进入一对一对话 */
export function ActorRoster() {
  const state = useSpaceDemoState();
  const actions = useSpaceDemoActions();
  const query = state.rosterQuery;
  const list = filterRoster(state.actors, query);
  const total = rosterActors(state.actors).length;

  // 新加入的卡片描边动画跑完（1.8s）后清掉标记
  useEffect(() => {
    if (!state.freshCard) return;
    const timer = window.setTimeout(actions.clearFreshCard, 1800);
    return () => window.clearTimeout(timer);
  }, [state.freshCard, actions]);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[var(--conversation-inline-padding)] pt-8 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-act-xl font-semibold text-text-main">Actor 名册</h1>
        <span className="rounded-act-pill bg-surface-subtle px-2 text-act-xs leading-5 text-text-muted tabular-nums">{total}</span>
        <label className="ml-auto flex h-8 w-60 max-w-full items-center gap-2 rounded-act-sm border border-line bg-surface px-2.5 text-text-faint focus-within:border-line-strong">
          <Search size={14} aria-hidden="true" />
          <input
            className="min-w-0 flex-1 bg-transparent text-act-sm text-text-main outline-none placeholder:text-text-faint"
            placeholder="找一个 Actor"
            aria-label="搜索 Actor"
            value={query}
            onChange={(event) => actions.setRosterQuery(event.target.value)}
          />
        </label>
      </div>
      <p className="mt-2 mb-5 text-act-sm text-text-muted">Actor 在场景中长成。在 Space 里留下一个新起的 Actor，它就会出现在这里。</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {list.map((actor) => (
          <ActorCard key={actor.id} actor={actor} fresh={state.freshCard === actor.id} onOpen={() => actions.openSoloChat(actor.id)} />
        ))}
      </div>
      {list.length === 0 ? <div className="py-10 text-center text-act-sm text-text-faint">没有找到「{query.trim()}」</div> : null}
    </div>
  );
}
