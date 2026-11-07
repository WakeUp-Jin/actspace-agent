import { createContext, useContext, useState } from "react";
import { agentMessageBody, type MessageBlock } from "@actspace/shared";
import type { SubagentCardStatus } from "@actspace/client/sessions";
import { cx } from "../../../ui/cx";
import { AssistantText } from "./AssistantText";
import { Pressable } from "../../../ui/Pressable";

const NO_STATUSES: ReadonlyMap<string, SubagentCardStatus> = new Map();

/** 会话里每个子智能体的状态（子智能体 id → 派发卡片状态）；来信卡片按发送方取，跟着派发卡片一起变。 */
export const SubagentStatusContext = createContext<ReadonlyMap<string, SubagentCardStatus>>(NO_STATUSES);

const STATUS_TEXT: Record<SubagentCardStatus, string> = { running: "运行中", completed: "已完成", failed: "失败", aborted: "已停止" };

/**
 * 子智能体发来的消息（桌面端 front-子Agent与后台任务规范 §2.1 的 Web 版）：没有头像和右侧面板，
 * 头部是名字、蓝色「来信」、状态文字，正文按 Markdown 显示，超过 6 行折叠。
 */
export function SubagentLetter({ block }: { readonly block: Extract<MessageBlock, { kind: "background_notice" }> }) {
  const status = useContext(SubagentStatusContext).get(block.taskId);
  const body = agentMessageBody(block.content);
  const [open, setOpen] = useState(false);
  const long = body.split("\n").length > 6 || body.length > 360;
  return (
    <div className="subagent-letter anim-rise overflow-hidden rounded-act-md border border-line bg-surface">
      <div className="flex h-8 min-w-0 items-center gap-2 bg-surface-subtle px-3 text-act-sm">
        <span className="min-w-0 flex-1 truncate text-text-muted" title={block.title}>{block.title}</span>
        <span className="shrink-0 text-act-xs text-info">来信</span>
        {status ? <span className={cx("shrink-0 text-act-xs", status === "running" ? "text-operational" : status === "failed" ? "text-danger" : "text-text-faint")}>{STATUS_TEXT[status]}</span> : null}
      </div>
      <div className="border-t border-line px-3 pt-1.5 pb-2 text-act-md">
        <div className={cx(long && !open && "max-h-[9.9em] overflow-hidden")}><AssistantText content={body} /></div>
        {long ? <Pressable className="mt-1 w-auto rounded-act-xs text-act-xs text-text-muted" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "收起" : "展开"}</Pressable> : null}
      </div>
    </div>
  );
}
