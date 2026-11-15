import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import { formatTokenCount } from "../../context-format";
import { useTrajectoryNavigation } from "../trajectory/TrajectoryNavigation";
import { CompactionSprite } from "./CompactionSprite";
import { PACK_ICON_ROWS, framePixels } from "./compaction-sprite-model";

type CompactMessage = Extract<MessageBlock, { kind: "context_compaction" }>;

/** 对话视图提供的「重新压缩」入口；失败分隔线上的「重试」走它，避免把回调穿过 renderMessage 的位置参数。 */
export const CompactionRetryContext = createContext<(() => void) | undefined>(undefined);

// 手动 /compact 与自动压缩共用这一块（front-轮尾与导航规范「上下文压缩分隔线」）：进行中是像素精灵把消息推到墙角；
// 在屏上完成时先播一次收尾，再换成居中分隔线（条数、token、耗时，摘要去轨迹里看）；失败时精灵瘫倒 + 重试。
const BLOCK_CLASS =
  "message-row compact-command-block w-full px-[var(--conversation-text-inset)] animate-[rise-in_220ms_ease_both]";
// 颜色按状态二选一，不叠加：同一属性出现两个 utility 时生效的是 Tailwind 生成顺序。
const DIVIDER_CLASS = "compact-command-divider flex w-full items-center gap-3 py-2 text-act-xs leading-4";
const DIVIDER_LINE_CLASS = "compact-divider-line h-px min-w-6 flex-1";
// 窄窗时中间一组换行（数据挪到第二行），不截断 token 和耗时。
const DIVIDER_MIDDLE_CLASS = "inline-flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 tabular-nums";
const DIVIDER_ICON_CLASS = "shrink-0";
const DIVIDER_TITLE_CLASS = "shrink-0 font-medium whitespace-nowrap";
const DIVIDER_TEXT_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
// 进行中 / 失败：左边像素舞台，右边文字。
const STAGE_ROW_CLASS = "compact-command-divider flex w-full min-w-0 items-center gap-3 py-2 text-act-xs leading-4 tabular-nums";
const STAGE_TEXT_CLASS = "inline-flex min-w-0 shrink items-center gap-2";
const LINK_CLASS =
  "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-act-xs text-text-muted transition-colors duration-(--motion-fast) hover:text-text-main focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const RETRY_CLASS =
  "shrink-0 rounded-act-xs font-semibold text-text-main underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";

export function formatCompactionDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function useElapsedMs(startedAt: string | undefined, active: boolean): number | null {
  const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || Number.isNaN(startMs)) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, startMs]);
  return Number.isNaN(startMs) ? null : Math.max(0, now - startMs);
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className={`${DIVIDER_CLASS} text-text-faint`}>
      <span className={DIVIDER_LINE_CLASS} aria-hidden="true" />
      <span className={DIVIDER_MIDDLE_CLASS}>{children}</span>
      <span className={DIVIDER_LINE_CLASS} aria-hidden="true" />
    </div>
  );
}

const PACK_ICON_PIXELS = framePixels(PACK_ICON_ROWS).body;

/** 完成行的图标：和收尾时压成的方块同一个像素形状。 */
function PackIcon() {
  return (
    <svg className={`${DIVIDER_ICON_CLASS} text-text-muted`} viewBox="0 0 6 5" width={12} height={10} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {PACK_ICON_PIXELS.map(([x, y]) => <rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />)}
    </svg>
  );
}

/** 同一块的消息块排布固定：按 id 取种子。 */
function seedOf(id: string): number {
  let hash = 7;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 233_280;
  return hash;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function completedTitle(message: CompactMessage): string {
  return typeof message.removedCount === "number" && message.removedCount > 0 ? `以上 ${message.removedCount} 条消息已压缩` : "上下文已压缩";
}

/** 「182K → 约 9.1K tokens · 23s」；压缩前含估算时也带「约」，旧会话没有 token 时只留耗时。 */
function completedStats(message: CompactMessage): string {
  const parts: string[] = [];
  if (typeof message.beforeTokens === "number" && typeof message.afterTokens === "number") {
    const before = `${message.beforeEstimated ? "约 " : ""}${formatTokenCount(message.beforeTokens)}`;
    parts.push(`${before} → 约 ${formatTokenCount(message.afterTokens)} tokens`);
  }
  if (typeof message.durationMs === "number") parts.push(formatCompactionDuration(message.durationMs));
  return parts.join(" · ");
}

export function CompactCommandBlock({
  message,
  className,
  onRetry,
}: {
  message: CompactMessage;
  className?: string;
  onRetry?: () => void;
}) {
  const blockClassName = `${BLOCK_CLASS}${className ? ` ${className}` : ""}`;
  const contextRetry = useContext(CompactionRetryContext);
  const retry = onRetry ?? contextRetry;
  const navigation = useTrajectoryNavigation();
  const elapsedMs = useElapsedMs(message.startedAt, message.status === "running");
  // 在屏上从 running 变成 completed 时先播收尾；一出现就是 completed（历史、刷新）时不播。渲染期派生，不经 effect。
  const [previousStatus, setPreviousStatus] = useState(message.status);
  const [finishing, setFinishing] = useState(false);
  if (previousStatus !== message.status) {
    setPreviousStatus(message.status);
    setFinishing(previousStatus === "running" && message.status === "completed" && !prefersReducedMotion());
  }
  const seed = seedOf(message.id);

  if (message.status === "running" || finishing) {
    return (
      <article className={blockClassName}>
        <div className={`${STAGE_ROW_CLASS} compact-divider-running text-text-faint`}>
          <CompactionSprite mode={finishing ? "finishing" : "running"} startedAt={message.startedAt} seed={seed} onFinished={() => setFinishing(false)} />
          <span className={STAGE_TEXT_CLASS}>
            <span className={`${DIVIDER_TITLE_CLASS} text-text-muted`} role="status" aria-live="polite">正在压缩上下文</span>
            {elapsedMs === null || finishing ? null : <span>{formatCompactionDuration(elapsedMs)}</span>}
          </span>
        </div>
      </article>
    );
  }

  if (message.status === "failed") {
    return (
      <article className={blockClassName}>
        <div className={`${STAGE_ROW_CLASS} compact-divider-failed text-on-danger`}>
          <CompactionSprite mode="failed" startedAt={message.startedAt} seed={seed} />
          <span className={STAGE_TEXT_CLASS}>
            <span className={DIVIDER_TITLE_CLASS} role="alert">上下文压缩失败</span>
            {message.errorMessage ? <span className={DIVIDER_TEXT_CLASS} title={message.errorMessage}>{message.errorMessage}</span> : null}
            {retry ? <button type="button" className={RETRY_CLASS} onClick={retry}>重试</button> : null}
          </span>
        </div>
      </article>
    );
  }

  const title = completedTitle(message);
  const stats = completedStats(message);
  const compactionId = message.compactionId;
  return (
    <article className={blockClassName}>
      <Divider>
        <PackIcon />
        <span className={`${DIVIDER_TITLE_CLASS} text-text-muted`} role="separator" aria-label={stats ? `${title} · ${stats}` : title}>{title}</span>
        {stats ? <span className="whitespace-nowrap">{stats}</span> : null}
        {navigation && compactionId ? (
          <>
            <span aria-hidden="true">·</span>
            <button type="button" className={LINK_CLASS} onClick={() => navigation.revealInTrajectory({ compactionId })}>
              在轨迹中查看
              <ChevronRight size={11} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </Divider>
    </article>
  );
}
