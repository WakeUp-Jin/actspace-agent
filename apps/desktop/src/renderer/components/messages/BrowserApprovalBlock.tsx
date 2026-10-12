import type { MessageBlock } from "@actspace/shared";
import { ApprovalActions, ApprovalCard, useApprovalDecision } from "./ApprovalParts";
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
      verb="确认浏览器操作"
      target={<span className="min-w-0 truncate" title={message.title}>{message.title}</span>}
      note="只授权这一次。该动作可能更改 Chrome 标签页或网页内容，连接浏览器不会自动批准这类操作。"
      actions={<ApprovalActions state={decision} primaryLabel="允许这次" />}
    />
  );
}
