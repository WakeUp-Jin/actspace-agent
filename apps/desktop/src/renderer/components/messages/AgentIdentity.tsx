import { Check, CircleAlert, Loader2, Square } from "lucide-react";
import { resolveModelSpecByApiModel, type MessageBlock } from "@actspace/shared";
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

/** 子 Agent 用的模型：模型表里能找到就用显示名，否则原样显示请求里的模型 id。 */
export function agentModelLabel(message: AgentMessage): string | undefined {
  if (!message.model) return undefined;
  return resolveModelSpecByApiModel(message.model)?.label ?? message.model;
}

const avatarSizeClass = { 18: "h-[18px] w-[18px] rounded-act-xs", 28: "h-7 w-7 rounded-act-md", 32: "h-8 w-8 rounded-act-md" } as const;

export function AgentAvatar({ message, size = 32 }: { message: AgentMessage; size?: 18 | 28 | 32 }) {
  return <img src={agentAvatarSource(message)} alt="" aria-hidden="true" draggable={false} width={size} height={size}
    className={`shrink-0 bg-surface-subtle object-cover ${avatarSizeClass[size]}`} />;
}

const labels: Record<AgentMessage["status"], string> = { running: "运行中", completed: "已完成", failed: "失败", aborted: "已停止" };

export function agentStatusLabel(status: AgentMessage["status"]): string { return labels[status]; }

/** 只有图标的状态：运行中转圈（绿色），其余跟随外层文字颜色。 */
export function AgentStatusIcon({ status, size = 13 }: { status: AgentMessage["status"]; size?: number }) {
  const Icon = status === "running" ? Loader2 : status === "completed" ? Check : status === "failed" ? CircleAlert : Square;
  return <Icon size={size} aria-hidden="true" className={`shrink-0 ${status === "running" ? "animate-spin text-operational motion-reduce:animate-none" : ""}`} />;
}

export function AgentStatus({ status }: { status: AgentMessage["status"] }) {
  return <span className={`inline-flex w-[68px] shrink-0 items-center gap-1.5 whitespace-nowrap text-act-xs leading-[1.4] ${status === "failed" ? "text-danger" : "text-text-muted"}`}>
    <AgentStatusIcon status={status} />
    {labels[status]}
  </span>;
}

function compactText(value: string | undefined): string | undefined {
  const compact = value?.replace(/\s+/g, " ").trim();
  return compact || undefined;
}

/** 子 Agent 现在在做什么（运行中）或结果第一行（结束后）；失败时是错误。对话卡片和右侧列表共用。 */
export function agentLatestActivity(message: AgentMessage): string {
  if (message.error) return compactText(message.error) ?? "执行失败";
  if (message.status === "running") {
    // Only event-derived labels may appear here, never streamed model output.
    const live = compactText(message.displayText);
    return live && /^(正在|达到|已停止|执行失败)/.test(live) ? live : "正在思考";
  }
  const summaryLine = message.summary?.split(/\r?\n/).find((line) => line.trim().length > 0);
  return compactText(summaryLine) ?? labels[message.status];
}

/** 子 Agent 耗时：38s / 1m 12s / 1h 05m。 */
export function formatAgentDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
