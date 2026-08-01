import type {
  AgentAnalysisSessionIndexResult,
  AgentAnalysisSessionStatus,
  AgentAnalysisSessionSummary,
} from "@actspace/shared";
import { ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AgentAnalysisPage } from "./AgentAnalysisPage";
import { AnalysisBackButton } from "./AnalysisBackButton";

const EMPTY_SESSION_INDEX: AgentAnalysisSessionIndexResult = {
  totals: {
    sessionCount: 0,
    agentRunCount: 0,
    turnCount: 0,
    llmCallCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    durationMs: 0,
  },
  modelNames: [],
  sessions: [],
};

const STATUS_OPTIONS: Array<{ value: "all" | AgentAnalysisSessionStatus; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "recording", label: "记录中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "empty", label: "暂无记录" },
  { value: "unavailable", label: "不可读取" },
];

export function AgentAnalysisWorkspace({
  activeSessionId,
  onBack,
}: {
  activeSessionId: string | null;
  onBack: () => void;
}) {
  const [index, setIndex] = useState<AgentAnalysisSessionIndexResult>(EMPTY_SESSION_INDEX);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AgentAnalysisSessionStatus>("all");
  const [modelFilter, setModelFilter] = useState("all");

  useEffect(() => {
    if (!window.actspace?.getAgentAnalysisSessionIndex) {
      setLoading(false);
      setError("分析观测会话索引需要在 ActSpace 桌面端中打开。");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.actspace.getAgentAnalysisSessionIndex()
      .then((next) => {
        if (!cancelled) setIndex(next);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "分析会话索引加载失败。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return index.sessions.filter((session) => {
      if (statusFilter !== "all" && session.status !== statusFilter) return false;
      if (modelFilter !== "all" && !session.modelNames.includes(modelFilter)) return false;
      if (!normalizedQuery) return true;
      return [session.title, session.workspaceRoot ?? "", ...session.modelNames]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [index.sessions, modelFilter, query, statusFilter]);

  if (selectedSessionId) {
    return (
      <AgentAnalysisPage
        sessionId={selectedSessionId}
        onBack={() => setSelectedSessionId(null)}
        backLabel="返回会话列表"
      />
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-analysis-canvas text-text-main" data-testid="agent-analysis-workspace">
      <div className="window-chrome-bar" role="presentation">
        <div className="chrome-left" />
        <div className="chrome-center" />
        <div className="chrome-right" />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto bg-app-bg">
        <div className="mx-auto w-full max-w-[1180px] px-6 pb-10 pt-[calc(var(--window-chrome-strip-height)+24px)] max-[760px]:px-3 max-[760px]:pb-6 max-[760px]:pt-[calc(var(--window-chrome-strip-height)+16px)]">
          <div className="flex min-h-9 items-center gap-2">
            <AnalysisBackButton label="返回" onClick={onBack} iconOnly />
            <h1 className="text-[21px] font-semibold text-text-main">会话记录</h1>
            <span className="text-[12px] tabular-nums text-text-faint">{formatNumber(index.totals.sessionCount)} 个会话</span>
          </div>

          <section aria-label="分析记录汇总" className="mt-6 flex min-h-[66px] items-center overflow-x-auto border-y border-line py-3">
            <SessionMetric label="会话" value={index.totals.sessionCount} />
            <SessionMetric label="Agent Run" value={index.totals.agentRunCount} />
            <SessionMetric label="Turn" value={index.totals.turnCount} />
            <SessionMetric label="LLM Call" value={index.totals.llmCallCount} />
            <SessionMetric label="API Token" value={index.totals.inputTokens + index.totals.outputTokens} accent />
          </section>

          <section aria-label="分析会话列表" className="mt-6 overflow-hidden rounded-act-lg border border-line bg-surface shadow-act-soft">
            <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-3 max-[720px]:flex-wrap">
              <label className="relative min-w-[220px] flex-1 max-[720px]:w-full max-[720px]:basis-full">
                <span className="sr-only">搜索分析会话</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" size={15} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索会话或工作区"
                  className="h-[38px] w-full rounded-act-md border border-line bg-app-bg pl-9 pr-3 text-[12px] text-text-main outline-none placeholder:text-text-faint focus:border-line-strong focus:ring-2 focus:ring-focus-ring"
                />
              </label>
              <label className="w-[148px] max-[720px]:min-w-0 max-[720px]:flex-1">
                <span className="sr-only">状态筛选</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | AgentAnalysisSessionStatus)}
                  className="h-[38px] w-full cursor-pointer rounded-act-md border border-line bg-surface px-3 text-[12px] text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-focus-ring"
                >
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="w-[172px] max-[720px]:min-w-0 max-[720px]:flex-1">
                <span className="sr-only">模型筛选</span>
                <select
                  value={modelFilter}
                  onChange={(event) => setModelFilter(event.target.value)}
                  className="h-[38px] w-full cursor-pointer rounded-act-md border border-line bg-surface px-3 text-[12px] text-text-main outline-none focus:border-line-strong focus:ring-2 focus:ring-focus-ring"
                >
                  <option value="all">全部模型</option>
                  {index.modelNames.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </label>
            </div>
            <div className="grid min-h-10 grid-cols-[minmax(260px,1fr)_100px_112px_180px_88px_18px] items-center gap-3 border-b border-line bg-surface-subtle px-4 text-[10px] font-semibold text-text-faint max-[1050px]:grid-cols-[minmax(240px,1fr)_90px_108px_88px_18px] max-[720px]:hidden">
              <span>会话</span><span>Run / Turn</span><span>Token</span><span className="max-[1050px]:hidden">模型</span><span>状态</span><span />
            </div>
            {loading ? (
              <div className="flex min-h-40 items-center justify-center text-[12px] text-text-faint">正在建立会话索引…</div>
            ) : error ? (
              <div className="flex min-h-40 items-center justify-center px-6 text-center text-[12px] text-danger">{error}</div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center px-6 text-center text-[12px] text-text-faint">
                {index.sessions.length === 0 ? "还没有可分析的会话。" : "没有符合当前筛选条件的会话。"}
              </div>
            ) : filteredSessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                active={session.sessionId === activeSessionId}
                onSelect={() => setSelectedSessionId(session.sessionId)}
              />
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
}: {
  session: AgentAnalysisSessionSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`打开分析会话：${session.title}`}
      aria-current={active ? "true" : undefined}
      className="grid min-h-[68px] w-full cursor-pointer grid-cols-[minmax(260px,1fr)_100px_112px_180px_88px_18px] items-center gap-3 border-b border-line bg-surface px-4 text-left transition-colors duration-[160ms] last:border-b-0 hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring max-[1050px]:grid-cols-[minmax(240px,1fr)_90px_108px_88px_18px] max-[720px]:grid-cols-[minmax(0,1fr)_auto_18px] max-[720px]:gap-2 max-[720px]:py-3"
    >
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-operational" : "bg-transparent"}`} aria-hidden="true" />
          <span className="truncate text-[13px] font-semibold text-text-main">{session.title || "未命名会话"}</span>
          {active ? <span className="shrink-0 text-[10px] font-medium text-operational">当前</span> : null}
        </span>
        <span className="mt-1 block truncate text-[10px] text-text-faint">
          {workspaceLabel(session.workspaceRoot)} <span aria-hidden="true">·</span> <time dateTime={session.updatedAt}>{formatTimestamp(session.updatedAt)}</time>
        </span>
        <span className="mt-1 hidden truncate font-mono text-[10px] text-text-muted max-[720px]:block">
          Run {formatNumber(session.agentRunCount)} / Turn {formatNumber(session.turnCount)} <span aria-hidden="true">·</span> {formatNumber(session.inputTokens + session.outputTokens)} token
        </span>
      </span>
      <span className="font-mono text-[11px] tabular-nums text-text-muted max-[720px]:hidden">{formatNumber(session.agentRunCount)} / {formatNumber(session.turnCount)}</span>
      <span className="font-mono text-[11px] tabular-nums text-text-main max-[720px]:hidden">{formatNumber(session.inputTokens + session.outputTokens)}</span>
      <span className="truncate font-mono text-[10px] text-text-muted max-[1050px]:hidden">{session.modelNames.join(", ") || "—"}</span>
      <SessionStatus status={session.status} />
      <ChevronRight size={15} className="text-text-faint" />
    </button>
  );
}

function SessionStatus({ status }: { status: AgentAnalysisSessionStatus }) {
  const labels: Record<AgentAnalysisSessionStatus, string> = {
    recording: "记录中",
    completed: "已完成",
    failed: "失败",
    empty: "暂无记录",
    unavailable: "不可读取",
  };
  const classes: Record<AgentAnalysisSessionStatus, string> = {
    recording: "text-operational",
    completed: "text-text-muted",
    failed: "text-danger",
    empty: "text-text-faint",
    unavailable: "text-warning",
  };
  return <span className={`inline-flex min-h-7 items-center gap-1.5 justify-self-start text-[10px] font-medium ${classes[status]}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />{labels[status]}</span>;
}

function SessionMetric({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="min-w-[118px] shrink-0 border-l border-line px-5 first:border-l-0 first:pl-0 max-[720px]:min-w-[108px] max-[720px]:px-4">
      <div className="text-[10px] text-text-faint">{label}</div>
      <div className={`mt-1 font-mono text-[18px] font-semibold tabular-nums ${accent ? "text-operational" : "text-text-main"}`}>
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function workspaceLabel(workspaceRoot?: string): string {
  if (!workspaceRoot) return "Default workspace";
  const segments = workspaceRoot.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? workspaceRoot;
}
