import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createMessageBlocks, type MessageBlock } from "@actspace/shared";
import { AgentAvatar, AgentStatus } from "../messages/AgentIdentity";
import { renderMessage } from "../ConversationView";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;
const buttonClass = "w-full rounded-act-md px-3 py-3 text-left hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring";

export function SubagentsPanel({ sessionId, selected }: { sessionId: string | null; selected?: AgentMessage }) {
  const [agents, setAgents] = useState<AgentMessage[]>([]);
  const [selection, setSelection] = useState<AgentMessage | undefined>(selected);
  const [messages, setMessages] = useState<MessageBlock[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => { setSelection(selected); }, [selected]);
  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const items = await window.actspace?.getSubagents?.({ sessionId: sessionId! });
        if (!disposed && items) { setAgents(items.filter((item): item is AgentMessage => item.kind === "agent")); setError(undefined); }
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
  useEffect(() => {
    setMessages([]);
    if (!childId || !active?.transcriptRef) return;
    const ref = active.transcriptRef;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const events = await window.actspace?.getSubAgentTranscript?.({ transcriptRef: ref });
        if (!disposed && events) { setMessages(createMessageBlocks(events)); setError(undefined); }
      } catch { if (!disposed) setError("执行记录暂不可用，正在重试。"); }
      finally { if (!disposed && active?.status === "running") timer = setTimeout(refresh, 750); }
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [childId, active?.status]);
  if (!sessionId) return <p className="p-5 text-[13px] text-text-muted">选择会话查看子 Agent。</p>;
  if (active) return <section className="flex h-full min-h-0 flex-col" aria-label="子 Agent 详情">
    <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
      <button type="button" aria-label="返回子 Agent 列表" className="rounded-act-md p-1.5 hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring" onClick={() => setSelection(undefined)}><ArrowLeft size={16} /></button>
      <AgentAvatar message={active} size={28} />
      <div className="min-w-0 flex-1"><h2 className="m-0 truncate text-[13px] font-medium" title={active.description}>{active.description}</h2><p className="m-0 mt-1 flex items-center gap-2 text-[12px] text-text-muted"><span>{kindLabel(active)}</span><span aria-hidden="true">·</span><AgentStatus status={active.status} /></p></div>
    </header>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-label="子 Agent 执行内容">
      {error ? <p role="status" className="text-[12px] text-text-muted">{error}</p> : null}
      {messages.map((message) => renderMessage(message))}
      {!messages.length ? <p className="text-[13px] text-text-muted">{active.summary || "等待执行…"}</p> : null}
    </div>
  </section>;
  return <section className="h-full overflow-y-auto p-4" aria-label="子 Agent 列表">
    {error ? <p role="status" className="text-[12px] text-text-muted">{error}</p> : null}
    {([true, false] as const).map((running) => {
      const items = agents.filter((agent) => (agent.status === "running") === running);
      if (!items.length) return null;
      return <div key={String(running)} className="mb-6"><h2 className="mb-2 px-3 text-[12px] font-normal text-text-faint">{running ? "运行中" : "已结束"} · {items.length}</h2>
        {items.map((agent) => <button key={agent.id} type="button" className={buttonClass} onClick={() => setSelection(agent)}>
          <span className="flex items-center gap-3">
            <AgentAvatar message={agent} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-text-main" title={agent.description}>{agent.description}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[12px] text-text-muted">
                <AgentStatus status={agent.status} /><span aria-hidden="true">·</span><span>{kindLabel(agent)}</span>
                <span aria-hidden="true">·</span><span className="text-text-faint">{Math.floor((agent.stats?.durationMs ?? 0) / 1000)}s</span>
              </span>
            </span>
          </span>
        </button>)}
      </div>;
    })}
    {!agents.length && !error ? <p className="px-3 text-[13px] text-text-muted">此会话还没有子智能体。</p> : null}
  </section>;
}

function kindLabel(agent: AgentMessage): string { return agent.agentKind === "agent" ? "Agent" : "Explore"; }
