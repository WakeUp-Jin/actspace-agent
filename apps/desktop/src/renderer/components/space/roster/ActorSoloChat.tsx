import { ActorAvatar } from "../avatar/ActorAvatar";
import { useSpaceDemoState } from "../model/use-space-demo";
import type { SoloMessage } from "../model/types";

const COLUMN_CLASS =
  "mx-auto flex w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] min-w-0 flex-col gap-5 pb-6";
const CHIP_CLASS = "inline-flex h-5 items-center whitespace-nowrap rounded-act-xs bg-surface-subtle px-[7px] text-act-xs text-text-muted";

function SoloBubble({ message }: { message: SoloMessage }) {
  if (message.k === "user") {
    return (
      <div className="max-w-[88%] self-end [overflow-wrap:anywhere] rounded-act-lg border border-line bg-surface px-3.5 py-2 text-act-md leading-relaxed text-text-main shadow-soft">
        {message.t}
      </div>
    );
  }
  const streaming = message.shown != null;
  return (
    <div className="text-act-md leading-relaxed text-text-main">
      {message.typing ? (
        <span className="space-typing" role="status" aria-label="正在输入"><i /><i /><i /></span>
      ) : (
        <p className="m-0 break-words">
          {streaming ? message.plain.slice(0, message.shown ?? 0) : message.t}
          {streaming ? <span className="space-caret" aria-hidden="true" /> : null}
        </p>
      )}
    </div>
  );
}

/** 和名册里某个 Actor 的一对一对话：顶部自我介绍 + 对话流。输入区由 SpaceDock 提供 */
export function ActorSoloChat() {
  const state = useSpaceDemoState();
  const id = state.chatWith;
  const actor = id ? state.actors[id] : undefined;
  if (!id || !actor) return null;
  const messages = state.chats[id] ?? [];
  return (
    <div className={COLUMN_CLASS}>
      <div className="flex flex-col items-center gap-2 pt-7 pb-3 text-center">
        <ActorAvatar id={id} actor={actor} size={56} />
        <h2 className="m-0 mt-1.5 text-act-lg font-semibold text-text-main">{actor.name}</h2>
        <p className="m-0 max-w-[40ch] text-act-sm text-text-muted">{actor.scene}</p>
        {actor.abilities.length ? (
          <div className="flex flex-wrap justify-center gap-1.5">
            {actor.abilities.map((ability) => <span key={ability} className={CHIP_CLASS}>{ability}</span>)}
          </div>
        ) : null}
      </div>
      {messages.map((message, index) => <SoloBubble key={index} message={message} />)}
    </div>
  );
}
