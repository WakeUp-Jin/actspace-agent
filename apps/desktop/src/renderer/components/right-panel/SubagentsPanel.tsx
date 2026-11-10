import { memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Copy, FolderOpen, Loader2, Square } from "lucide-react";
import { subagentKindLabel, type MessageBlock, type SubAgentTranscriptRef, type SubagentListItem } from "@actspace/shared";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import { ActivityLine, AgentAvatar, SubagentStatus, agentModelLabel, formatAgentDuration } from "../messages/AgentIdentity";
import { MarkdownProse } from "../messages/MarkdownProse";
import { TurnView } from "../conversation/TurnView";
import { groupMessagesIntoTurns } from "../conversation/turns";
import { SessionActionsContext } from "../../session/session-actions-context";
import { sessionsApi } from "../../api/sessions";
import { formatTokenCount } from "../../context-format";
import { SessionViewToggle, type SessionMainView } from "../SessionViewToggle";
import { TrajectoryView } from "../TrajectoryView";
import type { SubagentFocus } from "./RightPanelContext";
import { reconcileSubagents, reconcileTranscript, type TranscriptState } from "./subagent-transcript";

// 有子智能体在跑时列表每秒轮询（耗时、状态要跟上），都没在跑时 5 秒一次，只为接住新派出的子智能体。
// 结束后记录可能拉取失败（父会话还在输出时主进程繁忙），拿到非空结果前继续重试，最多这么多次。
const POLL_MS = 1000;
const IDLE_POLL_MS = 5000;
const COMPLETED_TRANSCRIPT_RETRIES = 20;
// 列表行：没有外框和分隔线，行自带圆角，悬停才有底色；规范见 docs/design-docs/frontend/front-子Agent与后台任务规范.md。
const rowClass = "flex min-w-0 flex-1 items-center gap-3 rounded-act-md px-2.5 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";
// 运行中最右一格的转圈：停止中保持转圈，不再换成按钮。
const ROW_SPINNER_CLASS = "absolute animate-spin text-operational transition-opacity duration-(--motion-fast) motion-reduce:animate-none";
// 刚来信时转圈换成的蓝点（规范 §2.2）。
const ROW_LETTER_DOT_CLASS = "absolute size-[7px] rounded-full bg-info transition-opacity duration-(--motion-fast)";
/** 来信摘要在列表第二行停留多久（规范 §2.2）。 */
export const RECENT_MESSAGE_MS = 6000;

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
  // 运行中的耗时用 Date.now() 现算；列表没变化时不 setState，所以靠这个每秒一次的计数让耗时继续走。
  const [, setTick] = useState(0);
  // revision 每次点击递增：同一个 agentId 再点一次也要重新定位。
  const focusRevision = focus?.revision;
  const focusAgentId = focus?.agentId;
  const focusView = focus?.view;
  useEffect(() => {
    if (focusAgentId === undefined || focusView === undefined) return;
    setPendingAgent(focusAgentId);
    setView(focusView);
  }, [focusRevision, focusAgentId, focusView]);
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
    let delay = POLL_MS;
    async function refresh() {
      try {
        const items = await sessionsApi.getSubagents({ sessionId: sessionId! });
        if (disposed) return;
        // 数据没变就不 setState（保持引用），只在有运行中的子智能体时推进耗时。
        setAgents((previous) => reconcileSubagents(previous, items));
        setLoaded(true); setError(undefined);
        const running = items.some((item) => item.status === "running");
        if (running) setTick((value) => value + 1);
        delay = running ? POLL_MS : IDLE_POLL_MS;
      } catch { if (!disposed) setError("无法加载子智能体，请稍后重试。"); }
      finally { if (!disposed) timer = setTimeout(refresh, delay); }
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
  return <section className="h-full overflow-y-auto px-3 py-3.5" aria-label="子 Agent 列表">
    {error ? <p role="status" className="mb-3 px-1.5 text-act-xs text-text-muted">{error}</p> : null}
    {missingAgent ? <p role="status" className="mb-3 px-1.5 text-act-xs text-text-muted">找不到这个子智能体。</p> : null}
    {stopError ? <p role="alert" className="mb-3 px-1.5 text-act-xs text-on-danger">停止失败：{stopError}</p> : null}
    {([true, false] as const).map((running) => {
      const items = agents.filter((agent) => (agent.status === "running") === running);
      if (!items.length) return null;
      const title = running ? "运行中" : "其他";
      return <div key={String(running)} className="mb-4.5" role="group" aria-label={`${title} · ${items.length}`}>
        <h2 className="mb-1.5 flex items-center justify-between px-1.5 text-act-xs font-normal text-text-faint"><span>{title}</span><span className="tabular-nums">{items.length}</span></h2>
        <div className="flex flex-col gap-px">
          {items.map((agent) => <SubagentRow key={agent.agentId} agent={agent} stopping={stopping === agent.agentId}
            onOpen={() => { setSelectedId(agent.agentId); setView("chat"); setMissingAgent(false); setStopError(undefined); }}
            onStop={() => void stop(agent.agentId)} />)}
        </div>
      </div>;
    })}
    {loaded && !agents.length && !error ? <p className="px-1.5 text-act-sm text-text-muted">此会话还没有子智能体。</p> : null}
  </section>;
}

/**
 * 一行：头像、描述、第二行（运行中是此刻在做什么，刚来信时是来信摘要，结束后是结论）；右上 token，右下状态文字 · 耗时。
 * 运行中的行最右一格平时转圈（刚来信时是蓝点），悬停或聚焦这一行时换成停止。
 */
function SubagentRow({ agent, stopping, onOpen, onStop }: { agent: SubagentListItem; stopping: boolean; onOpen: () => void; onStop: () => void }) {
  const running = agent.status === "running";
  const line = secondLine(agent, Date.now());
  const idleClass = stopping ? "" : " group-hover/row:opacity-0 group-focus-within/row:opacity-0";
  return <div className="group/row flex items-center rounded-act-md transition-colors duration-(--motion-fast) hover:bg-hover-overlay">
    <button type="button" className={rowClass} onClick={onOpen}>
      <AgentAvatar identity={agent.agentId} size={28} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-act-sm text-text-main" title={agent.description}>{agent.description}</span>
        {line ? <span className={`flex min-w-0 text-act-xs ${agent.status === "failed" ? "text-on-danger" : "text-text-faint"}`}>
          {line.letter ? <span className="shrink-0 text-info">来信：</span> : null}
          <ActivityLine text={line.text} animate={running} className="min-w-0 flex-1" />
        </span> : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-act-xs tabular-nums text-text-faint">
        {agent.totalTokens ? <span className="text-text-muted">{formatTokenCount(agent.totalTokens)} <span className="text-text-faint">tokens</span></span> : null}
        <SubagentStatus status={agent.status} duration={formatAgentDuration(durationMs(agent))} />
      </span>
    </button>
    {running
      ? <span className="relative mr-2 grid size-7 shrink-0 place-items-center">
        {line?.letter && !stopping
          ? <span aria-hidden="true" data-testid="subagent-letter-dot" className={`${ROW_LETTER_DOT_CLASS}${idleClass}`} />
          : <Loader2 size={15} aria-hidden="true" className={`${ROW_SPINNER_CLASS}${idleClass}`} />}
        <IconButton label={`停止 ${agent.description}`} tooltip="停止" variant="danger" shape="round" disabled={stopping} onClick={onStop}
          className={`absolute inset-0 ${stopping ? "opacity-0" : "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 group-focus-within/row:opacity-100"}`}>
          <Square size={11} fill="currentColor" />
        </IconButton>
      </span>
      : null}
  </div>;
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
    <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line pl-1.5 pr-2">
      <IconButton label="返回子 Agent 列表" tooltip="返回" onClick={onBack}><ChevronLeft size={16} /></IconButton>
      <div className="flex min-w-28 flex-1 items-center gap-2" title={[item.description, kindLabel(item), item.background ? "后台" : undefined].filter(Boolean).join(" · ")}>
        <AgentAvatar identity={item.agentId} size={18} />
        <h2 className="m-0 min-w-0 truncate text-act-sm font-medium">{item.description}</h2>
      </div>
      <span className="flex min-w-0 shrink items-center gap-2 px-1 text-act-xs text-text-faint">
        {model ? <><span className="min-w-8 max-w-24 truncate text-text-muted" title={item.model}>{model}</span><Dot /></> : null}
        <SubagentStatus status={item.status} duration={formatAgentDuration(durationMs(item))} />
      </span>
      {external ? null : <SessionViewToggle view={view} onToggle={onToggleView} />}
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

const noop = () => undefined;

/** 本地 / Fork：子会话的对话记录（Fork 去掉了复制来的前缀，见 `projectSubagentTranscript`）。 */
const TranscriptDetail = memo(function TranscriptDetail({ sessionId, item }: { sessionId: string; item: SubagentListItem }) {
  const [messages, setMessages] = useState<MessageBlock[]>([]);
  // 上一次拉到的事件与块：轮询拿到相同内容时不换引用，变化时已有的块复用，只更新变化的尾部。
  const transcript = useRef<TranscriptState | null>(null);
  // 执行记录的错误单独存：列表每秒轮询成功时会清掉列表错误，不能把这条也清掉。
  const [transcriptError, setTranscriptError] = useState<string>();
  const [settled, setSettled] = useState(false);
  const running = item.status === "running";
  // 只在换了子智能体时清空；从运行中变为结束时保留已显示的记录，不闪回结论。
  useEffect(() => { transcript.current = null; setMessages([]); setTranscriptError(undefined); setSettled(false); }, [item.agentId]);
  useEffect(() => {
    const ref: SubAgentTranscriptRef = { kind: "subagent_transcript", sessionId, agentRunId: "", runId: item.agentId, path: item.transcriptPath };
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let retries = 0;
    async function refresh() {
      let loaded = false;
      try {
        const events = await sessionsApi.getSubAgentTranscript({ transcriptRef: ref });
        if (disposed) return;
        const next = reconcileTranscript(transcript.current, events);
        transcript.current = next;
        loaded = next.blocks.length > 0;
        if (loaded || running) setMessages(next.blocks);
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
  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages]);
  // 子会话不能从这里分叉：沿用主会话的其他操作，只去掉分叉。
  const actions = useContext(SessionActionsContext);
  const childActions = useMemo(() => (actions ? { ...actions, onForkSession: undefined } : null), [actions]);
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-label="子 Agent 执行内容">
    {transcriptError ? <p role="status" className="text-act-xs text-text-muted">{transcriptError}</p> : null}
    {/* 与主会话同一套轮次渲染：运行中过程平铺，结束后收进「Worked for」，最终回复留在折叠外。 */}
    {turns.length ? <SessionActionsContext.Provider value={childActions}>
      <div className="flex min-w-0 flex-col">
        {turns.map((turn, index) => (
          <TurnView key={turn.id} turn={turn} isActive={running && index === turns.length - 1} isLatest={index === turns.length - 1}
            sessionId={item.agentId} setTurnElement={noop} />
        ))}
      </div>
    </SessionActionsContext.Provider> : null}
    {!messages.length && (running || !settled) ? <p className="text-act-sm text-text-muted">{running ? "等待执行…" : "正在加载执行记录…"}</p> : null}
    {/* 重试完仍拿不到记录时，退回子智能体最近一次的结论，按 Markdown 渲染。 */}
    {!messages.length && !running && settled
      ? conclusion ? <MarkdownProse content={conclusion} /> : <p className="text-act-sm text-text-muted">没有执行记录。</p>
      : null}
  </div>;
});

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

function Dot() { return <span aria-hidden="true" className="size-[3px] shrink-0 rounded-full bg-line-strong" />; }

/** 最近一次激活的耗时：运行中到现在，结束的到结束时间。 */
function durationMs(item: SubagentListItem): number {
  const start = Date.parse(item.activeSince);
  const end = item.endedAt ? Date.parse(item.endedAt) : Date.now();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

/**
 * 列表第二行（规范 §2、§2.2）：
 * - 运行中：最近 6 秒内来信时是来信摘要（`letter`），否则是此刻在做什么；本地 / Fork 没有动态时写「正在思考」，Codex / Claude Code 不写。
 * - 结束后：最终回复的第一行（去掉加粗、行内代码、标题、列表的 Markdown 标记）；没有回复时不写，状态已在右侧。
 */
export function secondLine(item: SubagentListItem, now: number): { text: string; letter?: true } | undefined {
  if (item.status === "running") {
    const sent = item.lastMessage ? Date.parse(item.lastMessage.at) : NaN;
    if (item.lastMessage && now - sent < RECENT_MESSAGE_MS) return { text: item.lastMessage.text, letter: true };
    if (item.activity) return { text: item.activity };
    return isExternal(item) ? undefined : { text: "正在思考" };
  }
  const first = item.result?.split(/\r?\n/).map((line) => line.replace(/\*\*|`/g, "").replace(/^\s*(#+|[-*]|\d+\.)\s+/, "").replace(/\s+/g, " ").trim()).find(Boolean);
  return first ? { text: first } : undefined;
}
