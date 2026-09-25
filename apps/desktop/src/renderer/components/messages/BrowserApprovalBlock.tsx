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
          content: denied ? "本轮浏览器授权已拒绝" : "正在连接浏览器…",
          isError: denied,
          approvalRequestId: undefined,
        }}
      />
    );
  }

  // 浏览器授权本身就是会话级：主按钮一次允许即覆盖本会话，拒绝只对这一轮有效。
  return (
    <ApprovalCard
      className={className}
      icon={<Globe2 size={14} strokeWidth={2} />}
      verb="使用浏览器"
      target={<span className="flex-none text-text-main">Chrome</span>}
      meta={<ApprovalChip tone="info">整个会话</ApprovalChip>}
      actions={<ApprovalActions state={decision} primaryLabel="本会话允许" size="card" />}
    >
      <p className="m-0 text-[13px] leading-[1.6] text-text-muted">
        Agent 将可以查看并操作你的 Chrome 标签页：打开网页、点击、输入、截图、读取页面内容。
      </p>
    </ApprovalCard>
  );
}
