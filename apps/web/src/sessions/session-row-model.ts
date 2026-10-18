import type { ApprovalRequest, RuntimeV2SessionListItem } from "@actspace/shared/runtime-v2";
import type { HostWorkspace } from "../connection/connection-store";

// 列表行的纯函数模型（front-web-pwa客户端规范 §9.1）。
export type RowStatus = "approval" | "running" | "unread" | "idle";

export const UNTITLED = "新会话";

export function sessionTitle(item: Pick<RuntimeV2SessionListItem, "metadata">): string {
  return item.metadata.title?.trim() || UNTITLED;
}

/** 状态优先级：等待审批 > 运行中 > 未读 > 空闲。 */
export function rowStatus(input: { readonly approvals: number; readonly running: boolean; readonly unread: boolean }): RowStatus {
  return input.approvals > 0 ? "approval" : input.running ? "running" : input.unread ? "unread" : "idle";
}

const pad = (value: number) => String(value).padStart(2, "0");
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** 今天 HH:mm，近 7 天内周几，更早 M/D。 */
export function formatRowTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (days < 7) return WEEKDAYS[date.getDay()]!;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 按 workspaceRoot 匹配 Host 发布的工作区；匹配不到取路径最后一段。 */
export function workspaceOf(root: string | null, workspaces: readonly HostWorkspace[]): { readonly id: string; readonly name: string } {
  const trimmed = (root ?? "").replace(/[\\/]+$/, "");
  const match = workspaces.find(item => item.path.replace(/[\\/]+$/, "") === trimmed);
  if (match) return { id: match.id, name: match.name };
  const name = trimmed.split(/[\\/]/).pop() || "未知工作区";
  return { id: trimmed || name, name };
}

/** 审批的一行摘要：命令类显示工具名，文件类显示动作和路径。 */
export function approvalSummary(request: ApprovalRequest): string {
  const resource = request.resources[0];
  if (resource?.kind === "file") {
    const verb = resource.access === "read" ? "读取" : resource.access === "delete" ? "删除" : "修改";
    return `${verb} ${resource.path.split(/[\\/]/).slice(-2).join("/")}`;
  }
  if (resource?.kind === "process") return `${request.toolName} · ${resource.dynamic ? "动态命令" : "执行命令"}`;
  return request.toolName;
}

export type SplitSessions<T extends RuntimeV2SessionListItem> = { readonly active: readonly T[]; readonly archived: readonly T[] };

/** 按 archived 分组，各自按 updatedAt 倒序。 */
export function splitSessions<T extends RuntimeV2SessionListItem>(items: readonly T[]): SplitSessions<T> {
  const sorted = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { active: sorted.filter(item => !item.metadata.archived), archived: sorted.filter(item => item.metadata.archived) };
}

export type SessionGroup<T> = { readonly key: string; readonly label: string; readonly items: readonly T[] };

/** 时间分组标签：今天 / 昨天 / 近 7 天 / 本月更早 / 某月（跨年带年份）。 */
export function timeBucket(iso: string, now: Date = new Date()): { readonly key: string; readonly label: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { key: "older", label: "更早" };
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return { key: "today", label: "今天" };
  if (days === 1) return { key: "yesterday", label: "昨天" };
  if (days < 7) return { key: "week", label: "近 7 天" };
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return { key: "month", label: "本月更早" };
  const month = `${date.getMonth() + 1} 月`;
  return { key: `m${date.getFullYear()}-${date.getMonth()}`, label: date.getFullYear() === now.getFullYear() ? month : `${date.getFullYear()} 年 ${month}` };
}

/**
 * 首页分组：「需要处理」（等待审批、未读）置顶，其余按时间分组。输入已按 updatedAt 倒序，组内保持顺序。
 * @param attention - 判断一行是否进「需要处理」。
 */
export function groupSessions<T extends Pick<RuntimeV2SessionListItem, "updatedAt">>(items: readonly T[], attention: (item: T) => boolean, now: Date = new Date()): SessionGroup<T>[] {
  const hot = items.filter(attention);
  const groups: { key: string; label: string; items: T[] }[] = hot.length ? [{ key: "attention", label: "需要处理", items: hot }] : [];
  for (const item of items) {
    if (hot.includes(item)) continue;
    const bucket = timeBucket(item.updatedAt, now);
    const last = groups[groups.length - 1];
    if (last && last.key === bucket.key) last.items.push(item); else groups.push({ ...bucket, items: [item] });
  }
  return groups;
}

/** 状态行用的服务器名：域名取第一个标签（my-server.tail.ts.net → my-server），IP 和 localhost 原样。 */
export function hostDisplayName(url: string | undefined): string {
  if (!url) return "未连接";
  try {
    const { hostname } = new URL(url);
    return /^[\d.]+$/.test(hostname) || hostname.includes(":") ? hostname : hostname.split(".")[0] || hostname;
  } catch { return url; }
}
