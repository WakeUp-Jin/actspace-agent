import { subagentKindLabel, type MessageBlock } from "@actspace/shared";
import { AgentAvatar, AgentStatus, agentIdentity } from "./AgentIdentity";
import { BackgroundTag } from "./BashRunBlock";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;

// 单行派发卡片（front-子Agent与后台任务规范 §2.1）：此刻在做什么在右侧「子 Agent」列表第二行，模型在详情顶栏，卡片里都不写。
const BLOCK_CLASS = "message-row agent-run max-w-[var(--conversation-block-max-width)] px-[var(--conversation-text-inset)]";
const BUTTON_CLASS =
  "group/agent flex h-[34px] w-full min-w-0 items-center gap-2 rounded-act-md border border-line bg-surface-subtle pr-2.5 pl-[7px] text-left transition-[background-color,border-color,color,transform] duration-(--motion-base) ease-in-out hover:border-line-strong hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--act-color-focus-ring)] active:translate-y-px";
const NAME_CLASS = "min-w-0 flex-1 truncate text-act-sm leading-5 text-text-muted group-hover/agent:text-text-main group-focus-visible/agent:text-text-main";
const TYPE_CLASS = "shrink-0 text-act-xs leading-snug text-text-faint";

export function agentKindText(message: Pick<AgentMessage, "subagentKind" | "preset" | "agentKind">): string {
  return subagentKindLabel({ ...(message.subagentKind ? { subagentKind: message.subagentKind } : {}), ...(message.preset ? { preset: message.preset } : {}), ...(message.agentKind ? { agentKind: message.agentKind } : {}) });
}

export function AgentRunBlock({
  message,
  className,
  onOpen,
}: {
  message: AgentMessage;
  className?: string;
  /** 打开右侧「子 Agent」并选中它；还没有 `subagent/spawned`（没有子智能体 id）的卡片只打开列表。 */
  onOpen?: (agentId: string | undefined) => void;
}) {
  const kind = agentKindText(message);
  const name = message.description || kind;
  // 失败原因放在悬停里：卡片只有一行。
  const title = message.status === "failed" && message.error ? `${name}\n${message.error}` : name;
  return (
    <article className={`${BLOCK_CLASS}${className ? ` ${className}` : ""}`}>
      <button
        className={BUTTON_CLASS}
        type="button"
        aria-label={`Open SubAgent transcript for ${message.description}`}
        title={title}
        onClick={() => onOpen?.(message.transcriptRef?.runId)}
      >
        <AgentAvatar identity={agentIdentity(message)} size={20} />
        <span className={NAME_CLASS}>{name}</span>
        <span className={TYPE_CLASS}>{kind}</span>
        {message.background ? <BackgroundTag /> : null}
        <AgentStatus status={message.status} />
      </button>
    </article>
  );
}
