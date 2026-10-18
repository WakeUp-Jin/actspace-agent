import { Monitor } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useConnection } from "../../connection/use-connection";
import { formatElapsed, statusKind } from "../../sessions/composer-state";
import { hostDisplayName } from "../../sessions/session-row-model";

type Props = { readonly awaitingApproval: boolean; readonly running: boolean; readonly connected: boolean; readonly maintenance: boolean; readonly runStartedAt: number | null; readonly contextPercent: number | null };

/** 输入框上方一行小字：等待确认 / 运行中 · 计时 / 断开 / 本机；右侧上下文用量环（Host 给了才显示）。 */
export function StatusLine({ awaitingApproval, running, connected, maintenance, runStartedAt, contextPercent }: Props) {
  const host = hostDisplayName(useConnection().host?.url);
  const kind = statusKind({ awaitingApproval, running, connected, maintenance });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (kind !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [kind]);
  const percent = contextPercent === null ? null : Math.max(0, Math.min(100, Math.round(contextPercent)));
  return (
    <div className="flex min-h-5 items-center justify-between gap-3 px-2.5 pb-1.5 text-act-xs text-text-faint" aria-live="polite">
      <span className="flex min-w-0 items-center gap-1.5">
        {kind === "approval" ? <><span aria-hidden className="pulse-dot size-1.5 flex-none rounded-full bg-warning" /><span className="font-medium text-warning">等待确认</span></>
          : kind === "running" ? <><span aria-hidden className="spinner" /><span className="tabular-nums">运行中{runStartedAt ? ` · ${formatElapsed(now - runStartedAt)}` : ""}</span></>
          : kind === "offline" ? <span>已断开，正在重连…</span>
          : kind === "maintenance" ? <span className="text-warning">服务器维护中</span>
          : <><Monitor size={13} aria-hidden className="flex-none" /><span className="truncate">{host}</span></>}
      </span>
      {percent !== null ? <span role="img" aria-label={`上下文用量 ${percent}%`} title={`上下文用量 ${percent}%`} className="context-ring" style={{ "--p": percent } as CSSProperties} /> : null}
    </div>
  );
}
