import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, FolderOpen, Square } from "lucide-react";
import { createMessageBlocks, subagentKindLabel, type MessageBlock, type SubAgentTranscriptRef, type SubagentListItem } from "@actspace/shared";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import { AgentAvatar, SubagentStatus, agentModelLabel } from "../messages/AgentIdentity";
import { MarkdownProse } from "../messages/MarkdownProse";
import { renderMessageList } from "../conversation/render-message";
import { sessionsApi } from "../../api/sessions";
import { SessionViewToggle, type SessionMainView } from "../SessionViewToggle";
import { TrajectoryView } from "../TrajectoryView";
import type { SubagentFocus } from "./RightPanelContext";

// 列表每秒轮询；结束后记录可能拉取失败（父会话还在输出时主进程繁忙），拿到非空结果前继续重试，最多这么多次。
const POLL_MS = 1000;
const COMPLETED_TRANSCRIPT_RETRIES = 20;
const rowClass = "min-w-0 flex-1 rounded-act-md px-3 py-3 text-left hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring";

/** 右侧「子 Agent」面板（设计 05 §2）：一个子智能体一行；详情按种类分支，本地 / Fork 看对话与轨迹，Codex / Claude Code 看结果与原生记录。 */
export function SubagentsPanel({ sessionId, focus }: { sessionId: string | null; focus?: SubagentFocus }) {
  const [agents, setAgents] = useState<SubagentListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  // 对话 / 轨迹：从列表、对话卡片、通知行进来看对话，从轨迹详情「查看轨迹」进来看轨迹。
  const [view, setView] = useState<SessionMainView>(focus?.view ?? "chat");
  // 等列表到了再按子智能体 id 选中；找不到时回到列表并说明。
  const [pendingAgent, setPendingAgent] = useState<string | undefined>(focus?.agentId);
  const [missingAgent, setMissingAgent] = useState(false);
  const [stopping, setStopping] = useState<string>();
  const [stopError, setStopError] = useState<string>();
  useEffect(() => {
    if (!focus) return;
    setPendingAgent(focus.agentId);
    setView(focus.view);
  }, [focus?.revision]);
  useEffect(() => {
    if (!pendingAgent || !loaded) return;
    const found = agents.some((item) => item.agentId === pendingAgent);
    setSelectedId(found ? pendingAgent : undefined);
    setMissingAgent(!found);
    setPendingAgent(undefined);
  }, [pendingAgent, loaded, agents]);
  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const items = await sessionsApi.getSubagents({ sessionId: sessionId! });
        if (!disposed) { setAgents(items); setLoaded(true); setError(undefined); }
      } catch { if (!disposed) setError("无法加载子智能体，请稍后重试。"); }
      finally { if (!disposed) timer = setTimeout(refresh, POLL_MS); }
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [sessionId]);

  async function stop(agentId: string) {
    if (!sessionId) return;
    setStopping(agentId);
    setStopError(undefined);
    try {
      const result = await sessionsApi.interruptSubagent({ sessionId, agentId });
      if (!result.ok) setStopError(result.message);
    } catch (cause) { setStopError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setStopping(undefined); }
  }

  if (!sessionId) return <p className="p-5 text-act-sm text-text-muted">选择会话查看子 Agent。</p>;
  if (pendingAgent) return <p role="status" className="p-5 text-act-sm text-text-muted">正在加载子智能体…</p>;
  const active = agents.find((item) => item.agentId === selectedId);
  if (active) {
    return <SubagentDetail
      sessionId={sessionId}
      item={active}
      view={view}
      onToggleView={() => setView((current) => current === "chat" ? "trajectory" : "chat")}
      onBack={() => { setSelectedId(undefined); setStopError(undefined); }}
      stopping={stopping === active.agentId}
      stopError={stopError}
      onStop={() => void stop(active.agentId)}
    />;
  }
  return <section className="h-full overflow-y-auto p-4" aria-label="子 Agent 列表">
    {error ? <p role="status" className="text-act-xs text-text-muted">{error}</p> : null}
    {missingAgent ? <p role="status" className="mb-3 px-3 text-act-xs text-text-muted">找不到这个子智能体。</p> : null}
    {stopError ? <p role="alert" className="mb-3 px-3 text-act-xs text-on-danger">停止失败：{stopError}</p> : null}
    {([true, false] as const).map((running) => {
      const items = agents.filter((agent) => (agent.status === "running") === running);
      if (!items.length) return null;
      return <div key={String(running)} className="mb-6"><h2 className="mb-2 px-3 text-act-xs font-normal text-text-faint">{running ? "运行中" : "其他"} · {items.length}</h2>
        {items.map((agent) => <div key={agent.agentId} className="flex items-center gap-1">
          <button type="button" className={rowClass} onClick={() => { setSelectedId(agent.agentId); setView("chat"); setMissingAgent(false); setStopError(undefined); }}>
            <span className="flex items-center gap-3">
              <AgentAvatar identity={agent.agentId} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-act-sm text-text-main" title={agent.description}>{agent.description}</span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-act-xs text-text-muted">
                  <SubagentStatus status={agent.status} /><span aria-hidden="true">·</span><span className="shrink-0">{kindLabel(agent)}</span>
                  {agentModelLabel(agent.model) ? <><span aria-hidden="true">·</span><span className="min-w-0 truncate" title={agent.model}>{agentModelLabel(agent.model)}</span></> : null}
                  {agent.activationCount > 1 ? <><span aria-hidden="true">·</span><span className="shrink-0">第 {agent.activationCount} 轮</span></> : null}
                  <span aria-hidden="true">·</span><span className="shrink-0 text-text-faint tabular-nums">{clock(agent.createdAt)}</span>
                </span>
              </span>
            </span>
          </button>
          {agent.status === "running"
            ? <IconButton label={`停止 ${agent.description}`} tooltip="停止" disabled={stopping === agent.agentId} onClick={() => void stop(agent.agentId)}><Square size={12} fill="currentColor" /></IconButton>
            : null}
        </div>)}
      </div>;
    })}
    {loaded && !agents.length && !error ? <p className="px-3 text-act-sm text-text-muted">此会话还没有子智能体。</p> : null}
  </section>;
}

function SubagentDetail({ sessionId, item, view, onToggleView, onBack, stopping, stopError, onStop }: {
  sessionId: string;
  item: SubagentListItem;
  view: SessionMainView;
  onToggleView: () => void;
  onBack: () => void;
  stopping: boolean;
  stopError?: string;
  onStop: () => void;
}) {
  const external = isExternal(item);
  const running = item.status === "running";
  const model = agentModelLabel(item.model);
  return <section className="flex h-full min-h-0 flex-col" aria-label="子 Agent 详情">
    <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
      <IconButton label="返回子 Agent 列表" tooltip="返回" onClick={onBack}><ArrowLeft size={16} /></IconButton>
      {external ? null : <SessionViewToggle view={view} onToggle={onToggleView} />}
      <AgentAvatar identity={item.agentId} size={28} />
      <div className="min-w-0 flex-1">
        <h2 className="m-0 truncate text-act-sm font-medium" title={item.description}>{item.description}</h2>
        <p className="m-0 mt-1 flex min-w-0 items-center gap-2 text-act-xs text-text-muted">
          <span className="shrink-0">{kindLabel(item)}</span>
          {model ? <><span aria-hidden="true">·</span><span className="min-w-0 truncate" title={item.model}>{model}</span></> : null}
          {item.activationCount > 1 ? <><span aria-hidden="true">·</span><span className="shrink-0">第 {item.activationCount} 轮</span></> : null}
          <span aria-hidden="true">·</span><SubagentStatus status={item.status} />
        </p>
      </div>
    </header>
    {item.kind === "fork" && item.inheritedThroughSeq !== undefined
      ? <p className="m-0 shrink-0 border-b border-line px-5 py-2 text-act-xs text-text-faint">从主会话 #{item.inheritedThroughSeq} 分出</p>
      : null}
    {external
      ? <ExternalDetail sessionId={sessionId} item={item} />
      : view === "trajectory"
        ? <div className="flex min-h-0 flex-1 flex-col" aria-label="子 Agent 执行轨迹"><TrajectoryView sessionId={item.agentId} variant="panel" afterSeq={item.inheritedThroughSeq} /></div>
        : <TranscriptDetail sessionId={sessionId} item={item} />}
    {running ? <footer className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-3 text-act-xs text-text-muted">
      <span className="flex-1">{stopError ? <span role="alert" className="text-on-danger">停止失败：{stopError}</span> : null}</span>
      <Button variant="danger" busy={stopping} disabled={stopping} onClick={onStop}>
        {stopping ? null : <Square size={11} fill="currentColor" aria-hidden="true" />}停止
      </Button>
    </footer> : null}
  </section>;
}

/** 本地 / Fork：子会话的对话记录（Fork 去掉了复制来的前缀，见 `projectSubagentTranscript`）。 */
function TranscriptDetail({ sessionId, item }: { sessionId: string; item: SubagentListItem }) {
  const [messages, setMessages] = useState<MessageBlock[]>([]);
  // 执行记录的错误单独存：列表每秒轮询成功时会清掉列表错误，不能把这条也清掉。
  const [transcriptError, setTranscriptError] = useState<string>();
  const [settled, setSettled] = useState(false);
  const running = item.status === "running";
  // 只在换了子智能体时清空；从运行中变为结束时保留已显示的记录，不闪回结论。
  useEffect(() => { setMessages([]); setTranscriptError(undefined); setSettled(false); }, [item.agentId]);
  useEffect(() => {
    const ref: SubAgentTranscriptRef = { kind: "subagent_transcript", sessionId, agentRunId: "", runId: item.agentId, path: item.transcriptPath };
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
      if (!loaded && retries++ < COMPLETED_TRANSCRIPT_RETRIES) { timer = setTimeout(refresh, POLL_MS); return; }
      setSettled(true);
      setTranscriptError(undefined);
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [sessionId, item.agentId, item.transcriptPath, running]);
  const conclusion = item.result ?? item.summary;
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-label="子 Agent 执行内容">
    {transcriptError ? <p role="status" className="text-act-xs text-text-muted">{transcriptError}</p> : null}
    {/* 与主会话同一套消息流：过程 / 正文之间的间距由 message-flow 统一给。 */}
    {messages.length ? <div className="message-flow flex min-w-0 flex-col">{renderMessageList(messages, undefined, !running)}</div> : null}
    {!messages.length && (running || !settled) ? <p className="text-act-sm text-text-muted">{running ? "等待执行…" : "正在加载执行记录…"}</p> : null}
    {/* 重试完仍拿不到记录时，退回子智能体最近一次的结论，按 Markdown 渲染。 */}
    {!messages.length && !running && settled
      ? conclusion ? <MarkdownProse content={conclusion} /> : <p className="text-act-sm text-text-muted">没有执行记录。</p>
      : null}
  </div>;
}

/** Codex / Claude Code：只有最终回复和 CLI 自己的记录文件，没有 ActSpace 子会话，也就没有轨迹。 */
function ExternalDetail({ sessionId, item }: { sessionId: string; item: SubagentListItem }) {
  const [copied, setCopied] = useState(false);
  const [revealError, setRevealError] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    await navigator.clipboard?.writeText(item.transcriptPath);
    setCopied(true);
  }
  async function reveal() {
    setRevealError(false);
    try { setRevealError(!(await sessionsApi.revealSubagentRecord({ sessionId, agentId: item.agentId })).ok); }
    catch { setRevealError(true); }
  }
  const conclusion = item.result ?? item.summary;
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-label="子 Agent 结果">
    {conclusion ? <MarkdownProse content={conclusion} /> : <p className="text-act-sm text-text-muted">{item.status === "running" ? "运行中，结束后在这里显示结果。" : "没有结果。"}</p>}
    <div className="rounded-act-md border border-line bg-surface-subtle">
      <div className="flex items-center gap-2 border-b border-line py-1 pr-1 pl-3 text-act-xs text-text-faint">
        <span className="flex-1">{kindLabel(item)} 记录文件</span>
        <IconButton label={copied ? "已复制" : "复制路径"} size="sm" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}</IconButton>
        <IconButton label="在 Finder 中显示" size="sm" onClick={() => void reveal()}><FolderOpen size={14} /></IconButton>
      </div>
      <p className="m-0 px-3 py-2.5 font-mono text-act-xs text-text-muted [overflow-wrap:anywhere]">{item.transcriptPath}</p>
    </div>
    {revealError ? <p role="alert" className="text-act-xs text-on-danger">找不到这个记录文件，可能已被 {kindLabel(item)} 清理或移动。</p> : null}
  </div>;
}

function isExternal(item: SubagentListItem): boolean { return item.kind === "codex" || item.kind === "claude-code"; }

/** 老会话的委派显示 Agent / Explore；新会话按种类和预设。 */
function kindLabel(item: SubagentListItem): string {
  return item.legacy
    ? subagentKindLabel({ agentKind: item.preset === "explore" ? "explore" : "agent" })
    : subagentKindLabel({ subagentKind: item.kind, ...(item.preset ? { preset: item.preset } : {}) });
}

/** 开始时间：本地 HH:MM。 */
function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
