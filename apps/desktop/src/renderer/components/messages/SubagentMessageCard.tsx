import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { agentMessageBody, type MessageBlock } from "@actspace/shared";
import { AgentAvatar, AgentStatus } from "./AgentIdentity";
import { MarkdownProse } from "./MarkdownProse";
import { observeOverflow } from "./overflow-observer";
import { useSubagentStatus } from "./subagent-status-context";
import { Button } from "../ui/Button";

type BackgroundNoticeMessage = Extract<MessageBlock, { kind: "background_notice" }>;

// 来信卡片（front-子Agent与后台任务规范 §2.1）：头部与单行派发卡片一样，正文直接显示，超过 6 行折叠。
const BLOCK_CLASS =
  "message-row subagent-message max-w-[var(--conversation-block-max-width)] px-[var(--conversation-text-inset)] animate-[rise-in_220ms_ease_both] motion-reduce:animate-none";
const CARD_CLASS = "overflow-hidden rounded-act-md border border-line bg-surface";
const HEADER_CLASS =
  "group/message flex h-8 w-full min-w-0 items-center gap-2 bg-surface-subtle pr-2.5 pl-[7px] text-left transition-colors duration-(--motion-base) ease-in-out hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--act-color-focus-ring)]";
const NAME_CLASS =
  "min-w-0 flex-1 truncate text-act-md leading-snug text-text-muted group-hover/message:text-text-main group-focus-visible/message:text-text-main";
const TAG_CLASS = "shrink-0 text-act-xs leading-snug text-info";
// 正文左边与头部标题对齐：7px 内边距 + 20px 头像 + 8px 间距。
const BODY_CLASS = "border-t border-line pt-[7px] pr-3 pb-2 pl-[35px] text-act-md leading-relaxed text-text-main";
// 6 行（行高 1.65）。
const COLLAPSED_CLASS = "max-h-[9.9em] overflow-hidden";

/** 子智能体发来的消息；`taskId` 是发送方的子智能体 id。 */
export const SubagentMessageCard = memo(function SubagentMessageCard({
  message,
  onOpenSubagent,
}: {
  message: BackgroundNoticeMessage;
  onOpenSubagent?: (agentId: string) => void;
}) {
  const status = useSubagentStatus(message.taskId);
  const body = agentMessageBody(message.content);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const measure = useCallback(() => {
    const element = bodyRef.current;
    if (element) setOverflowing(element.scrollHeight > element.clientHeight + 1);
  }, []);
  useLayoutEffect(() => {
    if (expanded) return undefined;
    measure();
    const element = bodyRef.current;
    return element ? observeOverflow(element, measure) : undefined;
  }, [body, expanded, measure]);
  return (
    <article className={BLOCK_CLASS}>
      <div className={CARD_CLASS}>
        {/* 整条头部是卡片式按钮（与 AgentRunBlock 一样），Button 的尺寸和填充不适用。 */}
        <button
          className={HEADER_CLASS}
          type="button"
          aria-label={`打开子智能体 ${message.title}`}
          title={message.title}
          onClick={() => onOpenSubagent?.(message.taskId)}
        >
          <AgentAvatar identity={message.taskId} size={20} />
          <span className={NAME_CLASS}>{message.title}</span>
          <span className={TAG_CLASS}>来信</span>
          {status ? <AgentStatus status={status} /> : null}
        </button>
        <div className={BODY_CLASS}>
          <div ref={bodyRef} className={expanded ? undefined : COLLAPSED_CLASS}>
            <MarkdownProse content={body} writing={false} />
          </div>
          {overflowing || expanded ? (
            <Button
              size="xs"
              variant="ghost"
              className="mt-1 -ml-[9px]"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "收起" : "展开"}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
});
