import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { createMessageBlocks, type MessageBlock } from "@actspace/shared";
import { AgentAvatar, AgentStatusIcon, agentLatestActivity, agentModelLabel, agentStatusLabel, formatAgentDuration } from "../messages/AgentIdentity";
import { MarkdownProse } from "../messages/MarkdownProse";
import { renderMessageList } from "../conversation/render-message";
import { sessionsApi } from "../../api/sessions";
import { formatTokenCount } from "../../context-format";
import { SessionViewToggle, type SessionMainView } from "../SessionViewToggle";
import { TrajectoryView } from "../TrajectoryView";
import type { SubagentFocus } from "./RightPanelContext";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;
// 运行中持续轮询；结束后记录可能拉取失败（父会话还在输出时主进程繁忙），拿到非空结果前继续重试，最多这么多次。
const COMPLETED_TRANSCRIPT_RETRIES = 20;
// 列表行：设置页分组卡里的一行，规范见 docs/design-docs/frontend/front-子Agent列表与详情顶部栏.md。
const rowClass = "flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

export function SubagentsPanel({ sessionId, selected, focus }: { sessionId: string | null; selected?: AgentMessage; focus?: SubagentFocus }) {
  const [agents, setAgents] = useState<AgentMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<AgentMessage | undefined>(selected);
  // 对话 / 轨迹：从列表或对话卡片进来看对话，从轨迹详情「查看轨迹」进来看轨迹。
  const [view, setView] = useState<SessionMainView>(focus?.view ?? "chat");
  // 等子智能体列表到了再按子会话 id 选中；找不到时回到列表并说明。
  const [pendingChild, setPendingChild] = useState<string | undefined>(focus?.childSessionId);
  const [missingChild, setMissingChild] = useState(false);
  const [messages, setMessages] = useState<MessageBlock[]>([]);
  const [error, setError] = useState<string>();
  // 执行记录的错误单独存：列表每秒轮询成功时会清掉 error，不能把这条也清掉。
  const [transcriptError, setTranscriptError] = useState<string>();
  const [transcriptSettled, setTranscriptSettled] = useState(false);
  useEffect(() => { if (selected) { setSelection(selected); setView("chat"); } }, [selected]);
  useEffect(() => {
    if (!focus) return;
    setPendingChild(focus.childSessionId);
    setView(focus.view);
  }, [focus?.revision]);
  useEffect(() => {
    if (!pendingChild || !loaded) return;
    const match = agents.find((item) => item.transcriptRef?.runId === pendingChild);
    if (match) setSelection(match);
    setMissingChild(!match);
    setPendingChild(undefined);
  }, [pendingChild, loaded, agents]);
  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const items = await sessionsApi.getSubagents({ sessionId: sessionId! });
        if (!disposed) { setAgents(items.filter((item): item is AgentMessage => item.kind === "agent")); setLoaded(true); setError(undefined); }
      } catch { if (!disposed) setError("无法加载子智能体，请稍后重试。"); }
      finally { if (!disposed) timer = setTimeout(refresh, 1000); }
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [sessionId]);
  const active = selection ? agents.find((item) => item.id === selection.id
    || (item.transcriptRef && item.transcriptRef.runId === selection.transcriptRef?.runId)
    || selection.id.endsWith(`:${item.id.replace(/^subagent:/, "")}`)) ?? selection : undefined;
  const childId = active?.transcriptRef?.runId;
  const running = active?.status === "running";
  // 只在换了子 Agent 时清空；从运行中变为结束时保留已显示的记录，不闪回摘要。
  useEffect(() => { setMessages([]); setTranscriptError(undefined); setTranscriptSettled(false); }, [childId]);
  useEffect(() => {
    if (view !== "chat" || !childId || !active?.transcriptRef) return;
    const ref = active.transcriptRef;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let retries = 0;
    async function refresh() {
      let loaded = false;
      try {
        const blocks = createMessageBlocks(await sessionsApi.getSubAgentTranscript({ transcriptRef: ref }));
        if (disposed) return;
        loaded = blocks.length > 0;
        if (loaded || running) setMessages(blocks);
        setTranscriptError(undefined);
      } catch { if (!disposed) setTranscriptError("执行记录暂不可用，正在重试。"); }
      if (disposed) return;
      if (running) { timer = setTimeout(refresh, 750); return; }
      if (!loaded && retries++ < COMPLETED_TRANSCRIPT_RETRIES) { timer = setTimeout(refresh, 1000); return; }
      setTranscriptSettled(true);
      setTranscriptError(undefined);
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [childId, running, view]);
  if (!sessionId) return <p className="p-5 text-act-sm text-text-muted">选择会话查看子 Agent。</p>;
  if (pendingChild) return <p role="status" className="p-5 text-act-sm text-text-muted">正在加载子智能体…</p>;
  if (active) return <section className="flex h-full min-h-0 flex-col" aria-label="子 Agent 详情">
    <SubagentDetailHeader agent={active} view={view} onBack={() => setSelection(undefined)} onToggleView={() => setView((current) => current === "chat" ? "trajectory" : "chat")} />
    {view === "trajectory" ? <div className="flex min-h-0 flex-1 flex-col" aria-label="子 Agent 执行轨迹">
      {childId ? <TrajectoryView sessionId={childId} variant="panel" /> : <p className="p-5 text-act-sm text-text-muted">没有执行记录。</p>}
    </div> : <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-label="子 Agent 执行内容">
      {transcriptError ? <p role="status" className="text-act-xs text-text-muted">{transcriptError}</p> : null}
      {/* 与主会话同一套消息流：去掉空的回复文本，过程 / 正文之间的间距由 message-flow 统一给。 */}
      {messages.length ? <div className="message-flow flex min-w-0 flex-col">{renderMessageList(messages, undefined, !running)}</div> : null}
      {!messages.length && (running || !transcriptSettled) ? <p className="text-act-sm text-text-muted">{running ? "等待执行…" : "正在加载执行记录…"}</p> : null}
      {/* 重试完仍拿不到记录时，退回子 Agent 的最终输出，按 Markdown 渲染。 */}
      {!messages.length && !running && transcriptSettled
        ? active.summary ? <MarkdownProse content={active.summary} /> : <p className="text-act-sm text-text-muted">没有执行记录。</p>
        : null}
    </div>}
  </section>;
  return <section className="h-full overflow-y-auto px-3 py-3.5" aria-label="子 Agent 列表">
    {error ? <p role="status" className="mb-3 px-1.5 text-act-xs text-text-muted">{error}</p> : null}
    {missingChild ? <p role="status" className="mb-3 px-1.5 text-act-xs text-text-muted">找不到这个子智能体。</p> : null}
    {([true, false] as const).map((running) => {
      const items = agents.filter((agent) => (agent.status === "running") === running);
      if (!items.length) return null;
      const title = running ? "运行中" : "已结束";
      return <div key={String(running)} className="mb-4.5" role="group" aria-label={`${title} · ${items.length}`}>
        <h2 className="mb-1.5 flex items-center justify-between px-1.5 text-act-xs font-normal text-text-faint"><span>{title}</span><span className="tabular-nums">{items.length}</span></h2>
        <div className="divide-y divide-line/60 overflow-hidden rounded-act-group border border-line bg-surface">
          {items.map((agent) => <SubagentRow key={agent.id} agent={agent} onOpen={() => { setSelection(agent); setView("chat"); setMissingChild(false); }} />)}
        </div>
      </div>;
    })}
    {!agents.length && !error ? <p className="px-1.5 text-act-sm text-text-muted">此会话还没有子智能体。</p> : null}
  </section>;
}

function SubagentRow({ agent, onOpen }: { agent: AgentMessage; onOpen: () => void }) {
  const running = agent.status === "running";
  const tokens = agent.stats?.totalTokens;
  return <button type="button" className={rowClass} onClick={onOpen}>
    <AgentAvatar message={agent} size={28} />
    <span className="flex min-w-0 flex-1 flex-col gap-px">
      <span className="truncate text-act-sm text-text-main" title={agent.description}>{agent.description}</span>
      <span className={`truncate text-act-xs ${agent.status === "failed" ? "text-on-danger" : "text-text-faint"}`}>{agentLatestActivity(agent)}</span>
    </span>
    <span className="flex shrink-0 flex-col items-end gap-0.5 text-act-xs tabular-nums text-text-faint">
      {tokens ? <span className="text-text-muted">{formatTokenCount(tokens)} <span className="text-text-faint">tokens</span></span> : null}
      <span className={`inline-flex items-center gap-1 ${running ? "text-operational" : ""}`}>{running ? <AgentStatusIcon status="running" size={12} /> : null}{formatAgentDuration(agent.stats?.durationMs ?? 0)}</span>
    </span>
  </button>;
}

function SubagentDetailHeader({ agent, view, onBack, onToggleView }: { agent: AgentMessage; view: SessionMainView; onBack: () => void; onToggleView: () => void }) {
  const model = agentModelLabel(agent);
  const timeTone = agent.status === "running" ? "text-operational" : agent.status === "failed" ? "text-on-danger" : "text-text-faint";
  const hover = [agent.description, kindLabel(agent), agent.background ? "后台" : undefined].filter(Boolean).join(" · ");
  return <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line pl-1.5 pr-2">
    <IconButton label="返回子 Agent 列表" tooltip="返回" onClick={onBack}><ChevronLeft size={16} /></IconButton>
    <div className="flex min-w-0 flex-1 items-center gap-2" title={hover}>
      <AgentAvatar message={agent} size={18} />
      <h2 className="m-0 min-w-0 truncate text-act-sm font-medium">{agent.description}</h2>
    </div>
    <span className="flex shrink-0 items-center gap-2 px-1 text-act-xs text-text-faint">
      {model ? <><span className="max-w-24 truncate text-text-muted" title={agent.model}>{model}</span><span aria-hidden="true" className="size-[3px] rounded-full bg-line-strong" /></> : null}
      <span className={`inline-flex items-center gap-1 tabular-nums ${timeTone}`}>
        <AgentStatusIcon status={agent.status} size={12} /><span className="sr-only">{agentStatusLabel(agent.status)}</span>{formatAgentDuration(agent.stats?.durationMs ?? 0)}
      </span>
    </span>
    <SessionViewToggle view={view} onToggle={onToggleView} />
  </header>;
}

function kindLabel(agent: AgentMessage): string { return agent.agentKind === "agent" ? "Agent" : "Explore"; }
