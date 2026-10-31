import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { createMessageBlocks, type MessageBlock } from "@actspace/shared";
import { AgentAvatar, AgentStatus, agentModelLabel } from "../messages/AgentIdentity";
import { MarkdownProse } from "../messages/MarkdownProse";
import { renderMessageList } from "../conversation/render-message";
import { sessionsApi } from "../../api/sessions";
import { SessionViewToggle, type SessionMainView } from "../SessionViewToggle";
import { TrajectoryView } from "../TrajectoryView";
import type { SubagentFocus } from "./RightPanelContext";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;
// 运行中持续轮询；结束后记录可能拉取失败（父会话还在输出时主进程繁忙），拿到非空结果前继续重试，最多这么多次。
const COMPLETED_TRANSCRIPT_RETRIES = 20;
const buttonClass = "w-full rounded-act-md px-3 py-3 text-left hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring";

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
    <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
      <IconButton label="返回子 Agent 列表" tooltip="返回" onClick={() => setSelection(undefined)}><ArrowLeft size={16} /></IconButton>
      <SessionViewToggle view={view} onToggle={() => setView((current) => current === "chat" ? "trajectory" : "chat")} />
      <AgentAvatar message={active} size={28} />
      <div className="min-w-0 flex-1"><h2 className="m-0 truncate text-act-sm font-medium" title={active.description}>{active.description}</h2><p className="m-0 mt-1 flex min-w-0 items-center gap-2 text-act-xs text-text-muted"><span>{kindLabel(active)}</span>{agentModelLabel(active) ? <><span aria-hidden="true">·</span><span className="min-w-0 truncate" title={active.model}>{agentModelLabel(active)}</span></> : null}<span aria-hidden="true">·</span><AgentStatus status={active.status} /></p></div>
    </header>
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
  return <section className="h-full overflow-y-auto p-4" aria-label="子 Agent 列表">
    {error ? <p role="status" className="text-act-xs text-text-muted">{error}</p> : null}
    {missingChild ? <p role="status" className="mb-3 px-3 text-act-xs text-text-muted">找不到这个子智能体。</p> : null}
    {([true, false] as const).map((running) => {
      const items = agents.filter((agent) => (agent.status === "running") === running);
      if (!items.length) return null;
      return <div key={String(running)} className="mb-6"><h2 className="mb-2 px-3 text-act-xs font-normal text-text-faint">{running ? "运行中" : "已结束"} · {items.length}</h2>
        {items.map((agent) => <button key={agent.id} type="button" className={buttonClass} onClick={() => { setSelection(agent); setView("chat"); setMissingChild(false); }}>
          <span className="flex items-center gap-3">
            <AgentAvatar message={agent} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-act-sm text-text-main" title={agent.description}>{agent.description}</span>
              <span className="mt-1 flex min-w-0 items-center gap-1.5 text-act-xs text-text-muted">
                <AgentStatus status={agent.status} /><span aria-hidden="true">·</span><span>{kindLabel(agent)}</span>
                {agentModelLabel(agent) ? <><span aria-hidden="true">·</span><span className="min-w-0 truncate" title={agent.model}>{agentModelLabel(agent)}</span></> : null}
                <span aria-hidden="true">·</span><span className="text-text-faint">{Math.floor((agent.stats?.durationMs ?? 0) / 1000)}s</span>
              </span>
            </span>
          </span>
        </button>)}
      </div>;
    })}
    {!agents.length && !error ? <p className="px-3 text-act-sm text-text-muted">此会话还没有子智能体。</p> : null}
  </section>;
}

function kindLabel(agent: AgentMessage): string { return agent.agentKind === "agent" ? "Agent" : "Explore"; }
