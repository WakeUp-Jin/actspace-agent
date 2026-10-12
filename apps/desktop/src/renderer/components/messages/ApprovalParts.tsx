import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import type { GrantSuggestion, RuntimeV2ApprovalDecisionInput } from "@actspace/shared/runtime-v2";
import { Button } from "../ui/Button";
import { approvalsApi } from "../../api/approvals";
import { useHostDirectory } from "../../target/host-directory";
import { useRunTargetContext } from "../../target/run-target-context";

// 工具审批的共享外壳：上方一行「等待确认」，下面是卡片（标题一句话 + 可选内容 + 底部按钮），可选的说明底托垫在卡片下方。
// 设计稿见 docs/design-docs/frontend/approval-card-redesign.html（D 方向，2026-10-11）。

export type ApprovalChoice = "once" | "session" | "deny";

const APPROVAL_FRAME_CLASS = "approval message-row w-full max-w-[var(--conversation-block-max-width)]";
const APPROVAL_STATUS_CLASS = "approval-status mb-2 px-[var(--conversation-text-inset)] text-act-md leading-[22px] text-text-faint";
const APPROVAL_TRAY_CLASS = "approval-tray rounded-act-lg bg-surface-subtle";
const APPROVAL_CARD_CLASS = "approval-card rounded-act-lg border border-line bg-surface shadow-act-xs";
const APPROVAL_CARD_HEAD_CLASS = "approval-card-head flex min-h-[30px] min-w-0 items-center gap-1.5 px-3 pt-2.5 text-act-md leading-5";
const APPROVAL_CARD_HEAD_DIVIDED_CLASS = "border-b border-line pb-2";
const APPROVAL_CARD_FOOTER_CLASS = "approval-card-footer flex min-h-10 items-center gap-1.5 py-2 pr-2 pl-3";
const APPROVAL_CARD_FOOTER_META_CLASS = "approval-card-meta mr-auto flex min-w-0 items-center gap-1.5 truncate text-act-sm leading-5 text-text-faint";
const APPROVAL_NOTE_CLASS = "approval-note px-3 pt-1.5 pb-2 text-act-sm leading-[1.5] text-text-faint";
const APPROVAL_ICON_CLASS = "grid size-4 flex-none place-items-center text-text-faint";
const APPROVAL_VERB_CLASS = "flex-none text-text-muted";
const APPROVAL_TARGET_CLASS = "approval-target flex min-w-0 items-center gap-1.5 text-text-faint";
const APPROVAL_ACTIONS_CLASS = "approval-actions ml-auto flex flex-none items-center gap-1.5 pl-2";

const OUTSIDE_WORKSPACE_REASON = "The requested file is outside the workspace.";
const SENSITIVE_FILE_REASON = "This file may contain credentials and requires one-time approval.";
// 不需要单独展示的审批提示：通用确认句由按钮表达；工作区外、敏感文件从路径和「没有本会话允许」就能看出来（D 方向不再做标签）。
const SILENT_APPROVAL_REASONS = new Set([
  OUTSIDE_WORKSPACE_REASON,
  SENSITIVE_FILE_REASON,
  "Allow Bash to run this command once?",
  "Allow this file to be deleted once?",
  "Bash command requires approval",
  "delete_file is a destructive file operation and requires approval.",
]);

/** 把 Runtime 以换行拼接的 reason 文本过滤成需要展示的说明；已知原因和通用确认句都不展示，未知原因原样保留。 */
export function getApprovalReasonNotes(reason?: string): string[] {
  return (reason ?? "").split("\n").map((item) => item.trim()).filter((line) => line && !SILENT_APPROVAL_REASONS.has(line));
}

export function splitApprovalPath(path: string): { dir: string; base: string } {
  const trimmed = path.length > 1 ? path.replace(/[\\/]+$/, "") : path;
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return index < 0 ? { dir: "", base: trimmed } : { dir: trimmed.slice(0, index + 1), base: trimmed.slice(index + 1) };
}

/** 目录过长时保留前两段和最后一段，中间折叠为 “…”；完整路径由 title 提供。 */
export function compactApprovalDir(dir: string): string {
  if (dir.length <= 32) return dir;
  const separator = dir.includes("/") ? "/" : "\\";
  const leading = dir.startsWith(separator) ? separator : "";
  const segments = dir.split(separator).filter(Boolean);
  if (segments.length <= 3) return dir;
  return `${leading}${segments.slice(0, 2).join(separator)}${separator}…${separator}${segments[segments.length - 1]}${separator}`;
}

export async function submitApprovalDecision(input: RuntimeV2ApprovalDecisionInput): Promise<boolean> {
  try {
    const result = await approvalsApi.submit(input);
    if (!result?.ok) {
      console.warn("Approval decision was not accepted", result?.reason);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to submit approval decision", error);
    return false;
  }
}

export type ApprovalDecisionState = {
  readonly submitting: ApprovalChoice | null;
  readonly resolved: ApprovalChoice | null;
  readonly disabled: boolean;
  readonly decide: (choice: ApprovalChoice, suggestionId?: string) => Promise<void>;
};

export function useApprovalDecision(requestId: string | undefined): ApprovalDecisionState {
  // 15 T11：审批块属于当前会话，远端审批所在的 Host 就是会话的运行目标，不再从 requestId 里拆。
  const { target } = useRunTargetContext();
  const remoteHost = requestId && target.kind === "remote" ? target.hostId : null;
  const remoteConnected = useHostDirectory((snapshot) => snapshot.hosts.some(host => host.hostId === remoteHost && host.state === "connected"));
  const unavailable = Boolean(remoteHost && !remoteConnected);
  const [submitting, setSubmitting] = useState<ApprovalChoice | null>(null);
  const [resolved, setResolved] = useState<ApprovalChoice | null>(null);
  const decide = async (choice: ApprovalChoice, suggestionId?: string) => {
    if (!requestId || submitting !== null || unavailable) return;
    if (choice === "session" && !suggestionId) return;
    setSubmitting(choice);
    const host = remoteHost ? { hostId: remoteHost } : {};
    const input: RuntimeV2ApprovalDecisionInput = choice === "session" && suggestionId
      ? { requestId, ...host, decision: "session", suggestionId }
      : { requestId, ...host, decision: choice === "deny" ? "deny" : "once" };
    if (await submitApprovalDecision(input)) setResolved(choice);
    else setSubmitting(null);
  };
  return { submitting, resolved, disabled: !requestId || submitting !== null || unavailable, decide };
}

// pick 必须是模块级常量，否则每次渲染都会重新取。
function useGrantSuggestion(requestId: string | undefined, pick: (suggestion: GrantSuggestion) => boolean): GrantSuggestion | undefined {
  const [result, setResult] = useState<{ requestId: string; suggestion?: GrantSuggestion }>();
  useEffect(() => {
    let active = true;
    if (!requestId) return;
    void approvalsApi.listPending().then((pending) => {
      const request = pending.find((item) => item.requestId === requestId);
      if (active) setResult({ requestId, suggestion: request?.grantSuggestions.find(pick) });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [requestId, pick]);
  return result?.requestId === requestId ? result?.suggestion : undefined;
}

const isExactSuggestion = (suggestion: GrantSuggestion) => suggestion.selector.kind === "exact";

/** 只取精确路径的会话授权建议；目录树授权由权限服务自行判断，不在审批卡上暴露。 */
export function useExactGrantSuggestion(requestId: string | undefined): GrantSuggestion | undefined {
  return useGrantSuggestion(requestId, isExactSuggestion);
}

/** Backend-owned command prefix; the renderer never derives authorization from command text. */
export function getCommandPrefixGrant(suggestion: GrantSuggestion): string | null {
  const selector = suggestion.selector;
  return selector.kind === "command_prefix" && selector.prefix.length > 0
    && selector.prefix.every(token => typeof token === "string" && token.length > 0)
    ? selector.prefix.join(" ") : null;
}

const isCommandPrefixSuggestion = (suggestion: GrantSuggestion) => getCommandPrefixGrant(suggestion) !== null;

export function useCommandPrefixGrantSuggestion(requestId: string | undefined): GrantSuggestion | undefined {
  return useGrantSuggestion(requestId, isCommandPrefixSuggestion);
}

/** 未知原因不丢：收在目标后的信息图标里，悬停看全文。 */
export function ApprovalReason({ reason }: { reason?: string }) {
  const notes = getApprovalReasonNotes(reason);
  if (notes.length === 0) return null;
  return (
    <span className="grid size-4 flex-none place-items-center text-text-faint" role="img" aria-label="审批原因" title={notes.join("\n")}>
      <Info size={13} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

export function ApprovalPath({ path }: { path: string }) {
  const { dir, base } = splitApprovalPath(path);
  return (
    <span className="approval-path flex min-w-0" title={path}>
      {/* 目录先收缩；文件名不参与收缩，只在整行都放不下时按容器宽度截断。 */}
      {dir ? <span className="min-w-0 truncate">{compactApprovalDir(dir)}</span> : null}
      <span className="max-w-full shrink-0 truncate text-text-muted">{base}</span>
    </span>
  );
}

export function ApprovalPattern({ pattern, scope }: { pattern: string; scope?: string }) {
  return (
    <span className="approval-pattern flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate text-text-muted" title={pattern}>{pattern}</span>
      {scope ? <><span className="flex-none">于</span><ApprovalPath path={scope} /></> : null}
    </span>
  );
}

/** 固定三层：拒绝（文字）→ 本会话允许（浅灰，仅有授权建议时）→ 工具动词（强调色；破坏性操作用红色）。 */
export function ApprovalActions({
  state,
  primaryLabel,
  primaryVariant = "accent",
  suggestion,
  sessionDetail,
}: {
  state: ApprovalDecisionState;
  primaryLabel: string;
  primaryVariant?: "accent" | "danger";
  suggestion?: GrantSuggestion;
  /** 「本会话允许」后面的补充，如 Bash 命令前缀；用等宽字显示。 */
  sessionDetail?: string;
}) {
  return <>
    <Button variant="ghost" size="xs" shape="pill" busy={state.submitting === "deny"} disabled={state.disabled} onClick={() => void state.decide("deny")}>拒绝</Button>
    {suggestion ? (
      <Button variant="tonal" size="xs" shape="pill" busy={state.submitting === "session"} disabled={state.disabled} title={suggestion.label} onClick={() => void state.decide("session", suggestion.suggestionId)}>
        本会话允许{sessionDetail ? <code className="font-mono font-normal">{sessionDetail}</code> : null}
      </Button>
    ) : null}
    <Button variant={primaryVariant === "danger" ? "danger-solid" : "accent"} size="xs" shape="pill" busy={state.submitting === "once"} disabled={state.disabled} onClick={() => void state.decide("once")}>{primaryLabel}</Button>
  </>;
}

/**
 * 审批卡：标题一句话（动作 muted + 目标 faint）、可选内容、底部按钮。
 * divided 给有内容块的卡片（Bash 命令）在标题下加分隔线；note 是垫在卡片下方的一句说明（目前只有浏览器用）。
 */
export function ApprovalCard({
  icon,
  verb,
  target,
  meta,
  divided = false,
  footerMeta,
  actions,
  note,
  className,
  children,
}: {
  icon?: ReactNode;
  verb?: string;
  target: ReactNode;
  meta?: ReactNode;
  divided?: boolean;
  footerMeta?: ReactNode;
  actions: ReactNode;
  note?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const card = (
    <div className={APPROVAL_CARD_CLASS}>
      <header className={`${APPROVAL_CARD_HEAD_CLASS}${divided ? ` ${APPROVAL_CARD_HEAD_DIVIDED_CLASS}` : ""}`}>
        {icon ? <span className={APPROVAL_ICON_CLASS} aria-hidden="true">{icon}</span> : null}
        {verb ? <span className={APPROVAL_VERB_CLASS}>{verb}</span> : null}
        <span className={APPROVAL_TARGET_CLASS}>{target}{meta}</span>
      </header>
      {children}
      <footer className={APPROVAL_CARD_FOOTER_CLASS}>
        <span className={APPROVAL_CARD_FOOTER_META_CLASS}>{footerMeta}</span>
        <span className={APPROVAL_ACTIONS_CLASS}>{actions}</span>
      </footer>
    </div>
  );
  return (
    <article className={`${APPROVAL_FRAME_CLASS}${className ? ` ${className}` : ""}`}>
      <div className={APPROVAL_STATUS_CLASS}>等待确认</div>
      {note ? <div className={APPROVAL_TRAY_CLASS}>{card}<p className={APPROVAL_NOTE_CLASS}>{note}</p></div> : card}
    </article>
  );
}
