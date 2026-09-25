import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import type { GrantSuggestion, RuntimeV2ApprovalDecisionInput } from "@actspace/shared/runtime-v2";

// 工具审批的共享外壳：一行审批条（读取/搜索/编辑/写入/删除）与卡片（Bash/浏览器）。
// 设计稿见 docs/design-docs/frontend/approval-card-redesign.html（B 方向）。

export type ApprovalChoice = "once" | "session" | "deny";
export type ApprovalChipTone = "neutral" | "warning" | "danger" | "info";
export type ApprovalButtonVariant = "ghost" | "quiet" | "primary" | "danger";
type ApprovalSize = "row" | "card";

const APPROVAL_SHELL_CLASS = "message-row w-full max-w-[800px] rounded-act-md border bg-surface";
const APPROVAL_TONE_BORDER_CLASS = { warning: "border-warning/30", danger: "border-danger/35" } as const;
const APPROVAL_ROW_LINE_CLASS = "approval-row-line flex min-h-[38px] min-w-0 items-center gap-2 py-[5px] pr-1.5 pl-3 text-sm leading-5";
const APPROVAL_CARD_HEAD_CLASS = "approval-card-head flex min-h-[30px] min-w-0 items-center gap-2 pt-2.5 pr-3 pl-3 text-sm leading-5";
const APPROVAL_CARD_BODY_CLASS = "approval-card-body mt-2.5 mr-3 ml-9";
const APPROVAL_CARD_FOOTER_CLASS = "approval-card-footer flex items-center gap-1.5 py-2.5 pr-2.5 pl-9";
const APPROVAL_CARD_FOOTER_META_CLASS = "approval-card-meta mr-auto min-w-0 truncate text-xs text-text-faint";
const APPROVAL_ICON_CLASS = "grid size-4 flex-none place-items-center text-text-faint";
const APPROVAL_VERB_CLASS = "flex-none font-medium text-text-main";
const APPROVAL_TARGET_CLASS = "approval-target flex min-w-0 items-center gap-1.5";
const APPROVAL_ACTIONS_CLASS = "approval-actions ml-auto flex flex-none items-center gap-1 pl-2";

const APPROVAL_CHIP_CLASS = "approval-chip inline-flex h-5 flex-none items-center rounded-act-xs px-1.5 text-[11.5px] font-medium leading-none whitespace-nowrap";
const APPROVAL_CHIP_TONE_CLASS: Record<ApprovalChipTone, string> = {
  neutral: "bg-surface-subtle text-text-muted",
  warning: "bg-warning-soft text-on-warning",
  danger: "bg-danger-soft text-on-danger",
  info: "bg-info-soft text-on-info",
};

const APPROVAL_BUTTON_CLASS =
  "approval-button inline-flex flex-none items-center gap-1.5 rounded-act-sm border font-medium whitespace-nowrap transition-[transform,background-color,border-color,color] duration-100 enabled:active:scale-[0.97] disabled:cursor-default disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const APPROVAL_BUTTON_SIZE_CLASS: Record<ApprovalSize, string> = {
  row: "h-[26px] px-[9px] text-[12.5px]",
  card: "h-7 px-2.5 text-[13px]",
};
const APPROVAL_BUTTON_VARIANT_CLASS: Record<ApprovalButtonVariant, string> = {
  ghost: "border-transparent bg-transparent text-text-muted enabled:hover:bg-hover-overlay enabled:hover:text-text-main",
  quiet: "border-line bg-surface text-text-main enabled:hover:bg-surface-subtle",
  primary: "border-transparent bg-action text-on-action enabled:hover:bg-action-hover",
  danger: "border-transparent bg-danger text-on-danger-solid enabled:hover:bg-danger-hover",
};

const OUTSIDE_WORKSPACE_REASON = "The requested file is outside the workspace.";
const SENSITIVE_FILE_REASON = "This file may contain credentials and requires one-time approval.";
// 通用审批提示：工具本身就要求确认，标签和按钮已经表达清楚，不再重复展示。
const GENERIC_APPROVAL_REASONS = new Set([
  "Allow Bash to run this command once?",
  "Allow this file to be deleted once?",
  "Bash command requires approval",
  "delete_file is a destructive file operation and requires approval.",
]);

export type ApprovalReasonChip = { readonly label: string; readonly tone: ApprovalChipTone };

/** 把 Runtime 以换行拼接的 reason 文本映射成标签；未知原因原样保留在 notes，不丢信息。 */
export function getApprovalReasonChips(reason?: string): { chips: ApprovalReasonChip[]; notes: string[] } {
  const chips: ApprovalReasonChip[] = [];
  const notes: string[] = [];
  for (const line of (reason ?? "").split("\n").map((item) => item.trim()).filter(Boolean)) {
    if (line === OUTSIDE_WORKSPACE_REASON) chips.push({ label: "工作区外", tone: "warning" });
    else if (line === SENSITIVE_FILE_REASON) chips.push({ label: "敏感文件", tone: "danger" });
    else if (!GENERIC_APPROVAL_REASONS.has(line)) notes.push(line);
  }
  return { chips, notes };
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
  if (typeof window === "undefined" || !window.actspace?.submitApproval) {
    console.warn("submitApproval bridge unavailable");
    return false;
  }
  try {
    const result = await window.actspace.submitApproval(input);
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
  const [submitting, setSubmitting] = useState<ApprovalChoice | null>(null);
  const [resolved, setResolved] = useState<ApprovalChoice | null>(null);
  const decide = async (choice: ApprovalChoice, suggestionId?: string) => {
    if (!requestId || submitting !== null) return;
    if (choice === "session" && !suggestionId) return;
    setSubmitting(choice);
    const input: RuntimeV2ApprovalDecisionInput = choice === "session" && suggestionId
      ? { requestId, decision: "session", suggestionId }
      : { requestId, decision: choice === "deny" ? "deny" : "once" };
    if (await submitApprovalDecision(input)) setResolved(choice);
    else setSubmitting(null);
  };
  return { submitting, resolved, disabled: !requestId || submitting !== null, decide };
}

/** 只取精确路径的会话授权建议；目录树授权由权限服务自行判断，不在审批条上暴露。 */
export function useExactGrantSuggestion(requestId: string | undefined): GrantSuggestion | undefined {
  const [suggestion, setSuggestion] = useState<GrantSuggestion>();
  useEffect(() => {
    let active = true;
    if (!requestId || typeof window === "undefined" || !window.actspace?.listPendingApprovals) return;
    void window.actspace.listPendingApprovals().then((pending) => {
      const request = pending.find((item) => item.requestId === requestId);
      if (active) setSuggestion(request?.grantSuggestions.find((item) => item.selector.kind === "exact"));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [requestId]);
  return suggestion;
}

export function ApprovalChip({ tone = "neutral", children }: { tone?: ApprovalChipTone; children: ReactNode }) {
  return <span className={`${APPROVAL_CHIP_CLASS} ${APPROVAL_CHIP_TONE_CLASS[tone]}`}>{children}</span>;
}

export function ApprovalReason({ reason }: { reason?: string }) {
  const { chips, notes } = getApprovalReasonChips(reason);
  return <>
    {chips.map((chip) => <ApprovalChip key={chip.label} tone={chip.tone}>{chip.label}</ApprovalChip>)}
    {notes.length > 0 ? (
      <span className="grid size-4 flex-none place-items-center text-text-faint" role="img" aria-label="审批原因" title={notes.join("\n")}>
        <Info size={13} strokeWidth={2} aria-hidden="true" />
      </span>
    ) : null}
  </>;
}

export function ApprovalPath({ path }: { path: string }) {
  const { dir, base } = splitApprovalPath(path);
  return (
    <span className="approval-path flex min-w-0 font-mono text-[13px]" title={path}>
      {/* 目录先收缩；文件名不参与收缩，只在整行都放不下时按容器宽度截断。 */}
      {dir ? <span className="min-w-0 truncate text-text-faint">{compactApprovalDir(dir)}</span> : null}
      <span className="max-w-full shrink-0 truncate font-medium text-text-main">{base}</span>
    </span>
  );
}

export function ApprovalPattern({ pattern, scope }: { pattern: string; scope?: string }) {
  return (
    <span className="approval-pattern flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono text-[13px] text-text-main" title={pattern}>{pattern}</span>
      {scope ? <><span className="flex-none text-text-faint">于</span><ApprovalPath path={scope} /></> : null}
    </span>
  );
}

export function ApprovalButton({
  variant,
  size = "row",
  busy = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant: ApprovalButtonVariant; size?: ApprovalSize; busy?: boolean }) {
  return (
    <button
      type="button"
      aria-busy={busy || undefined}
      className={`${APPROVAL_BUTTON_CLASS} ${APPROVAL_BUTTON_SIZE_CLASS[size]} ${APPROVAL_BUTTON_VARIANT_CLASS[variant]}${className ? ` ${className}` : ""}`}
      {...props}
    >
      {busy ? <Loader2 className="animate-spin" size={12} strokeWidth={2.2} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** 固定三层：拒绝 → 本会话（仅有精确授权建议时）→ 工具动词。 */
export function ApprovalActions({
  state,
  primaryLabel,
  primaryVariant = "primary",
  suggestion,
  size = "row",
}: {
  state: ApprovalDecisionState;
  primaryLabel: string;
  primaryVariant?: "primary" | "danger";
  suggestion?: GrantSuggestion;
  size?: ApprovalSize;
}) {
  return <>
    <ApprovalButton variant="ghost" size={size} busy={state.submitting === "deny"} disabled={state.disabled} onClick={() => void state.decide("deny")}>拒绝</ApprovalButton>
    {suggestion ? (
      <ApprovalButton variant="quiet" size={size} busy={state.submitting === "session"} disabled={state.disabled} title={suggestion.label} onClick={() => void state.decide("session", suggestion.suggestionId)}>本会话</ApprovalButton>
    ) : null}
    <ApprovalButton variant={primaryVariant} size={size} busy={state.submitting === "once"} disabled={state.disabled} onClick={() => void state.decide("once")}>{primaryLabel}</ApprovalButton>
  </>;
}

export function ApprovalRow({
  icon,
  verb,
  target,
  meta,
  actions,
  tone = "warning",
  className,
  children,
}: {
  icon: ReactNode;
  verb: string;
  target: ReactNode;
  meta?: ReactNode;
  actions: ReactNode;
  tone?: "warning" | "danger";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <article className={`approval-row ${APPROVAL_SHELL_CLASS} ${APPROVAL_TONE_BORDER_CLASS[tone]}${className ? ` ${className}` : ""}`}>
      <div className={APPROVAL_ROW_LINE_CLASS}>
        <span className={APPROVAL_ICON_CLASS} aria-hidden="true">{icon}</span>
        <span className={APPROVAL_VERB_CLASS}>{verb}</span>
        <span className={APPROVAL_TARGET_CLASS}>{target}{meta}</span>
        <span className={APPROVAL_ACTIONS_CLASS}>{actions}</span>
      </div>
      {children}
    </article>
  );
}

export function ApprovalCard({
  icon,
  verb,
  target,
  meta,
  footerMeta,
  actions,
  tone = "warning",
  className,
  children,
}: {
  icon: ReactNode;
  verb: string;
  target: ReactNode;
  meta?: ReactNode;
  footerMeta?: ReactNode;
  actions: ReactNode;
  tone?: "warning" | "danger";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <article className={`approval-card ${APPROVAL_SHELL_CLASS} ${APPROVAL_TONE_BORDER_CLASS[tone]}${className ? ` ${className}` : ""}`}>
      <header className={APPROVAL_CARD_HEAD_CLASS}>
        <span className={APPROVAL_ICON_CLASS} aria-hidden="true">{icon}</span>
        <span className={APPROVAL_VERB_CLASS}>{verb}</span>
        <span className={APPROVAL_TARGET_CLASS}>{target}{meta}</span>
      </header>
      {children ? <div className={APPROVAL_CARD_BODY_CLASS}>{children}</div> : null}
      <footer className={APPROVAL_CARD_FOOTER_CLASS}>
        <span className={APPROVAL_CARD_FOOTER_META_CLASS}>{footerMeta}</span>
        {actions}
      </footer>
    </article>
  );
}
