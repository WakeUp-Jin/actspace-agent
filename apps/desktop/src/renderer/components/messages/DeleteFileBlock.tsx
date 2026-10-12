import type { MessageBlock } from "@actspace/shared";
import { ApprovalActions, ApprovalCard, ApprovalPath, ApprovalReason, useApprovalDecision } from "./ApprovalParts";
import { ToolLogLine } from "./ToolLogLine";

type DeleteMessage = Extract<MessageBlock, { kind: "delete" }>;

export function DeleteFileBlock({ message, className }: { message: DeleteMessage; className?: string }) {
  const decision = useApprovalDecision(message.approvalRequestId);

  if (decision.resolved) {
    const denied = decision.resolved === "deny";
    return (
      <ToolLogLine
        message={{
          ...message,
          status: denied ? "denied" : "running",
          displayText: denied ? `Denied delete ${message.filePath}` : `Delete ${message.filePath}`,
          isError: denied,
          approvalRequestId: undefined,
        }}
      />
    );
  }

  return (
    <ApprovalCard
      className={className}
      verb="删除"
      target={<ApprovalPath path={message.filePath} />}
      meta={<ApprovalReason reason={message.reason} />}
      actions={<ApprovalActions state={decision} primaryLabel="删除" primaryVariant="danger" />}
    />
  );
}
