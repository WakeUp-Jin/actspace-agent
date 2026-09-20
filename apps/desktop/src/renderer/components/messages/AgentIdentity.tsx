import { Check, CircleAlert, Loader2, Square } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import companion1 from "../../assets/subagents/companion-1.webp";
import companion2 from "../../assets/subagents/companion-2.webp";
import companion3 from "../../assets/subagents/companion-3.webp";
import companion4 from "../../assets/subagents/companion-4.webp";
import companion5 from "../../assets/subagents/companion-5.webp";
import companion6 from "../../assets/subagents/companion-6.webp";
import companion7 from "../../assets/subagents/companion-7.webp";
import companion8 from "../../assets/subagents/companion-8.webp";
import companion9 from "../../assets/subagents/companion-9.webp";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;
const companions = [companion1, companion2, companion3, companion4, companion5, companion6, companion7, companion8, companion9];

export function agentAvatarSource(message: AgentMessage): string {
  // The child session ID survives live/history projection and panel navigation.
  // Avoid render-order allocation: paginated history must not change identities.
  const identity = message.transcriptRef?.runId ?? message.id;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  }
  return companions[(hash >>> 0) % companions.length];
}

export function AgentAvatar({ message, size = 32 }: { message: AgentMessage; size?: 28 | 32 }) {
  return <img src={agentAvatarSource(message)} alt="" aria-hidden="true" draggable={false} width={size} height={size}
    className={`shrink-0 rounded-[8px] bg-surface-subtle object-cover ${size === 28 ? "h-7 w-7" : "h-8 w-8"}`} />;
}

const labels: Record<AgentMessage["status"], string> = { running: "运行中", completed: "已完成", failed: "失败", aborted: "已停止" };

export function AgentStatus({ status }: { status: AgentMessage["status"] }) {
  const Icon = status === "running" ? Loader2 : status === "completed" ? Check : status === "failed" ? CircleAlert : Square;
  return <span className={`inline-flex w-[68px] shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] leading-[1.4] ${status === "failed" ? "text-danger" : "text-text-muted"}`}>
    <Icon size={13} aria-hidden="true" className={status === "running" ? "animate-spin text-operational motion-reduce:animate-none" : ""} />
    {labels[status]}
  </span>;
}
