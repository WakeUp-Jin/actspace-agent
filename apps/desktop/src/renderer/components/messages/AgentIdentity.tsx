import { Check, CircleAlert, Loader2, Pause, Square } from "lucide-react";
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

export function AgentAvatar({ identity, size = 32 }: { identity: string; size?: 28 | 32 }) {
  return <img src={agentAvatarSource(identity)} alt="" aria-hidden="true" draggable={false} width={size} height={size}
    className={`shrink-0 rounded-act-md bg-surface-subtle object-cover ${size === 28 ? "h-7 w-7" : "h-8 w-8"}`} />;
}

const labels: Record<AgentMessage["status"], string> = { running: "运行中", completed: "已完成", failed: "失败", aborted: "已停止" };

export function AgentStatus({ status }: { status: AgentMessage["status"] }) {
  const Icon = status === "running" ? Loader2 : status === "completed" ? Check : status === "failed" ? CircleAlert : Square;
  return <StatusLine icon={Icon} spinning={status === "running"} danger={status === "failed"} label={labels[status]} fixedWidth />;
}

/** 右侧面板列表的状态：运行中、空闲（可续派）、已中断、失败、已结束。 */
export function SubagentStatus({ status }: { status: SubagentListStatus }) {
  const Icon = status === "running" ? Loader2 : status === "idle" ? Pause : status === "failed" ? CircleAlert : status === "interrupted" ? Square : Check;
  return <StatusLine icon={Icon} spinning={status === "running"} danger={status === "failed"} label={subagentListStatusLabel(status)} />;
}

/** `fixedWidth`：卡片标题行右端的状态固定宽度，状态切换时描述不跳；面板列表里状态在行内，按文字宽度。 */
function StatusLine({ icon: Icon, spinning, danger, label, fixedWidth = false }: { icon: typeof Check; spinning: boolean; danger: boolean; label: string; fixedWidth?: boolean }) {
  return <span className={`inline-flex ${fixedWidth ? "w-[68px] " : ""}shrink-0 items-center gap-1.5 whitespace-nowrap text-act-xs leading-[1.4] ${danger ? "text-danger" : "text-text-muted"}`}>
    <Icon size={13} aria-hidden="true" className={spinning ? "animate-spin text-operational motion-reduce:animate-none" : ""} />
    {label}
  </span>;
}
