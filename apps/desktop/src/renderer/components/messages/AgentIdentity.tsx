import { useState } from "react";
import { Check, CircleAlert, Loader2, Square } from "lucide-react";
import { resolveModelSpecByApiModel, subagentListStatusLabel, type MessageBlock, type SubagentListStatus } from "@actspace/shared";
import companion1 from "../../assets/subagents/companion-1.webp";
import companion2 from "../../assets/subagents/companion-2.webp";
import companion3 from "../../assets/subagents/companion-3.webp";
import companion4 from "../../assets/subagents/companion-4.webp";
import companion5 from "../../assets/subagents/companion-5.webp";
import companion6 from "../../assets/subagents/companion-6.webp";
import companion7 from "../../assets/subagents/companion-7.webp";
import companion8 from "../../assets/subagents/companion-8.webp";
import companion9 from "../../assets/subagents/companion-9.webp";
import "./agent-activity.css";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;
const companions = [companion1, companion2, companion3, companion4, companion5, companion6, companion7, companion8, companion9];

/** 对话卡片和右侧面板用同一个身份：子智能体 id（老会话是子会话 id），分页、刷新都不变。 */
export function agentIdentity(message: AgentMessage): string { return message.transcriptRef?.runId ?? message.id; }

export function agentAvatarSource(identity: string): string {
  // Avoid render-order allocation: paginated history must not change identities.
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  }
  return companions[(hash >>> 0) % companions.length];
}

/** 子 Agent 用的模型：模型表里能找到就用显示名，否则原样显示请求里的模型 id。 */
export function agentModelLabel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  return resolveModelSpecByApiModel(model)?.label ?? model;
}

const avatarSizeClass = { 18: "h-[18px] w-[18px] rounded-act-xs", 20: "h-5 w-5 rounded-act-xs", 28: "h-7 w-7 rounded-act-md", 32: "h-8 w-8 rounded-act-md" } as const;

export function AgentAvatar({ identity, size = 32 }: { identity: string; size?: 18 | 20 | 28 | 32 }) {
  return <img src={agentAvatarSource(identity)} alt="" aria-hidden="true" draggable={false} width={size} height={size}
    className={`shrink-0 bg-surface-subtle object-cover ${avatarSizeClass[size]}`} />;
}

const labels: Record<AgentMessage["status"], string> = { running: "运行中", completed: "已完成", failed: "失败", aborted: "已停止" };

export function agentStatusLabel(status: AgentMessage["status"]): string { return labels[status]; }

const spinClass = "animate-spin text-operational motion-reduce:animate-none";

/** 只有图标的状态：运行中转圈（绿色），其余跟随外层文字颜色。 */
export function AgentStatusIcon({ status, size = 13 }: { status: AgentMessage["status"]; size?: number }) {
  const Icon = status === "running" ? Loader2 : status === "completed" ? Check : status === "failed" ? CircleAlert : Square;
  return <Icon size={size} aria-hidden="true" className={`shrink-0 ${status === "running" ? spinClass : ""}`} />;
}

/** 对话卡片标题行右端的状态：固定宽度，状态切换时描述不跳。 */
export function AgentStatus({ status }: { status: AgentMessage["status"] }) {
  return <span className={`inline-flex w-[68px] shrink-0 items-center gap-1.5 whitespace-nowrap text-act-xs leading-[1.4] ${status === "failed" ? "text-danger" : "text-text-muted"}`}>
    <AgentStatusIcon status={status} />
    {labels[status]}
  </span>;
}

/** 右侧面板的状态：只写文字（可带耗时），不配图标；运行中文字为绿色。 */
export function SubagentStatus({ status, duration }: { status: SubagentListStatus; duration?: string }) {
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap tabular-nums ${status === "running" ? "text-operational" : status === "failed" ? "text-on-danger" : ""}`}>
    {subagentListStatusLabel(status)}{duration ? ` · ${duration}` : ""}
  </span>;
}

/**
 * 一行会变的文字（右侧列表运行中那一行的第二行）：`animate` 时换内容旧的上滑淡出、新的从下滑入，
 * 不等计时器，每次变化立刻显示；不动画时直接替换（结束后的结论）。
 */
export function ActivityLine({ text, animate, className }: { text: string; animate: boolean; className?: string }) {
  const [frame, setFrame] = useState({ text, previous: "", revision: 0 });
  if (frame.text !== text) setFrame({ text, previous: animate ? frame.text : "", revision: frame.revision + 1 });
  if (!animate) return <span className={`truncate ${className ?? ""}`}>{text}</span>;
  return <span className={`agent-activity-transition ${className ?? ""}`} title={frame.text}>
    {frame.previous ? <span key={`old-${frame.revision}`} className="agent-activity-out" aria-hidden="true">{frame.previous}</span> : null}
    <span key={frame.revision} className={frame.previous ? "agent-activity-in" : undefined}>{frame.text}</span>
  </span>;
}

/** 子 Agent 耗时：38s / 1m 12s / 1h 05m。 */
export function formatAgentDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
