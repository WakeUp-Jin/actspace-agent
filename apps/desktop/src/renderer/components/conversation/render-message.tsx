import { useEffect, useState } from "react";
import { Check, GitBranch, Loader2 } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import { getSessionToolDetail } from "../../api/sessions";
import { messageFlowKind } from "../messages/messageFlowStyles";
import { AssistantReply } from "../messages/AssistantReply";
import { AgentRunBlock } from "../messages/AgentRunBlock";
import { BashRunBlock } from "../messages/BashRunBlock";
import { BrowserApprovalBlock } from "../messages/BrowserApprovalBlock";
import { CompactCommandBlock } from "../messages/CompactCommandBlock";
import { DeleteFileBlock } from "../messages/DeleteFileBlock";
import { FileDiffBlock } from "../messages/FileDiffBlock";
import { ThinkingBlock } from "../messages/ThinkingBlock";
import { TodoListBlock } from "../messages/TodoListBlock";
import { ToolLogLine } from "../messages/ToolLogLine";
import { getToolLogRunningTextAttrs, TOOL_LOG_LINE_TEXT_RUNNING_CLASS } from "../messages/toolLogStyles";
import { UserMessage } from "../messages/UserMessage";

export type AgentMessageBlock = Extract<MessageBlock, { kind: "agent" }>;
export type ReadMessageBlock = Extract<MessageBlock, { kind: "read" }>;
export type AgentTranscriptHandler = (message: AgentMessageBlock) => void;

const TURN_STATUS_LINE_CLASS = "turn-status-line w-fit py-0.5 text-act-sm leading-[1.4] text-text-faint";
const TURN_STATUS_LINE_ERROR_CLASS = "is-error text-on-danger";
const MODEL_WAITING_DELAY_MS = 300;

function DeferredToolMessage({ message, className, onOpenAgentTranscript, replyCompleted, onOpenReadFile, onOpenWorkspaceFile }: {
  message: MessageBlock; className?: string; onOpenAgentTranscript?: (message: AgentMessageBlock) => void; replyCompleted: boolean; onOpenReadFile?: (message: ReadMessageBlock) => void; onOpenWorkspaceFile?: (path: string) => void;
}) {
  const [blocks, setBlocks] = useState<MessageBlock[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    if (loading || !message.deferredToolDetail) return;
    setLoading(true); setError(null);
    try { setBlocks(await getSessionToolDetail(message.deferredToolDetail)); }
    catch (e) { setError(e instanceof Error ? e.message : '工具详情加载失败'); }
    finally { setLoading(false); }
  };
  const visible = blocks ?? [{ ...message, deferredToolDetail: undefined }];
  return <div className={className} aria-busy={loading}>
    {visible.map(block => renderMessage({ ...block, renderKey: block.id === message.id ? message.renderKey : block.renderKey }, undefined, onOpenAgentTranscript, replyCompleted, onOpenReadFile, onOpenWorkspaceFile, blocks ? undefined : () => { void load(); }))}
    {loading && <p role="status">正在加载工具详情…</p>}
    {error && <p role="alert" className="text-act-xs leading-4 text-text-muted">{error}（收起后重新展开可重试）</p>}
  </div>;
}

export function renderMessage(
  message: MessageBlock,
  className?: string,
  onOpenAgentTranscript?: (message: AgentMessageBlock) => void,
  replyCompleted = false,
  onOpenReadFile?: (message: ReadMessageBlock) => void,
  onOpenWorkspaceFile?: (path: string) => void,
  onExpand?: () => void,
) {
  const renderKey = message.renderKey ?? message.id;
  // Child-session cards already have a compact summary and their own detail panel.
  if (message.deferredToolDetail && message.kind !== "agent") return <DeferredToolMessage key={renderKey} message={message} className={className} onOpenAgentTranscript={onOpenAgentTranscript} replyCompleted={replyCompleted} onOpenReadFile={onOpenReadFile} onOpenWorkspaceFile={onOpenWorkspaceFile} />;

  switch (message.kind) {
    case "user":
      return <UserMessage key={renderKey} message={message} />;
    case "assistant":
      return <AssistantReply key={renderKey} message={message} onOpenWorkspaceFile={onOpenWorkspaceFile} />;
    case "thinking":
      return <ThinkingBlock key={renderKey} message={message} className={className} replyCompleted={replyCompleted} />;
    case "agent":
      return <AgentRunBlock key={renderKey} message={message} className={className} onOpenTranscript={onOpenAgentTranscript} />;
    case "bash":
      return <BashRunBlock key={renderKey} message={message} replyCompleted={replyCompleted} onExpand={onExpand} />;
    case "context_compaction":
      return <CompactCommandBlock key={renderKey} message={message} className={className} />;
    case "workspace_preparation":
      return <WorkspacePreparationBlock key={renderKey} message={message} />;
    case "todo":
      return <TodoListBlock key={renderKey} message={message} className={className} />;
    case "read":
    case "search":
    case "grep":
    case "glob":
    case "web_search":
    case "media_analysis":
    case "image_generation":
    case "directory_list":
    case "delete":
    case "present":
    case "tool":
      if (message.kind === "delete" && message.status === "pending") {
        return <DeleteFileBlock key={renderKey} message={message} className={className} />;
      }
      if (message.kind === "tool" && message.toolName?.startsWith("browser_") && message.status === "pending") {
        return <BrowserApprovalBlock key={renderKey} message={message} className={className} />;
      }
      return <ToolLogLine key={renderKey} message={message} className={className} onOpenFile={onOpenReadFile} onExpand={onExpand} />;
    case "error":
      // 运行失败：独立的错误状态行，不进工具过程。
      return <div key={renderKey} className={`${TURN_STATUS_LINE_CLASS} ${TURN_STATUS_LINE_ERROR_CLASS}`}>{message.content || message.title}</div>;
    case "status":
      if (message.id.endsWith(":model-wait") || message.id === "model-wait") {
        return <ModelWaitingStatus key={renderKey} content={message.content} />;
      }
      return (
        <div
          key={renderKey}
          className={`${TURN_STATUS_LINE_CLASS}${message.tone === "error" ? ` ${TURN_STATUS_LINE_ERROR_CLASS}` : ""}`}
        >
          {message.content}
        </div>
      );
    case "edit_diff":
    case "write_diff":
      return <FileDiffBlock key={renderKey} message={message} className={className} onExpand={onExpand} />;
  }
}

function WorkspacePreparationBlock({
  message,
}: {
  message: Extract<MessageBlock, { kind: "workspace_preparation" }>;
}) {
  const completed = message.status === "completed";
  return (
    <details className="group/worktree rounded-act-md border border-line bg-surface-subtle/70 px-3 py-2 text-act-md leading-5 text-text-muted" open={!completed}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-text-main">
        {completed ? <Check size={15} aria-hidden="true" /> : <Loader2 className="animate-spin" size={15} aria-hidden="true" />}
        <span className="font-medium">{completed ? "已创建工作树" : "正在创建工作树"}</span>
        {completed && message.durationMs !== undefined ? (
          <span className="text-act-xs leading-4 text-text-faint">{Math.max(0, message.durationMs / 1000).toFixed(1)}s</span>
        ) : null}
      </summary>
      <div className="mt-2 grid gap-1.5 border-t border-line pt-2 text-act-xs leading-5 text-text-faint">
        <div className="flex items-center gap-1.5 text-text-muted">
          <GitBranch size={13} aria-hidden="true" />
          <span>{message.branch ?? `基于 ${message.baseBranch}`}</span>
        </div>
        {message.workspaceRoot ? <code className="break-all font-mono">{message.workspaceRoot}</code> : null}
        {message.baseCommit ? <span>基准提交 {message.baseCommit.slice(0, 8)}</span> : null}
        {completed ? <span>未自动运行本地环境配置。</span> : null}
      </div>
    </details>
  );
}

function ModelWaitingStatus({ content }: { content: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), MODEL_WAITING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`${TURN_STATUS_LINE_CLASS} px-[var(--conversation-text-inset)]`}
      role="status"
      aria-live="polite"
    >
      <span
        className={TOOL_LOG_LINE_TEXT_RUNNING_CLASS}
        {...getToolLogRunningTextAttrs(content)}
      >
        {content}
      </span>
    </div>
  );
}

export function renderMessageList(messages: MessageBlock[], onOpenAgentTranscript?: AgentTranscriptHandler, replyCompleted = false, onOpenReadFile?: (message: ReadMessageBlock) => void, onOpenWorkspaceFile?: (path: string) => void) {
  // Preserve message/usage data, but do not give empty assistant text a prose gap.
  return messages.filter((message) => message.kind !== "assistant" || message.content.trim().length > 0).map((message) =>
    <div key={message.renderKey ?? message.id} className="message-flow-item" data-flow-kind={messageFlowKind(message)}>
      {renderMessage(message, undefined, onOpenAgentTranscript, replyCompleted, onOpenReadFile, onOpenWorkspaceFile)}
    </div>,
  );
}
