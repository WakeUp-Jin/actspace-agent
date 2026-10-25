import type { ApprovalRequest } from "@actspace/shared/runtime-v2";
import { Check, FilePen, FileX, TerminalSquare, Wrench } from "lucide-react";
import { commandPrefixGrant } from "../../sessions/grant";
import { useApprovalDecision, type DecisionKind } from "../../sessions/use-approval-decision";
import { useApprovalCommand } from "../../sessions/use-approval-command";
import { PillButton } from "../../ui/PillButton";
import { cx } from "../../ui/cx";

type Kind = "command" | "write" | "delete" | "read" | "tool";
export type ApprovalView = { readonly kind: Kind; readonly title: string; readonly target: string; readonly detail: string; readonly destructive: boolean; readonly cwd: string | null };

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export function describeApproval(request: ApprovalRequest, command?: string): ApprovalView {
  const file = request.resources.find(resource => resource.kind === "file");
  const proc = request.resources.find(resource => resource.kind === "process");
  if (proc) {
    const detail = command ?? "";
    return { kind: "command", title: "运行命令", target: detail.trim().split(/\s+/)[0] ?? "", detail, destructive: false, cwd: proc.cwd || null };
  }
  if (file) {
    const kind = file.access === "delete" ? "delete" : file.access === "write" ? "write" : "read";
    const title = kind === "delete" ? "删除文件" : kind === "write" ? "写入文件" : "读取文件";
    return { kind, title, target: baseName(file.path), detail: file.path, destructive: kind === "delete", cwd: null };
  }
  const reason = request.reasons[0] ? String((request.reasons[0] as { message?: string }).message ?? "") : "";
  return { kind: "tool", title: request.toolName, target: "", detail: reason, destructive: false, cwd: null };
}

const ICONS = { command: TerminalSquare, write: FilePen, delete: FileX, read: FilePen, tool: Wrench } as const;

/**
 * 审批卡（桌面端样式）：上方「等待确认」，卡头动作 + 目标，命令块，底栏环境信息与 [拒绝][本会话允许 前缀][运行]。
 * 提交中转圈；成功后选中项打勾、其余变淡；失败恢复并在卡下显示原因。
 */
export function ApprovalCard({ request, command, sandboxed, onDecided, onStale }: { readonly request: ApprovalRequest; readonly command?: string; readonly sandboxed?: boolean; readonly onDecided?: (kind: DecisionKind) => void; readonly onStale?: () => Promise<void> }) {
  const { state, decide } = useApprovalDecision(request.sessionId, request.requestId, onDecided, onStale);
  const detail = useApprovalCommand(request, command);
  const view = describeApproval(request, detail.command);
  const grant = view.kind === "command" ? commandPrefixGrant(request.grantSuggestions) : null;
  const locked = state.status !== "idle";
  const Icon = ICONS[view.kind];
  const props = (kind: DecisionKind) => ({
    disabled: locked || (kind !== "deny" && detail.missing),
    busy: state.status === "pending" && state.picked === kind,
    icon: state.status === "done" && state.picked === kind ? <Check size={13} strokeWidth={2.6} aria-hidden /> : undefined,
    className: cx(state.status === "done" && state.picked !== kind && "opacity-45"),
  });
  const meta = [sandboxed === true ? "沙盒" : sandboxed === false ? "真实环境" : "", view.cwd ? baseName(view.cwd) : ""].filter(Boolean).join(" · ");
  return (
    <section aria-label="等待审批" className="anim-rise">
      <div className="mb-1.5 flex items-center gap-1.5 text-act-sm font-medium text-warning">
        <span aria-hidden className={cx("size-1.5 rounded-full bg-warning", state.status === "idle" && "pulse-dot")} />{state.status === "done" ? "已提交" : "等待确认"}
      </div>
      <div className="approval">
        <div className="approval-head">
          <Icon size={15} aria-hidden />
          <span className="flex-none font-medium text-text-main">{view.title}</span>
          {view.target ? <span className="min-w-0 truncate text-text-faint">{view.target}</span> : null}
        </div>
        {view.detail ? <pre>{view.kind === "command" ? <span className="prompt">$ </span> : null}{view.detail}</pre> : detail.missing ? <div role="status" className="p-3 text-act-sm text-text-muted">{detail.error ?? "正在恢复命令详情…"}<PillButton tone="ghost" onClick={detail.retry}>重试详情</PillButton></div> : null}
        <div className="approval-foot">
          <span className="min-w-0 flex-1 truncate text-act-xs text-text-faint" title={view.cwd ?? undefined}>{meta}</span>
          <PillButton tone="ghost" {...props("deny")} onClick={() => void decide("deny")}>拒绝</PillButton>
          {grant ? <PillButton tone="tonal" title={`本会话内自动允许以 ${grant.prefix} 开头的命令`} {...props("session")} onClick={() => void decide("session", grant.suggestion.suggestionId)}>本会话允许 <code className="tool-mono">{grant.prefix}</code></PillButton> : null}
          <PillButton tone={view.destructive ? "danger" : "accent"} {...props("once")} onClick={() => void decide("once")}>{view.destructive ? "删除" : view.kind === "command" ? "运行" : "允许"}</PillButton>
        </div>
      </div>
      {state.error ? <p role="alert" className="m-0 mt-2 text-act-sm text-danger">{state.error}</p> : null}
    </section>
  );
}
