import { Globe2 } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import { ApprovalActions, ApprovalCard, ApprovalChip, useApprovalDecision } from "./ApprovalParts";
import { ToolLogLine } from "./ToolLogLine";

type BrowserApprovalMessage = Extract<MessageBlock, { kind: "tool" }>;

export function BrowserApprovalBlock({
  message,
  className,
}: {
  message: BrowserApprovalMessage;
  className?: string;
}) {
  const decision = useApprovalDecision(message.approvalRequestId);

  if (decision.resolved) {
    const denied = decision.resolved === "deny";
    return (
      <ToolLogLine
        className={className}
        message={{
          ...message,
          status: denied ? "denied" : "running",
          content: denied ? "已拒绝这次浏览器操作" : "正在执行这次浏览器操作…",
          isError: denied,
          approvalRequestId: undefined,
        }}
      />
    );
  }

  return (
    <ApprovalCard
      className={className}
      icon={<Globe2 size={14} strokeWidth={2} />}
      verb="确认浏览器操作"
      target={<span className="min-w-0 truncate text-text-main" title={message.title}>{message.title}</span>}
      meta={<ApprovalChip tone="warning">仅这次</ApprovalChip>}
      actions={<ApprovalActions state={decision} primaryLabel="允许这次" size="card" />}
    >
      <p className="m-0 text-act-sm leading-[1.6] text-text-muted">
        该动作可能更改 Chrome 标签页或网页内容。连接浏览器不会自动批准这类操作。
      </p>
    </ApprovalCard>
  );
}
