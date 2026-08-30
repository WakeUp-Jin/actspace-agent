import type { AgentAnalysisIndexResult, AgentAnalysisRunSummary, AgentTraceTurnSummary } from "@actspace/shared";
import {
  Activity,
  Braces,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  GitCompareArrows,
  Menu,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MarkdownProse } from "../messages/MarkdownProse";
import { useDialogFocusTrap } from "../settings/useDialogFocusTrap";
import { AnalysisBackButton } from "./AnalysisBackButton";
import {
  buildAnalysisRunDetail,
  createSanitizedCurl,
  diffAnalysisRequests,
  messageText,
  responseContent,
  type AnalysisCallView,
  type AnalysisMessageView,
  type AnalysisRunDetail,
  type AnalysisToolView,
} from "./analysis-view-model";

type Selection = {
  agentRunId: string;
  turnId: string;
  llmCallId?: string;
};

type CodeModal = {
  title: string;
  content: string;
  language: "json" | "shell";
} | null;

export function AgentAnalysisPage({
  sessionId,
  onBack,
  backLabel = "返回设置",
}: {
  sessionId: string | null;
  fallbackTitle?: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const [index, setIndex] = useState<AgentAnalysisIndexResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, AnalysisRunDetail>>({});
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [toolFilter, setToolFilter] = useState("all");
  const [codeModal, setCodeModal] = useState<CodeModal>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const detailCacheRef = useRef(details);
  detailCacheRef.current = details;

  const loadIndex = useCallback(async () => {
    if (!sessionId) {
      setIndex(null);
      setSelection(null);
      return;
    }
    if (!window.actspace?.getAgentAnalysisIndex) {
      setError("分析观测需要在 ActSpace 桌面端中打开。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await window.actspace.getAgentAnalysisIndex({ sessionId });
      setIndex(next);
      const firstRun = next.runs[0];
      const firstTurn = firstRun?.turns.at(-1);
      if (firstRun && firstTurn) {
        setSelection({ agentRunId: firstRun.agentRunId, turnId: firstTurn.turnId });
        setExpandedRuns(new Set([firstRun.agentRunId]));
      } else {
        setSelection(null);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "分析记录加载失败。");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setDetails({});
    void loadIndex();
  }, [loadIndex]);

  useEffect(() => {
    const agentRunId = selection?.agentRunId;
    if (!sessionId || !agentRunId || detailCacheRef.current[agentRunId] || !window.actspace?.readAgentTrace) return;
    let cancelled = false;
    setLoadingRunId(agentRunId);
    window.actspace.readAgentTrace({ sessionId, agentRunId })
      .then((result) => {
        if (cancelled) return;
        const detail = buildAnalysisRunDetail(result.trace, result.events);
        setDetails((current) => ({ ...current, [agentRunId]: detail }));
        setSelection((current) => {
          if (!current || current.agentRunId !== agentRunId) return current;
          const turn = detail.turns.find((entry) => entry.turnId === current.turnId) ?? detail.turns.at(-1);
          const call = current.llmCallId
            ? turn?.calls.find((entry) => entry.llmCallId === current.llmCallId)
            : turn?.calls.at(-1);
          return turn ? { agentRunId, turnId: turn.turnId, llmCallId: call?.llmCallId } : current;
        });
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "Trace 读取失败。");
      })
      .finally(() => {
        if (!cancelled) setLoadingRunId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selection?.agentRunId, sessionId]);

  const selectedDetail = selection ? details[selection.agentRunId] : undefined;
  const selectedTurn = selectedDetail?.turns.find((turn) => turn.turnId === selection?.turnId);
  const selectedCall = selectedTurn?.calls.find((call) => call.llmCallId === selection?.llmCallId)
    ?? selectedTurn?.calls.at(-1);
  const selectedCallIndex = selectedDetail && selectedCall
    ? selectedDetail.calls.findIndex((call) => call.llmCallId === selectedCall.llmCallId)
    : -1;
  const queryFilteredRuns = useMemo(() => filterRuns(index?.runs ?? [], query, "all"), [index?.runs, query]);
  const availableToolNames = useMemo(
    () => uniqueStrings(queryFilteredRuns.flatMap((run) => run.turns.flatMap((turn) => turn.toolNames))),
    [queryFilteredRuns],
  );
  const filteredRuns = useMemo(() => filterRuns(index?.runs ?? [], query, toolFilter), [index?.runs, query, toolFilter]);

  useEffect(() => {
    if (toolFilter !== "all" && !availableToolNames.includes(toolFilter)) setToolFilter("all");
  }, [availableToolNames, toolFilter]);

  useEffect(() => {
    const selectionVisible = selection && filteredRuns.some((run) => (
      run.agentRunId === selection.agentRunId
      && run.turns.some((turn) => turn.turnId === selection.turnId)
    ));
    if (selectionVisible) return;
    const firstRun = filteredRuns[0];
    const firstTurn = firstRun?.turns[0];
    if (!firstRun || !firstTurn) {
      setSelection(null);
      return;
    }
    const call = details[firstRun.agentRunId]?.turns.find((turn) => turn.turnId === firstTurn.turnId)?.calls.at(-1);
    setSelection({ agentRunId: firstRun.agentRunId, turnId: firstTurn.turnId, llmCallId: call?.llmCallId });
    setExpandedRuns((current) => new Set(current).add(firstRun.agentRunId));
  }, [details, filteredRuns, selection]);

  const handleSelectTurn = useCallback((run: AgentAnalysisRunSummary, turn: AgentTraceTurnSummary) => {
    const detail = details[run.agentRunId];
    const call = detail?.turns.find((entry) => entry.turnId === turn.turnId)?.calls.at(-1);
    setSelection({ agentRunId: run.agentRunId, turnId: turn.turnId, llmCallId: call?.llmCallId });
    setExpandedRuns((current) => new Set(current).add(run.agentRunId));
    setMobileSidebarOpen(false);
  }, [details]);

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-analysis-canvas text-text-main" data-testid="agent-analysis-page">
      <div className="window-chrome-bar" role="presentation">
        <div className="chrome-left" />
        <div className="chrome-center" />
        <div className="chrome-right" />
      </div>
      <AnalysisHeader
        index={index}
        onBack={onBack}
        backLabel={backLabel}
      />

      {!sessionId ? (
        <EmptyState title="暂无活动会话" description="请先回到聊天并选择一个会话，再从设置打开分析观测。" onBack={onBack} backLabel={backLabel} />
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-text-faint">正在建立分析索引…</div>
      ) : error && !index ? (
        <EmptyState title="分析记录加载失败" description={error} onBack={onBack} backLabel={backLabel} />
      ) : !index?.runs.length ? (
        <EmptyState title="该会话暂无分析记录" description="新的 Agent Run 完成后，请求、响应与上下文差异会出现在这里。" onBack={onBack} backLabel={backLabel} />
      ) : (
        <div className="relative flex min-h-0 flex-1 overflow-hidden border-t border-line">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="absolute left-3 top-3 z-20 hidden h-9 items-center gap-2 rounded-act-md border border-line bg-surface px-3 text-[12px] font-medium shadow-act-soft max-[820px]:flex"
          >
            <Menu size={15} /> 用户输入与 Turn
          </button>
          <div className={`${mobileSidebarOpen ? "max-[820px]:translate-x-0" : "max-[820px]:-translate-x-full"} w-[320px] shrink-0 border-r border-line bg-surface transition-transform max-[820px]:absolute max-[820px]:inset-y-0 max-[820px]:left-0 max-[820px]:z-40 max-[820px]:w-[min(340px,calc(100vw-44px))]`}>
            <AnalysisSidebar
              runs={filteredRuns}
              availableToolNames={availableToolNames}
              selection={selection}
              expandedRuns={expandedRuns}
              query={query}
              toolFilter={toolFilter}
              onQueryChange={setQuery}
              onToolFilterChange={setToolFilter}
              onToggleRun={(agentRunId) => setExpandedRuns((current) => toggleSetValue(current, agentRunId))}
              onSelectTurn={handleSelectTurn}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
          </div>
          {mobileSidebarOpen ? (
            <button type="button" aria-label="关闭 Turn 导航" onClick={() => setMobileSidebarOpen(false)} className="absolute inset-0 z-30 hidden bg-overlay max-[820px]:block" />
          ) : null}
          <main className="min-w-0 flex-1 overflow-y-auto px-5 py-4 max-[820px]:px-3 max-[820px]:pb-4 max-[820px]:pt-14">
            {error ? <div className="mb-3 rounded-act-md border border-danger bg-danger-soft px-3 py-2 text-[12px] text-on-danger">{error}</div> : null}
            {!filteredRuns.length ? (
              <div className="flex min-h-[320px] items-center justify-center text-[13px] text-text-faint">没有符合当前搜索和 Tools 筛选条件的 Turn。</div>
            ) : loadingRunId === selection?.agentRunId || !selectedDetail ? (
              <div className="flex min-h-[320px] items-center justify-center text-[13px] text-text-faint">正在读取 Agent Run Trace…</div>
            ) : selectedTurn && selectedCall ? (
              <AnalysisDetail
                turn={selectedTurn}
                call={selectedCall}
                traceTruncated={selectedDetail.trace.truncated}
                canCompare={selectedCallIndex > 0}
                onSelectCall={(llmCallId) => setSelection((current) => current ? { ...current, llmCallId } : current)}
                onOpenDiff={() => setDiffOpen(true)}
                onOpenJson={() => setCodeModal({ title: "请求 JSON", content: JSON.stringify(selectedCall.request, null, 2), language: "json" })}
                onOpenCurl={() => setCodeModal({ title: "脱敏 cURL", content: createSanitizedCurl(selectedCall), language: "shell" })}
              />
            ) : (
              <div className="flex min-h-[320px] items-center justify-center text-[13px] text-text-faint">该 Turn 没有可读取的 LLM Call。</div>
            )}
          </main>
        </div>
      )}

      {codeModal ? <CodeViewerModal modal={codeModal} onClose={() => setCodeModal(null)} /> : null}
      {diffOpen && selectedDetail && selectedCall ? (
        <RequestDiffModal
          calls={selectedDetail.calls}
          initialCurrentCallId={selectedCall.llmCallId}
          onClose={() => setDiffOpen(false)}
        />
      ) : null}
    </div>
  );
}

function AnalysisHeader({
  index,
  onBack,
  backLabel,
}: {
  index: AgentAnalysisIndexResult | null;
  onBack: () => void;
  backLabel: string;
}) {
  const totals = index?.totals;
  return (
    <header className="flex min-h-[64px] shrink-0 items-center gap-4 bg-surface px-5 pt-[var(--window-chrome-strip-height)] max-[900px]:gap-3 max-[900px]:px-3">
      <AnalysisBackButton label={backLabel} onClick={onBack} iconOnly />
      <h1 className="min-w-[72px] shrink-0 text-[16px] font-semibold">分析观测</h1>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-6 overflow-x-auto whitespace-nowrap py-2 max-[900px]:justify-start">
        <Stat label="Agent Run" value={totals?.agentRunCount} />
        <Stat label="Turn" value={totals?.turnCount} />
        <Stat label="LLM Call" value={totals?.llmCallCount} />
        <Stat label="API Token" value={totals ? totals.inputTokens + totals.outputTokens : undefined} accent />
        <Stat label="耗时" value={totals ? formatDuration(totals.durationMs) : undefined} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex h-8 items-center gap-1.5 rounded-act-pill bg-surface-subtle px-3 text-[11px] font-medium text-text-muted" title="Trace 数据来自本机"><Activity size={13} /> 本地</span>
      </div>
    </header>
  );
}

function Stat({ label, value, accent = false }: { label: string; value?: number | string; accent?: boolean }) {
  return <div className="leading-tight"><div className="text-[9px] uppercase tracking-[0.08em] text-text-faint">{label}</div><div className={`mt-0.5 font-mono text-[12px] font-semibold ${accent ? "text-operational" : "text-text-main"}`}>{typeof value === "number" ? formatNumber(value) : value ?? "—"}</div></div>;
}

function AnalysisSidebar({
  runs,
  availableToolNames,
  selection,
  expandedRuns,
  query,
  toolFilter,
  onQueryChange,
  onToolFilterChange,
  onToggleRun,
  onSelectTurn,
  onCloseMobile,
}: {
  runs: AgentAnalysisRunSummary[];
  availableToolNames: string[];
  selection: Selection | null;
  expandedRuns: Set<string>;
  query: string;
  toolFilter: string;
  onQueryChange: (value: string) => void;
  onToolFilterChange: (value: string) => void;
  onToggleRun: (agentRunId: string) => void;
  onSelectTurn: (run: AgentAnalysisRunSummary, turn: AgentTraceTurnSummary) => void;
  onCloseMobile: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line p-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索用户输入、模型、工具或 Turn…" className="h-10 w-full rounded-act-md border border-line bg-surface pl-9 pr-3 text-[12px] outline-none focus:border-line-strong focus:ring-2 focus:ring-focus-ring" />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            aria-label="筛选工具"
            aria-expanded={filtersOpen}
            title="筛选工具"
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-act-md border transition-colors duration-[160ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${filtersOpen || toolFilter !== "all" ? "border-line-strong bg-selected text-text-main" : "border-line bg-surface text-text-muted hover:bg-hover-overlay"}`}
          >
            <SlidersHorizontal size={15} />
            {toolFilter !== "all" ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-operational" aria-hidden="true" /> : null}
          </button>
        </div>
        {filtersOpen ? (
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-center justify-between text-[10px] font-semibold text-text-muted"><span>工具筛选</span><span className="font-normal text-text-faint">匹配包含该工具的 Turn</span></div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["all", ...availableToolNames].map((tool) => (
                <button key={tool} type="button" onClick={() => onToolFilterChange(tool)} className={`min-h-7 rounded-act-pill border px-2.5 py-1 font-mono text-[10px] transition-colors duration-[160ms] ${toolFilter === tool ? "border-info bg-analysis-selection-soft text-on-info" : "border-line bg-surface text-text-muted hover:bg-hover-overlay"}`}>{tool === "all" ? "All" : tool}</button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <button type="button" onClick={onCloseMobile} aria-label="关闭导航" className="absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-act-md hover:bg-hover-overlay max-[820px]:flex"><X size={15} /></button>
        {runs.length ? runs.map((run, runIndex) => {
          const expanded = expandedRuns.has(run.agentRunId);
          const runStatus = run.truncated
            ? { label: "已截断", dot: "bg-warning", text: "text-on-warning" }
            : run.status === "recording"
              ? { label: "记录中", dot: "bg-operational", text: "text-on-success" }
              : run.status === "failed"
                ? { label: "失败", dot: "bg-danger", text: "text-on-danger" }
                : { label: "完成", dot: "bg-success", text: "text-on-success" };
          return (
            <section key={run.agentRunId} className="border-b border-line">
              <button type="button" onClick={() => onToggleRun(run.agentRunId)} aria-expanded={expanded} className="flex w-full items-center gap-2 bg-surface px-3 py-3 text-left transition-colors duration-[160ms] hover:bg-hover-overlay">
                <span className={`h-2 w-2 shrink-0 rounded-full ${runStatus.dot}`} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">用户输入 {runs.length - runIndex} · {run.userMessagePreview}</span>
                <span className={`text-[9px] font-semibold ${runStatus.text}`}>{runStatus.label}</span>
                <span className="font-mono text-[10px] text-text-faint">{run.turnCount}</span>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expanded ? run.turns.map((turn) => {
                const selected = selection?.agentRunId === run.agentRunId && selection.turnId === turn.turnId;
                return (
                  <button key={turn.turnId} type="button" onClick={() => onSelectTurn(run, turn)} className={`w-full border-l-[3px] px-4 py-3 text-left transition-colors duration-[160ms] ${selected ? "border-info bg-analysis-selection-soft" : "border-transparent bg-surface hover:bg-hover-overlay"}`}>
                    <div className="flex items-center gap-2"><strong className="text-[13px]">Turn {turn.turnIndex}</strong>{turn.llmCallCount > 1 ? <span className="rounded-act-pill bg-analysis-tool-soft px-2 py-0.5 text-[9px] font-semibold text-chart-series-3">{turn.llmCallCount} calls</span> : null}<span className="ml-auto rounded-act-sm bg-surface-subtle px-1.5 py-0.5 text-[9px] text-text-muted">{turn.modelNames[0] ?? "模型未知"}</span></div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-text-muted"><span>{formatNumber(turn.inputTokens + turn.outputTokens)} tok</span><span className="text-text-faint">{formatDuration(turn.durationMs)}</span><span className="ml-auto text-text-faint">{formatTime(turn.startedAt)}</span></div>
                    <div className="mt-1 truncate font-mono text-[9px] text-text-faint">POST /chat/completions</div>
                  </button>
                );
              }) : null}
            </section>
          );
        }) : <div className="px-4 py-10 text-center text-[12px] text-text-faint">没有符合筛选条件的 Turn。</div>}
      </div>
    </aside>
  );
}

function AnalysisDetail({
  turn,
  call,
  traceTruncated,
  canCompare,
  onSelectCall,
  onOpenDiff,
  onOpenJson,
  onOpenCurl,
}: {
  turn: AnalysisRunDetail["turns"][number];
  call: AnalysisCallView;
  traceTruncated: boolean;
  canCompare: boolean;
  onSelectCall: (llmCallId: string) => void;
  onOpenDiff: () => void;
  onOpenJson: () => void;
  onOpenCurl: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[1180px]">
      {traceTruncated ? <div className="mb-3 rounded-act-md border border-warning bg-warning-soft px-3 py-2 text-[12px] text-on-warning">该 Agent Run 的 Trace 已达到体积上限，后续请求内容可能不完整。</div> : null}
      <section className="overflow-hidden rounded-act-lg border border-line bg-surface">
        <div className="px-4 py-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-semibold">Turn {turn.turnIndex}</h2>
                <span className="rounded-act-sm bg-surface-subtle px-2 py-1 text-[10px] text-text-muted">{call.model ?? "模型未知"}</span>
              </div>
              <p className="mt-1 text-[10px] text-text-faint">当前 LLM Call 的响应、请求上下文与脱敏原始数据</p>
            </div>
            <ActionButton icon={<GitCompareArrows size={14} />} label="对比上次" onClick={onOpenDiff} disabled={!canCompare} />
          </div>
        </div>

        {turn.calls.length > 1 ? (
          <div className="flex items-center gap-2 border-t border-line px-4 py-3"><span className="mr-1 text-[10px] font-semibold text-text-faint">LLM Call</span>{turn.calls.map((entry, index) => <button key={entry.llmCallId} type="button" onClick={() => onSelectCall(entry.llmCallId)} className={`rounded-act-md border px-3 py-2 text-[11px] font-medium ${entry.llmCallId === call.llmCallId ? "border-operational bg-analysis-assistant-soft text-on-success" : entry.status === "failed" || entry.status === "retried" ? "border-danger bg-danger-soft text-on-danger" : "border-line bg-surface text-text-muted"}`}><span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${entry.status === "failed" || entry.status === "retried" ? "bg-danger" : "bg-operational"}`} />调用 {index + 1}{entry.status === "retried" ? " · 重试" : entry.status === "failed" ? " · 失败" : ""}</button>)}</div>
        ) : null}

        <div className="flex overflow-x-auto border-t border-line bg-surface-subtle px-4 py-3">
          <CallMetric label="输入 Token" value={formatNumber(call.usage.input)} />
          <CallMetric label="输出 Token" value={formatNumber(call.usage.output)} />
          <CallMetric label="缓存读取" value={formatNumber(call.usage.cacheRead)} />
          <CallMetric label="缓存命中" value={formatCacheRate(call.usage.input, call.usage.cacheRead)} />
          <CallMetric label="耗时" value={formatDuration(call.durationMs)} />
          <CallMetric label="Attempt" value={String(call.attempt)} />
          <CallMetric label="Provider" value={call.provider ?? "—"} />
          <CallMetric label="Stop" value={call.stopReason ?? call.status} />
        </div>

        <div className="border-t border-line">
          <Accordion title="响应" badge={call.stopReason ?? call.status} defaultOpen><ResponseView call={call} /></Accordion>
          <div className="border-b border-line bg-surface-subtle px-4 py-2 text-[10px] font-semibold text-text-faint">请求上下文</div>
          <Accordion title="消息" badge={`${call.messages.length} 条`}><div className="space-y-2">{call.messages.map((message, index) => <MessageCard key={index} message={message} />)}</div></Accordion>
          <Accordion title="系统提示词" badge={`${call.systemPrompt.length} chars`}><Preformatted value={call.systemPrompt || "该请求没有独立 system prompt。"} /></Accordion>
          <Accordion title="工具定义" badge={`${call.tools.length} 个`}><ToolDefinitions tools={call.tools} /></Accordion>
          <div className="border-b border-line bg-surface-subtle px-4 py-2 text-[10px] font-semibold text-text-faint">开发者数据</div>
          <Accordion title="原始数据" badge="JSON · cURL · Trace">
            <div className="mb-3 flex flex-wrap gap-2">
              <ActionButton icon={<Braces size={14} />} label="请求 JSON" onClick={onOpenJson} />
              <ActionButton icon={<Code2 size={14} />} label="cURL" onClick={onOpenCurl} />
            </div>
            <Preformatted value={JSON.stringify({ request: call.request, response: call.response }, null, 2)} />
          </Accordion>
        </div>
      </section>
    </div>
  );
}

function ToolDefinitions({ tools }: { tools: AnalysisToolView[] }) {
  if (!tools.length) return <div className="text-[12px] text-text-faint">该请求没有声明工具。</div>;
  return <div className="overflow-hidden rounded-act-md border border-line">{tools.map((tool) => {
    const parameterCount = Object.keys(asRecord(tool.parameters.properties)).length;
    return <details key={tool.name} className="group border-b border-line last:border-b-0"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 transition-colors duration-[160ms] hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"><ChevronRight size={14} className="shrink-0 text-text-faint transition-transform duration-[160ms] group-open:rotate-90" /><strong className="shrink-0 font-mono text-[12px] text-info">{tool.name}</strong><span className="min-w-0 flex-1 truncate text-[11px] text-text-muted">{tool.description}</span><span className="shrink-0 rounded-act-pill bg-surface-subtle px-2 py-1 font-mono text-[9px] text-text-faint">{parameterCount} 参数</span></summary><div className="border-t border-line"><p className="px-3 py-2 text-[11px] leading-5 text-text-muted">{tool.description}</p><ParameterList schema={tool.parameters} /></div></details>;
  })}</div>;
}

function ParameterList({ schema }: { schema: Record<string, unknown> }) {
  const properties = asRecord(schema.properties);
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((entry): entry is string => typeof entry === "string") : []);
  if (!Object.keys(properties).length) return <div className="px-3 py-3 text-[11px] text-text-faint">无参数</div>;
  return <div className="divide-y divide-line border-t border-line">{Object.entries(properties).map(([name, value]) => { const parameter = asRecord(value); return <div key={name} className="bg-analysis-thinking-soft px-3 py-2.5"><div className="flex items-center gap-2"><strong className="font-mono text-[11px] text-info">{name}</strong><span className="rounded-act-xs bg-surface px-1.5 py-0.5 font-mono text-[9px] text-text-muted">{String(parameter.type ?? "unknown")}</span>{required.has(name) ? <span className="text-[9px] font-semibold text-danger">必填</span> : null}</div>{parameter.description ? <p className="mt-1 text-[11px] leading-5 text-text-muted">{String(parameter.description)}</p> : null}{parameter.enum ? <p className="mt-1 font-mono text-[9px] text-text-faint">enum: {JSON.stringify(parameter.enum)}</p> : null}</div>; })}</div>;
}

function MessageCard({ message, diffState }: { message: AnalysisMessageView; diffState?: "added" | "removed" }) {
  const roleClass = message.role === "user" ? "bg-analysis-user-soft border-info" : message.role === "assistant" ? "bg-analysis-assistant-soft border-operational" : message.role === "toolResult" ? "bg-analysis-tool-soft border-chart-series-3" : "bg-analysis-thinking-soft border-line-strong";
  const diffClass = diffState === "added" ? "ring-1 ring-operational" : diffState === "removed" ? "ring-1 ring-danger" : "";
  return <article className={`relative rounded-act-md border px-3 py-3 ${roleClass} ${diffClass}`}>{diffState ? <span className={`absolute right-0 top-0 rounded-bl-act-sm rounded-tr-act-md px-2 py-1 text-[9px] font-semibold ${diffState === "added" ? "bg-operational text-on-operational" : "bg-danger text-on-danger-solid"}`}>{diffState === "added" ? "新增" : "移除"}</span> : null}<div className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-muted">{message.label}{message.toolName ? ` · ${message.toolName}` : ""}</div><pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-text-main">{messageText(message)}</pre></article>;
}

function ResponseView({ call }: { call: AnalysisCallView }) {
  if (call.error !== undefined) {
    return <div className="rounded-act-md border border-danger bg-danger-soft px-3 py-3"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-on-danger">Error</div><pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-on-danger">{typeof call.error === "string" ? call.error : JSON.stringify(call.error, null, 2)}</pre></div>;
  }
  const blocks = responseContent(call);
  if (!blocks.length) return <div className="text-[12px] text-text-faint">该调用没有可展示的响应内容。</div>;
  return <div className="space-y-3">{blocks.map((entry, index) => { const block = asRecord(entry); if (block.type === "thinking") return <div key={index} className="rounded-act-md border border-line bg-analysis-thinking-soft px-3 py-3"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-text-faint">Thinking</div><pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-text-muted">{String(block.thinking ?? "")}</pre></div>; if (block.type === "text") return <div key={index} className="px-1"><MarkdownProse content={String(block.text ?? "")} /></div>; if (block.type === "toolCall") return <div key={index} className="rounded-act-md border border-chart-series-3 bg-analysis-tool-soft px-3 py-3"><div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-chart-series-3">Tool Call · {String(block.name ?? "unknown")}</div><pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-5">{JSON.stringify(block.arguments ?? {}, null, 2)}</pre></div>; return <Preformatted key={index} value={JSON.stringify(entry, null, 2)} />; })}</div>;
}

function Accordion({ title, badge, defaultOpen = false, children }: { title: string; badge?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className="border-b border-line bg-surface last:border-b-0"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left transition-colors duration-[160ms] hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong className="text-[13px]">{title}</strong>{badge ? <span className="ml-auto rounded-act-pill bg-surface-subtle px-2 py-1 text-[9px] text-text-faint">{badge}</span> : null}</button>{open ? <div className="border-t border-line p-3">{children}</div> : null}</section>;
}

function RequestDiffModal({ calls, initialCurrentCallId, onClose }: { calls: AnalysisCallView[]; initialCurrentCallId: string; onClose: () => void }) {
  const initialIndex = calls.findIndex((call) => call.llmCallId === initialCurrentCallId);
  const [currentIndex, setCurrentIndex] = useState(Math.max(1, initialIndex));
  const current = calls[currentIndex];
  const previous = calls[currentIndex - 1];
  if (!current || !previous) return null;
  const diff = diffAnalysisRequests(previous, current);
  const title = `${formatDiffCallLabel(previous, calls)} → ${formatDiffCallLabel(current, calls)}`;
  return <ModalShell onClose={onClose}><div className="flex h-full min-h-0 flex-col"><div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3"><button type="button" onClick={() => setCurrentIndex((value) => Math.max(1, value - 1))} disabled={currentIndex <= 1} aria-label="查看上一组请求对比" title="上一组请求对比" className="flex h-8 w-8 items-center justify-center rounded-act-md border border-line text-text-muted hover:bg-hover-overlay hover:text-text-main disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft size={15} /></button><h2 className="min-w-0 text-[15px] font-semibold">{title}</h2><button type="button" onClick={() => setCurrentIndex((value) => Math.min(calls.length - 1, value + 1))} disabled={currentIndex >= calls.length - 1} aria-label="查看下一组请求对比" title="下一组请求对比" className="flex h-8 w-8 items-center justify-center rounded-act-md border border-line text-text-muted hover:bg-hover-overlay hover:text-text-main disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight size={15} /></button><button type="button" onClick={onClose} aria-label="关闭请求对比" className="ml-auto flex h-9 w-9 items-center justify-center rounded-act-md border border-line hover:bg-hover-overlay"><X size={15} /></button></div><div className="flex flex-wrap gap-5 border-b border-line bg-surface-subtle px-5 py-3 font-mono text-[10px]"><span>输入 Token <strong>{signed(current.usage.input - previous.usage.input)}</strong></span><span>缓存读取 <strong>{signed(current.usage.cacheRead - previous.usage.cacheRead)}</strong></span><span>消息 <strong>{previous.messages.length} → {current.messages.length}</strong></span><span>工具 <strong>{previous.tools.length} → {current.tools.length}</strong></span><span>Attempt <strong>{previous.attempt} → {current.attempt}</strong></span></div><div className="min-h-0 flex-1 overflow-y-auto bg-analysis-canvas p-4"><div className="space-y-4">{diff.requestContextUnchanged ? <div className="rounded-act-md border border-line bg-analysis-thinking-soft px-4 py-4 text-center text-[12px] text-text-muted">请求上下文未变化；本次差异只来自 Attempt、耗时或上次失败状态。</div> : null}<section className="rounded-act-lg border border-line bg-surface p-3"><div className="mb-3 flex items-center gap-2 text-[12px] font-semibold">消息 <span className="rounded-act-pill bg-analysis-assistant-soft px-2 py-1 text-[9px] text-on-success">+{diff.addedMessages.length} 新增</span>{diff.removedMessages.length ? <span className="rounded-act-pill bg-danger-soft px-2 py-1 text-[9px] text-on-danger">-{diff.removedMessages.length} 移除</span> : null}</div>{diff.unchangedMessageCount ? <div className="mb-3 rounded-act-md bg-analysis-thinking-soft px-3 py-2 text-[10px] text-text-faint">前 {diff.unchangedMessageCount} 条消息未变化</div> : null}<div className="space-y-2">{diff.removedMessages.map((message, index) => <MessageCard key={`removed-${index}`} message={message} diffState="removed" />)}{diff.addedMessages.map((message, index) => <MessageCard key={`added-${index}`} message={message} diffState="added" />)}</div></section>{diff.systemPromptChanged || diff.toolsChanged || diff.modelChanged ? <section className="rounded-act-lg border border-line bg-surface p-3"><h3 className="mb-3 text-[12px] font-semibold">其他请求变化</h3><div className="space-y-2">{diff.modelChanged ? <DiffPair label="模型" previous={diff.previousModel ?? "—"} current={diff.currentModel ?? "—"} /> : null}{diff.toolsChanged ? <DiffPair label="工具定义" previous={diff.previousTools.join(", ") || "—"} current={diff.currentTools.join(", ") || "—"} /> : null}{diff.systemPromptChanged ? <DiffPair label="系统提示词" previous={diff.previousSystemPrompt || "—"} current={diff.currentSystemPrompt || "—"} multiline /> : null}</div></section> : null}</div></div></div></ModalShell>;
}

function DiffPair({ label, previous, current, multiline = false }: { label: string; previous: string; current: string; multiline?: boolean }) {
  return <div className="overflow-hidden rounded-act-md border border-line"><div className="bg-surface-subtle px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-text-faint">{label}</div><div className="grid grid-cols-2"><pre className={`${multiline ? "max-h-52 overflow-auto" : ""} whitespace-pre-wrap break-words bg-danger-soft px-3 py-3 font-mono text-[10px] text-on-danger`}>− {previous}</pre><pre className={`${multiline ? "max-h-52 overflow-auto" : ""} whitespace-pre-wrap break-words bg-analysis-assistant-soft px-3 py-3 font-mono text-[10px] text-on-success`}>+ {current}</pre></div></div>;
}

function CodeViewerModal({ modal, onClose }: { modal: NonNullable<CodeModal>; onClose: () => void }) {
  return <ModalShell compact onClose={onClose}><div className="flex h-full min-h-0 flex-col"><div className="flex items-center border-b border-line px-4 py-3"><h2 className="text-[14px] font-semibold">{modal.title}</h2><button type="button" onClick={() => void navigator.clipboard?.writeText(modal.content)} className="ml-auto flex h-8 items-center gap-1.5 rounded-act-md border border-line px-2.5 text-[10px] hover:bg-hover-overlay"><Copy size={13} />复制</button><button type="button" onClick={onClose} aria-label={`关闭${modal.title}`} className="ml-2 flex h-8 w-8 items-center justify-center rounded-act-md border border-line hover:bg-hover-overlay"><X size={14} /></button></div><pre className="min-h-0 flex-1 overflow-auto bg-analysis-thinking-soft p-4 font-mono text-[11px] leading-5 text-text-main">{modal.content}</pre>{modal.language === "shell" ? <div className="border-t border-line bg-warning-soft px-4 py-2 text-[10px] text-on-warning">已脱敏：请自行补充 BASE_URL 与 API_KEY。当前内容基于 ActSpace 规范化请求快照，不等同于供应商原始 HTTP wire payload。</div> : null}</div></ModalShell>;
}

function ModalShell({ children, onClose, compact = false }: { children: ReactNode; onClose: () => void; compact?: boolean }) {
  const { dialogRef, trapTabKey } = useDialogFocusTrap();
  useEffect(() => { dialogRef.current?.focus(); }, [dialogRef]);
  return <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-5 outline-none max-[700px]:p-0" role="dialog" aria-label="分析观测详情弹窗" aria-modal="true" onKeyDown={(event) => { if (event.key === "Escape") onClose(); else trapTabKey(event); }}><button type="button" aria-label="关闭弹窗" onClick={onClose} className="absolute inset-0" /><div className={`relative overflow-hidden rounded-act-xl border border-line bg-surface shadow-act-float max-[700px]:h-full max-[700px]:w-full max-[700px]:rounded-none ${compact ? "h-[min(760px,86vh)] w-[min(960px,92vw)]" : "h-[min(820px,88vh)] w-[min(1400px,94vw)]"}`}>{children}</div></div>;
}

function ActionButton({ icon, label, onClick, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="flex h-9 items-center gap-1.5 rounded-act-md border border-line bg-surface px-3 text-[11px] font-medium hover:bg-hover-overlay disabled:cursor-not-allowed disabled:opacity-40">{icon}{label}</button>;
}

function CallMetric({ label, value }: { label: string; value: string }) { return <div className="min-w-[108px] shrink-0 border-l border-line px-4 first:border-l-0 first:pl-0"><div className="text-[9px] text-text-faint">{label}</div><div className="mt-1 truncate font-mono text-[11px] font-semibold tabular-nums text-text-main">{value}</div></div>; }
function Preformatted({ value }: { value: string }) { return <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-act-md bg-analysis-thinking-soft p-3 font-mono text-[11px] leading-5 text-text-main">{value}</pre>; }
function EmptyState({ title, description, onBack, backLabel }: { title: string; description: string; onBack: () => void; backLabel: string }) { return <div className="flex flex-1 items-center justify-center px-6"><div className="max-w-md text-center"><Activity size={30} className="mx-auto text-text-faint" /><h2 className="mt-4 text-[17px] font-semibold">{title}</h2><p className="mt-2 text-[12px] leading-5 text-text-muted">{description}</p><button type="button" onClick={onBack} className="mt-5 rounded-act-md bg-action px-4 py-2 text-[12px] font-semibold text-on-action">{backLabel}</button></div></div>; }
function filterRuns(runs: AgentAnalysisRunSummary[], query: string, toolFilter: string): AgentAnalysisRunSummary[] { const normalized = query.trim().toLowerCase(); return runs.map((run) => ({ ...run, turns: run.turns.filter((turn) => { const toolMatches = toolFilter === "all" || turn.toolNames.includes(toolFilter); const queryMatches = !normalized || run.userMessagePreview.toLowerCase().includes(normalized) || turn.modelNames.some((model) => model.toLowerCase().includes(normalized)) || turn.toolNames.some((tool) => tool.toLowerCase().includes(normalized)) || `turn ${turn.turnIndex}`.includes(normalized); return toolMatches && queryMatches; }) })).filter((run) => run.turns.length > 0); }
function toggleSetValue(current: Set<string>, value: string): Set<string> { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function formatNumber(value: number): string { return new Intl.NumberFormat("zh-CN").format(value); }
function formatDuration(value: number): string { if (!value) return "—"; return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`; }
function formatCacheRate(input: number, cacheRead: number): string { return input > 0 ? `${Math.min(100, Math.round((cacheRead / input) * 100))}%` : "—"; }
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function signed(value: number): string { return value > 0 ? `+${formatNumber(value)}` : formatNumber(value); }
function formatDiffCallLabel(call: AnalysisCallView, calls: AnalysisCallView[]): string { const turnCalls = calls.filter((entry) => entry.turnId === call.turnId); if (turnCalls.length <= 1) return `Turn ${call.turnIndex}`; return `Turn ${call.turnIndex} · 调用 ${turnCalls.findIndex((entry) => entry.llmCallId === call.llmCallId) + 1}`; }
function uniqueStrings(values: string[]): string[] { return [...new Set(values)]; }
