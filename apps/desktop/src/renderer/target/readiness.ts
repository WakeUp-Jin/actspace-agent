import type { HostConnection } from "@actspace/shared/host-protocol";
import type { HostDescription, HostDirectorySnapshot } from "./host-directory";
import type { RunTarget } from "./run-target";

/**
 * 15 S5：能不能发送，以及不能时的原因（03 §2.3）。`ready` 当且仅当可以发送。
 * `host-unavailable`：Host 已连接，但自己报告 draining / blocked，不接受新任务（15 决策记录 2026-10-06）。
 */
export type RunTargetReadiness =
  | { readonly state: "ready" }
  | { readonly state: "connecting" }
  | { readonly state: "offline"; readonly error?: string }
  | { readonly state: "revoked" }
  | { readonly state: "incompatible" }
  | { readonly state: "removed" }
  | { readonly state: "describing" }
  | { readonly state: "describe-failed"; readonly error: string }
  | { readonly state: "host-unavailable"; readonly hostState: string }
  | { readonly state: "workspace-missing"; readonly workspaceId?: string }
  /** 本机目标还没有工作区（所有工作区都已从侧栏移除，或兜底目录没建成）。 */
  | { readonly state: "workspace-required" }
  | { readonly state: "model-missing" };

export type ReadinessInput = {
  readonly target: RunTarget;
  readonly directory: Pick<HostDirectorySnapshot, "loaded" | "hosts" | "descriptions" | "describeErrors">;
  readonly workspaceId?: string;
  readonly modelId?: string;
};

const READY: RunTargetReadiness = { state: "ready" };

export function resolveReadiness({ target, directory, workspaceId, modelId }: ReadinessInput): RunTargetReadiness {
  if (target.kind === "local") return target.workspaceRoot ? READY : { state: "workspace-required" };
  // 损坏的 key 连不到任何 Host；会话本身显示「会话标识损坏」，这里按已移除处理。
  if (target.kind === "invalid") return { state: "removed" };
  const host: HostConnection | undefined = directory.hosts.find((item) => item.hostId === target.hostId);
  if (!host) return directory.loaded ? { state: "removed" } : { state: "connecting" };
  switch (host.state) {
    case "connecting": return { state: "connecting" };
    case "offline": return host.error ? { state: "offline", error: host.error } : { state: "offline" };
    case "revoked": return { state: "revoked" };
    case "incompatible": return { state: "incompatible" };
    case "connected": break;
  }
  const describeError = directory.describeErrors[host.hostId];
  if (describeError !== undefined) return { state: "describe-failed", error: describeError };
  const description: HostDescription | undefined = directory.descriptions[host.hostId];
  if (!description) return { state: "describing" };
  if (description.state !== "ready") return { state: "host-unavailable", hostState: description.state };
  if (!workspaceId) return { state: "workspace-missing" };
  if (!description.workspaces.some((workspace) => workspace.id === workspaceId)) return { state: "workspace-missing", workspaceId };
  if (!modelId || !description.models.some((model) => model.id === modelId)) return { state: "model-missing" };
  return READY;
}

/** Host 本身连着（之后的状态只是还不能发新消息）。没连上时连停止也发不出去。 */
export function hostReachable(readiness: RunTargetReadiness): boolean {
  switch (readiness.state) {
    case "connecting": case "offline": case "revoked": case "incompatible": case "removed": return false;
    default: return true;
  }
}

export type ReadinessTone = "pending" | "offline" | "error";

export type ReadinessCopy = {
  /** 运行位置旁的状态点；null 时不显示。 */
  readonly tone: ReadinessTone | null;
  /** 运行位置旁的短文案；null 时不显示（06 §4.5 表中为「—」的两种）。 */
  readonly label: string | null;
  /** 发送按钮禁用时 tooltip 的原因。 */
  readonly reason: string;
};

const MAX_ERROR_SUMMARY = 80;

/** 只取第一行，去掉 Electron IPC 的前缀和错误类名，过长截断。 */
export function summarizeError(error: string): string {
  const firstLine = error.split("\n")[0]?.trim() ?? "";
  const stripped = firstLine.replace(/^Error invoking remote method '[^']*':\s*/, "").replace(/^(?:[A-Z][A-Za-z]*Error|Error):\s*/, "").trim();
  const text = stripped || firstLine || "未知错误";
  return text.length > MAX_ERROR_SUMMARY ? `${text.slice(0, MAX_ERROR_SUMMARY - 1)}…` : text;
}

/** 06 §4.5 的文案。`ready` 不需要文案，调用方不应传入。 */
export function describeReadiness(readiness: Exclude<RunTargetReadiness, { state: "ready" }>, hostName: string): ReadinessCopy {
  const host = hostName || "远端机器";
  switch (readiness.state) {
    case "connecting": return { tone: "pending", label: "连接中", reason: `正在连接 ${host}，草稿会保留` };
    case "offline": return { tone: "offline", label: "离线", reason: `${host} 离线。前往设置重新连接` };
    case "revoked": return { tone: "error", label: "需要重新配对", reason: `${host} 的授权已失效，需要重新配对` };
    case "incompatible": return { tone: "error", label: "版本不兼容", reason: `${host} 的 Agent 版本与当前应用不兼容` };
    case "removed": return { tone: "error", label: "已移除", reason: "这台机器已从列表移除" };
    case "describing": return { tone: "pending", label: "正在读取", reason: `正在读取 ${host} 的工作区和模型` };
    case "describe-failed": return { tone: "error", label: "读取失败", reason: `无法读取机器信息：${summarizeError(readiness.error)}` };
    case "host-unavailable": return { tone: "pending", label: "暂不接受任务", reason: readiness.hostState === "blocked" ? `${host} 恢复上次的任务时出错，暂不接受新任务` : `${host} 正在停止，暂不接受新任务` };
    case "workspace-missing": return { tone: null, label: null, reason: readiness.workspaceId ? `该工作区在 ${host} 上已不存在` : "选择一个远端工作区" };
    case "model-missing": return { tone: null, label: null, reason: "选择一个模型" };
    case "workspace-required": return { tone: null, label: null, reason: "请先选择工作区" };
  }
}
