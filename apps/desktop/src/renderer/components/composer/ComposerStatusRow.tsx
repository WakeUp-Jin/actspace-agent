import { formatApproxTokens, formatShare, formatTokenCount } from "../../context-format";
import { Folder, GitBranch, GitFork, Laptop, Server } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { ContextUsageSnapshot, SessionRunLocation } from "@actspace/shared";
import type { HostConnection } from "@actspace/shared/host-protocol";
import type { HostDescription } from "../../target/host-directory";
import type { ReadinessCopy } from "../../target/readiness";
import type { RunTarget } from "../../target/run-target";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { ComposerStatsPills, type ComposerStatsOverlay } from "./ComposerStatsPills";
import { RunTargetDot } from "./RunLocationMenu";

export type ComposerStatusContextUsage = {
  readonly snapshot: ContextUsageSnapshot | null;
  readonly open: boolean;
  readonly onToggle: () => void;
};

/** context 用量圆环：90% 起红、75% 起黄；有内容但不足 1% 时写「<1」，避免「明明有数据却是 0%」。 */
export function contextUsageDisplay(snapshot: ContextUsageSnapshot | null) {
  const percent = snapshot?.percentUsed ?? 0;
  const ringPercent = Math.max(0, Math.min(100, percent));
  const ringColor = ringPercent >= 90
    ? "var(--act-color-danger)"
    : ringPercent >= 75
      ? "var(--act-color-warning)"
      : "var(--act-color-text-faint)";
  const percentLabel = formatShare(snapshot?.totalTokens ?? 0, snapshot?.maxTokens ?? 0);
  return { percentLabel, ringPercent, ringColor };
}

/** 圆环的悬停说明：当前窗口占用是估算值，和输入框下方「累计」胶囊的会话累计消耗不是一回事。 */
export function contextUsageTooltip(snapshot: ContextUsageSnapshot | null): string {
  if (!snapshot) return "当前上下文窗口占用暂无数据";
  const used = formatApproxTokens(snapshot.totalTokens);
  return snapshot.maxTokens > 0
    ? `当前上下文窗口占用 ${used} / ${formatTokenCount(snapshot.maxTokens)}（估算）`
    : `当前上下文窗口占用 ${used}（估算）`;
}

export type ComposerStatusRowProps = {
  /** Chat 没有分支、运行位置和权限，只显示会话累计胶囊和 context 用量。 */
  form: "agent" | "chat";
  target: RunTarget;
  /** 远端没就绪时的 readiness 文案；本机或已就绪时为 null。 */
  notReady: ReadinessCopy | null;
  /** 当前远端 Host（取连接状态）和它的描述（取工作区路径）。 */
  host?: HostConnection;
  remoteDescription?: HostDescription;
  branchLabel?: string;
  runLocation: SessionRunLocation;
  permissionControl?: ReactNode;
  context: ComposerStatusContextUsage;
  /** 统计胶囊面板的开关，交给 ComposerOverlay 和其他浮层互斥；不传时胶囊自己管。 */
  stats?: ComposerStatsOverlay;
};

const ROW_CLASS = "composer-status-row flex min-h-5 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 text-act-sm leading-5 text-text-faint";
const FACTS_CLASS = "flex min-w-0 items-center gap-1.5";
const FACT_CLASS = "inline-flex min-w-0 items-center gap-1.5";
const ICON_CLASS = "shrink-0 text-text-subtle";
const SEP_CLASS = "shrink-0 opacity-60";
const TRAILING_CLASS = "flex min-w-0 items-center gap-1";
const USAGE_CLASS = "inline-flex shrink-0 items-center gap-1.5 text-text-muted";
const USAGE_DOT_CLASS = "h-[15px] w-[15px] shrink-0 rounded-full";
// 3px 环形进度：conic 填充已用占比，radial mask 挖空中心形成圆环。
const USAGE_DOT_MASK = "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))";

/**
 * 09 T19：对话中的只读状态行。运行目标已锁定，这里只陈述「在哪儿跑」，没有下拉。
 * 本机：⑂ 分支 · 💻 本机；工作树：⑂ 分支 · ⑂ 工作树；远端：🖥 Host · 📁 工作区（没就绪时第二段换成状态，context 用量写「—」）。
 */
export function ComposerStatusRow({ form, target, notReady, host, remoteDescription, branchLabel, runLocation, permissionControl, context, stats }: ComposerStatusRowProps) {
  // 第二段被 readiness 文案替换时，context 用量也不可信（Host 连不上或还没读到）。
  const usageUnavailable = target.kind === "remote" && notReady?.label != null;
  const display = contextUsageDisplay(context.snapshot);
  const usage = usageUnavailable ? (
    <span className={USAGE_CLASS} aria-label="上下文用量暂不可用">—</span>
  ) : (
    // 原生 button（从 Composer 搬来）：状态行里的纯文字 + 圆环入口，没有 Button 的边框、内边距和字重。
    <Tooltip>
      <TooltipTrigger asChild>
        <button className={USAGE_CLASS} type="button" aria-label={`上下文用量 ${display.percentLabel}`} aria-expanded={context.open} onClick={context.onToggle} data-context-usage-toggle="">
          <span
            className={USAGE_DOT_CLASS}
            aria-hidden="true"
            style={{
              background: `conic-gradient(${display.ringColor} ${display.ringPercent}%, var(--act-color-border) ${display.ringPercent}%)`,
              WebkitMask: USAGE_DOT_MASK,
              mask: USAGE_DOT_MASK,
            }}
          />
          <span>{display.percentLabel}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{contextUsageTooltip(context.snapshot)}</TooltipContent>
    </Tooltip>
  );

  // 右侧：会话累计胶囊（轮次/速度、Token 用量）+ context 圆环。
  const trailing = (
    <div className={TRAILING_CLASS}>
      <ComposerStatsPills overlay={stats} />
      {usage}
    </div>
  );

  if (form === "chat") return <div className={`${ROW_CLASS} justify-end`}>{trailing}</div>;

  const facts = target.kind === "remote"
    ? remoteFacts(target, notReady, host, remoteDescription)
    : localFacts(target, branchLabel, runLocation);
  return (
    <div className={ROW_CLASS} aria-label="运行位置">
      <div className="flex min-w-0 items-center gap-3">
        <div className={FACTS_CLASS}>
          {facts.map((fact, index) => (
            <Fragment key={index}>
              {index > 0 ? <span className={SEP_CLASS} aria-hidden="true">·</span> : null}
              {fact}
            </Fragment>
          ))}
        </div>
        {permissionControl ? <span className={FACT_CLASS}>{permissionControl}</span> : null}
      </div>
      {trailing}
    </div>
  );
}

function localFacts(target: Extract<RunTarget, { kind: "local" | "invalid" }>, branchLabel: string | undefined, runLocation: SessionRunLocation): ReactNode[] {
  const facts: ReactNode[] = [];
  if (branchLabel) {
    facts.push(
      <span className={FACT_CLASS} title={branchLabel}>
        <GitBranch className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
        <span className="max-w-[240px] truncate">{branchLabel}</span>
      </span>,
    );
  }
  const worktree = target.kind === "local" ? target.worktree : undefined;
  if (runLocation === "worktree") {
    const source = worktree ? `原工作区：${worktree.sourceWorkspaceRoot} · 基于 ${worktree.baseBranch}` : "工作树";
    facts.push(
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-label={`工作树，${source}`} className={`${FACT_CLASS} rounded-act-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`}>
            <GitFork className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
            <span>工作树</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="break-all">{source}</TooltipContent>
      </Tooltip>,
    );
  } else {
    facts.push(
      <span className={FACT_CLASS}>
        <Laptop className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
        <span>本机</span>
      </span>,
    );
  }
  return facts;
}

function remoteFacts(target: Extract<RunTarget, { kind: "remote" }>, notReady: ReadinessCopy | null, host: HostConnection | undefined, description: HostDescription | undefined): ReactNode[] {
  const workspacePath = description?.workspaces.find((workspace) => workspace.id === target.workspaceId)?.path;
  const status = notReady?.label ?? (host?.state === "connected" ? "已连接" : null);
  const tip = [status, workspacePath].filter(Boolean).join(" · ");
  const hostName = target.hostName || "远端机器";
  const hostFact = tip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={FACT_CLASS} tabIndex={0}>
          <Server className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
          <span className="max-w-[200px] truncate">{hostName}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  ) : (
    <span className={FACT_CLASS}>
      <Server className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
      <span className="max-w-[200px] truncate">{hostName}</span>
    </span>
  );
  // 第二段：就绪时是工作区名；没就绪且有短文案时换成状态点和文案（06 §4.5）。
  const second = notReady?.label ? (
    <span className={FACT_CLASS}>
      {notReady.tone ? <RunTargetDot tone={notReady.tone} /> : null}
      <span>{notReady.label}</span>
    </span>
  ) : target.workspaceName ? (
    <span className={FACT_CLASS}>
      <Folder className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
      <span className="max-w-[200px] truncate">{target.workspaceName}</span>
    </span>
  ) : null;
  return second ? [hostFact, second] : [hostFact];
}
