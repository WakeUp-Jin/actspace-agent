import { Check } from "lucide-react";
import { Button } from "../../ui/Button";
import type { CoordinatorMessage } from "../model/types";
import { useSpaceDemoActions } from "../model/use-space-demo";
import { ThreadDivider } from "./ActorBlocks";
import { KeepActorCard } from "./KeepActorCard";
import { StreamingText } from "./StreamingText";

function MemoryNote({ message }: { message: Extract<CoordinatorMessage, { k: "mem" }> }) {
  const { undoMemory } = useSpaceDemoActions();
  const gone = !!message.undone;
  return (
    <div className="flex items-start gap-2 rounded-act-md bg-surface-subtle py-1.5 pl-3 pr-1.5 text-act-sm text-text-muted">
      <Check size={14} className="mt-0.5 shrink-0 text-operational" aria-hidden="true" />
      <span className={`min-w-0 flex-1 pt-px [overflow-wrap:anywhere] ${gone ? "text-text-faint line-through" : ""}`}>
        记下了「<b className="font-medium text-text-main">{message.t}</b>」{gone ? " · 已撤销" : ""}
      </span>
      {gone ? null : <Button variant="ghost" size="xs" onClick={() => undoMemory(message.mid)}>撤销</Button>}
    </div>
  );
}

function CoordinatorMessageView({ message }: { message: CoordinatorMessage }) {
  switch (message.k) {
    case "div":
      return <ThreadDivider>{message.t}</ThreadDivider>;
    case "user":
      return (
        <div className="max-w-[88%] self-end rounded-act-lg rounded-br-act-xs border border-line bg-surface px-3.5 py-2 text-act-md leading-relaxed shadow-act-soft [overflow-wrap:anywhere]">
          {message.t}
        </div>
      );
    case "mem":
      return <MemoryNote message={message} />;
    case "keep":
      return <KeepActorCard aid={message.aid} state={message.state} />;
    case "coord":
      return (
        <p className="text-act-md leading-relaxed [overflow-wrap:anywhere]">
          <StreamingText text={message.t} plain={message.plain} typing={message.typing} shown={message.shown} />
        </p>
      );
  }
}

/** 协调 Agent 标签页：没有头部（D14），消息流不放发言者头像（D13）。 */
export function CoordinatorThread({ msgs }: { msgs: readonly CoordinatorMessage[] }) {
  return (
    <>
      {msgs.map((m, i) => <CoordinatorMessageView key={i} message={m} />)}
    </>
  );
}
