import { Check, Copy, Eye, GitBranch, Loader2, MoreHorizontal, Wand2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ComposerAttachment, ComposerMode, ContextState, ContextUsageSnapshot, MessageBlock, ModelSelectionId, UsableModelView } from "@actspace/shared";
import { Composer, type ComposerDraftReader, type ComposerDraftRestore, type ComposerDraftWriter, type ComposerExecutionContext, type ComposerReviewSummary, type ComposerSendOptions, type ComposerWorkspaceOption } from "./Composer";
import { ConversationTurnRail, type ConversationTurnNavigationItem } from "./ConversationTurnRail";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { useRightPanel } from "./right-panel/RightPanelContext";
import { AssistantReply } from "./messages/AssistantReply";
import { AgentRunBlock } from "./messages/AgentRunBlock";
import { BashRunBlock } from "./messages/BashRunBlock";
import { BrowserApprovalBlock } from "./messages/BrowserApprovalBlock";
import { CompactCommandBlock } from "./messages/CompactCommandBlock";
import { DeleteFileBlock } from "./messages/DeleteFileBlock";
import { FileDiffBlock } from "./messages/FileDiffBlock";
import { TurnOutputArtifacts } from "./messages/TurnOutputArtifacts";
import { ThinkingBlock } from "./messages/ThinkingBlock";
import { TodoListBlock } from "./messages/TodoListBlock";
import { ToolActivityGroup } from "./messages/ToolActivityGroup";
import { ToolLogLine } from "./messages/ToolLogLine";
import {
  getToolLogRunningTextAttrs,
  TOOL_LOG_LINE_TEXT_RUNNING_CLASS,
} from "./messages/toolLogStyles";
import { UserMessage } from "./messages/UserMessage";
import type { SessionMainView } from "./SessionViewToggle";
import { TrajectoryView } from "./TrajectoryView";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";
import { formatUsdCost } from "../usage-format";
import { selectComposer, selectProviderUsage, selectRequestContextEstimate, selectSurfaceMessages } from "@actspace/client/sessions";
import type { RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import { contextEstimateToSnapshot, providerUsageToContextSnapshot, useOptionalSessionProjection } from "../session";
import { readFailureTab, tabFromFile } from "./right-panel/workspaceFileTab";

type UserMessageBlock = Extract<MessageBlock, { kind: "user" }>;
type AssistantMessageBlock = Extract<MessageBlock, { kind: "assistant" }>;
type AgentMessageBlock = Extract<MessageBlock, { kind: "agent" }>;
type ReadMessageBlock = Extract<MessageBlock, { kind: "read" }>;
type TodoMessageBlock = Extract<MessageBlock, { kind: "todo" }>;

type ConversationTurn = {
  id: string;
  user: UserMessageBlock | null;
  messages: MessageBlock[];
};

const CONVERSATION_SHELL_CLASS =
  "conversation-shell grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] bg-surface pt-[var(--window-chrome-strip-height)]";
const MESSAGE_VIEWPORT_CLASS = "conversation-message-viewport relative min-h-0 min-w-0";
const MESSAGE_SCROLL_CLASS = "message-scroll h-full min-h-0 overflow-auto bg-surface pb-6 [scrollbar-gutter:stable_both-edges]";
const MESSAGE_SCROLL_INITIAL_CLASS =
  "message-scroll message-scroll-initial h-full min-h-0 overflow-auto bg-surface pb-6 [scrollbar-gutter:stable_both-edges]";
const MESSAGE_STACK_CLASS =
  "message-stack mx-auto flex min-w-0 w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] flex-col gap-7 pb-7";
const INITIAL_COMPOSER_STAGE_CLASS =
  "initial-composer-stage flex h-full min-h-[420px] items-center justify-center px-[var(--conversation-inline-padding)]";
const MESSAGE_TURN_CLASS = "message-turn relative flex min-w-0 flex-col gap-0";
const TURN_PROMPT_CLASS =
  "turn-prompt sticky top-0 z-12 min-w-0 bg-[image:var(--act-gradient-surface-fade)] py-4";
const TURN_PROMPT_CARD_CLASS =
  "turn-prompt-card overflow-hidden rounded-act-lg border border-line bg-surface shadow-[0_12px_34px_rgba(31,45,61,0.045)] dark:shadow-[0_12px_34px_rgba(0,0,0,0.3)]";
const TURN_BODY_CLASS = "turn-body flex min-w-0 flex-col gap-[9px]";
const ASSISTANT_TURN_GROUP_CLASS = "group/assistant-turn min-w-0";
const TURN_ACTIONS_CLASS =
  "turn-actions mt-1 flex min-h-7 items-center justify-between gap-3 px-[var(--conversation-text-inset)] text-[12px] text-text-faint opacity-0 pointer-events-none transition-opacity duration-[150ms] ease-in-out group-hover/assistant-turn:pointer-events-auto group-hover/assistant-turn:opacity-100 group-focus-within/assistant-turn:pointer-events-auto group-focus-within/assistant-turn:opacity-100";
const TURN_ACTIONS_RIGHT_CLASS = "flex items-center justify-end gap-0.5";
const TURN_USAGE_META_CLASS = "flex min-w-0 items-center gap-1.5 tabular-nums";
const TURN_ACTION_ANCHOR_CLASS = "turn-action-anchor relative flex-none";
const TURN_ACTION_TRIGGER_CLASS =
  "turn-action-trigger grid h-[30px] w-[30px] place-items-center rounded-act-md border-0 bg-transparent text-text-faint opacity-65 transition-[background,color,opacity] duration-[150ms] ease-in-out hover:bg-hover-overlay hover:text-text-main hover:opacity-100 aria-disabled:cursor-default aria-expanded:bg-selected aria-expanded:text-text-main aria-expanded:opacity-100";
const TURN_ACTION_MENU_CLASS =
  "turn-action-menu absolute bottom-[30px] right-0 z-40 w-[178px] rounded-act-md border border-line bg-surface-raised/98 p-1.5 shadow-act-popover";
const TURN_ACTION_MENU_BUTTON_CLASS =
  "flex min-h-[34px] w-full items-center rounded-act-sm border-0 bg-transparent px-2.5 text-left text-sm font-semibold text-text-main transition-colors duration-[150ms] ease-in-out hover:bg-hover-overlay disabled:cursor-default disabled:text-text-faint";
const TURN_STATUS_LINE_CLASS = "turn-status-line w-fit py-0.5 text-[13px] leading-[1.4] text-text-faint";
const TURN_STATUS_LINE_ERROR_CLASS = "is-error text-on-danger";
const COMPACT_MESSAGE_RELATION_CLASS = "-mt-1";
const MODEL_WAITING_DELAY_MS = 300;
const SCROLL_BOTTOM_THRESHOLD_PX = 80;
const TURN_RAIL_MIN_TURNS = 3;
const TURN_RAIL_MIN_VIEWPORT_WIDTH_PX = 640;

const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : MESSAGE_TIME_FORMATTER.format(date);
}

function isSafeWorkspaceRelativePath(filePath: string): boolean {
  return filePath.length > 0
    && filePath !== "."
    && !filePath.startsWith("/")
    && !/^[A-Za-z]:[\\/]/.test(filePath)
    && !filePath.split(/[\\/]+/).includes("..");
}

const TOOL_LOG_MESSAGE_KINDS = new Set<MessageBlock["kind"]>([
  "read",
  "search",
  "grep",
  "glob",
  "web_search",
  "media_analysis",
  "image_generation",
  "directory_list",
  "delete",
  "agent",
  "tool",
  "error",
]);
const DIFF_MESSAGE_KINDS = new Set<MessageBlock["kind"]>(["edit_diff", "write_diff"]);
const SYSTEM_MESSAGE_KINDS = new Set<MessageBlock["kind"]>(["context_compaction", "workspace_preparation", "status"]);

function copyWithSelection(value: string) {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

async function copyToClipboard(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      copyWithSelection(value);
    }
  } catch {
    copyWithSelection(value);
  }
}

function isToolLogMessage(message: MessageBlock) {
  return TOOL_LOG_MESSAGE_KINDS.has(message.kind);
}

function isDiffMessage(message: MessageBlock) {
  return DIFF_MESSAGE_KINDS.has(message.kind);
}

function isSystemMessage(message: MessageBlock) {
  return SYSTEM_MESSAGE_KINDS.has(message.kind);
}

function getMessageRelationClass(previousMessage: MessageBlock | undefined, message: MessageBlock) {
  if (!previousMessage) {
    return undefined;
  }

  const previousIsTool = isToolLogMessage(previousMessage);
  const currentIsTool = isToolLogMessage(message);
  const previousIsDiff = isDiffMessage(previousMessage);
  const currentIsDiff = isDiffMessage(message);

  if (
    (previousMessage.kind === "thinking" && currentIsTool) ||
    (previousIsTool && (currentIsTool || message.kind === "thinking")) ||
    (previousMessage.kind === "thinking" && currentIsDiff) ||
    (previousIsDiff && (currentIsDiff || currentIsTool || message.kind === "thinking")) ||
    (previousIsTool && currentIsDiff) ||
    (isSystemMessage(previousMessage) && isSystemMessage(message))
  ) {
    return COMPACT_MESSAGE_RELATION_CLASS;
  }

  return undefined;
}

export function renderMessage(
  message: MessageBlock,
  className?: string,
  onOpenAgentTranscript?: (message: AgentMessageBlock) => void,
  replyCompleted = false,
  onOpenReadFile?: (message: ReadMessageBlock) => void,
) {
  const renderKey = message.renderKey ?? message.id;

  switch (message.kind) {
    case "user":
      return <UserMessage key={renderKey} message={message} />;
    case "assistant":
      return <AssistantReply key={renderKey} message={message} />;
    case "thinking":
      return <ThinkingBlock key={renderKey} message={message} className={className} replyCompleted={replyCompleted} />;
    case "agent":
      return <AgentRunBlock key={renderKey} message={message} className={className} onOpenTranscript={onOpenAgentTranscript} />;
    case "bash":
      return <BashRunBlock key={renderKey} message={message} replyCompleted={replyCompleted} />;
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
    case "tool":
    case "error":
      if (message.kind === "delete" && message.status === "pending") {
        return <DeleteFileBlock key={renderKey} message={message} className={className} />;
      }
      if (message.kind === "tool" && message.approvalScope === "browser_session" && message.status === "pending") {
        return <BrowserApprovalBlock key={renderKey} message={message} className={className} />;
      }
      return <ToolLogLine key={renderKey} message={message} className={className} onOpenFile={onOpenReadFile} />;
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
      return <FileDiffBlock key={renderKey} message={message} className={className} />;
  }
}

function WorkspacePreparationBlock({
  message,
}: {
  message: Extract<MessageBlock, { kind: "workspace_preparation" }>;
}) {
  const completed = message.status === "completed";
  return (
    <details className="group/worktree rounded-act-md border border-line bg-surface-subtle/70 px-3 py-2 text-sm text-text-muted" open={!completed}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-text-main">
        {completed ? <Check size={15} aria-hidden="true" /> : <Loader2 className="animate-spin" size={15} aria-hidden="true" />}
        <span className="font-medium">{completed ? "已创建工作树" : "正在创建工作树"}</span>
        {completed && message.durationMs !== undefined ? (
          <span className="text-xs text-text-faint">{Math.max(0, message.durationMs / 1000).toFixed(1)}s</span>
        ) : null}
      </summary>
      <div className="mt-2 grid gap-1.5 border-t border-line pt-2 text-xs leading-5 text-text-faint">
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

function groupMessagesIntoTurns(messages: MessageBlock[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: ConversationTurn | null = null;

  for (const message of messages) {
    if (message.kind === "user") {
      currentTurn = {
        id: message.renderKey ?? message.id,
        user: message,
        messages: []
      };
      turns.push(currentTurn);
      continue;
    }

    if (message.kind === "context_compaction" || message.kind === "workspace_preparation") {
      currentTurn = null;
      turns.push({
        id: message.renderKey ?? message.id,
        user: null,
        messages: [message],
      });
      continue;
    }

    if (!currentTurn) {
      currentTurn = {
        id: `turn-${message.renderKey ?? message.id}`,
        user: null,
        messages: []
      };
      turns.push(currentTurn);
    }

    currentTurn.messages.push(message);
  }

  return turns;
}

// 工具活动组：哪些消息算「过程行」（thinking + 工具 + diff），有它才把过程聚合成活动组。
const WORK_TOOL_LIKE_KINDS = new Set<MessageBlock["kind"]>([
  ...TOOL_LOG_MESSAGE_KINDS,
  ...DIFF_MESSAGE_KINDS,
  "thinking",
  "bash",
]);

function hasToolLikeItem(messages: MessageBlock[]): boolean {
  return messages.some((message) => WORK_TOOL_LIKE_KINDS.has(message.kind));
}

/**
 * 把一个 turn 的消息拆成「过程」和「最终回复」两段。
 *
 * 最终回复 = turn 末尾、后面不再跟任何工具/thinking 的连续 assistant 块。
 * 其余（thinking / 工具 / 工具间旁白 content）都归到过程段，统一收进一个 Worked for 活动组。
 */
function splitTurnMessages(messages: MessageBlock[]): {
  workItems: MessageBlock[];
  finalReply: MessageBlock[];
} {
  let splitIndex = messages.length;
  while (splitIndex > 0 && messages[splitIndex - 1].kind === "assistant") {
    splitIndex -= 1;
  }
  return {
    workItems: messages.slice(0, splitIndex),
    finalReply: messages.slice(splitIndex),
  };
}

function normalizeTurnPreviewText(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function createTurnNavigationItems(
  turns: ConversationTurn[],
  isStreaming: boolean,
): ConversationTurnNavigationItem[] {
  const userTurns = turns.filter((turn): turn is ConversationTurn & { user: UserMessageBlock } => Boolean(turn.user));

  return userTurns.map((turn, index) => {
    const finalReply = splitTurnMessages(turn.messages).finalReply
      .filter((message): message is AssistantMessageBlock => message.kind === "assistant")
      .map((message) => message.content)
      .join("\n\n");

    return {
      id: turn.id,
      input: normalizeTurnPreviewText(turn.user.content),
      reply: finalReply ? normalizeTurnPreviewText(finalReply) : null,
      pending: isStreaming && index === userTurns.length - 1,
    };
  });
}

function workDurationMs(workItems: MessageBlock[], finalReply: MessageBlock[]): number | undefined {
  if (workItems.length === 0) return undefined;
  const start = Date.parse(workItems[0].createdAt);
  const endSource = finalReply[0]?.createdAt ?? workItems[workItems.length - 1].createdAt;
  const end = Date.parse(endSource);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return end - start;
}

type AgentTranscriptHandler = (message: AgentMessageBlock) => void;

function renderMessageList(messages: MessageBlock[], onOpenAgentTranscript?: AgentTranscriptHandler, replyCompleted = false, onOpenReadFile?: (message: ReadMessageBlock) => void) {
  return messages.map((message, index) =>
    renderMessage(message, getMessageRelationClass(messages[index - 1], message), onOpenAgentTranscript, replyCompleted, onOpenReadFile),
  );
}

function renderProcessContent(
  processItems: MessageBlock[],
  isActive: boolean,
  finalReply: MessageBlock[],
  onOpenAgentTranscript?: AgentTranscriptHandler,
  replyCompleted = false,
  onOpenReadFile?: (message: ReadMessageBlock) => void,
): ReactNode[] {
  return [
    <ToolActivityGroup key="work" running={isActive} durationMs={workDurationMs(processItems, finalReply)}>
      {renderMessageList(processItems, onOpenAgentTranscript, replyCompleted, onOpenReadFile)}
    </ToolActivityGroup>,
  ];
}

function getLatestTodoMessage(messages: MessageBlock[]): TodoMessageBlock | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === "todo") return message;
  }
  return undefined;
}

function TurnPrompt({
  turn,
  onOpenAttachmentPreview,
}: {
  turn: ConversationTurn;
  onOpenAttachmentPreview?: (attachment: ComposerAttachment) => void;
}) {
  if (!turn.user) return null;
  const latestTodo = getLatestTodoMessage(turn.messages);

  return (
    <div className={TURN_PROMPT_CLASS}>
      <div className={TURN_PROMPT_CARD_CLASS}>
        <UserMessage
          message={turn.user}
          onOpenAttachmentPreview={onOpenAttachmentPreview}
          variant="execution"
        />
        {latestTodo && (latestTodo.totalCount > 0 || latestTodo.status === "failed") ? (
          <TodoListBlock message={latestTodo} attached />
        ) : null}
      </div>
    </div>
  );
}

/**
 * 渲染一个 turn 的正文：含工具时把过程聚合进 ToolActivityGroup（执行中平铺 / 完成后 Worked for 折叠），
 * 最终回复始终留在折叠组外正常渲染；没有工具时回退到原来的平铺渲染。
 */
function renderTurnBody(
  turn: ConversationTurn,
  isActive: boolean,
  onOpenAgentTranscript?: AgentTranscriptHandler,
  onOpenReadFile?: (message: ReadMessageBlock) => void,
) {
  const { workItems, finalReply } = splitTurnMessages(turn.messages);
  const replyCompleted = !isActive && finalReply.length > 0;
  const attachTodoToPrompt = Boolean(turn.user);
  const preparationItems = workItems.filter((message) => message.kind === "workspace_preparation");
  const latestTodo = attachTodoToPrompt ? getLatestTodoMessage(workItems) : undefined;
  const processItems = workItems.filter(
    (message) => message.kind !== "workspace_preparation" && (!attachTodoToPrompt || message.kind !== "todo"),
  );
  const processContent = processItems.length === 0
    ? null
    : hasToolLikeItem(processItems)
      ? renderProcessContent(processItems, isActive, finalReply, onOpenAgentTranscript, replyCompleted, onOpenReadFile)
      : renderMessageList(processItems, onOpenAgentTranscript, replyCompleted, onOpenReadFile);

  if (!hasToolLikeItem(processItems) && !latestTodo) {
    return renderMessageList(turn.messages, onOpenAgentTranscript, replyCompleted, onOpenReadFile);
  }

  return (
    <>
      {preparationItems.length > 0 ? renderMessageList(preparationItems, onOpenAgentTranscript, false, onOpenReadFile) : null}
      {processContent}
      {finalReply.length > 0 ? renderMessageList(finalReply, onOpenAgentTranscript, false, onOpenReadFile) : null}
    </>
  );
}

type VisualizeState = "idle" | "generating" | "ready" | "error";

/** 从回复正文里抽一个简短标题，给可视化 Tab 用。剥掉常见 Markdown 记号，取首个非空行。 */
function deriveVisualizeTitle(content: string): string {
  const firstLine =
    content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "回复";
  const stripped = firstLine.replace(/^#+\s*/, "").replace(/[*_`>#~]/g, "").trim() || "回复";
  return `可视化 · ${stripped.length > 16 ? `${stripped.slice(0, 16)}…` : stripped}`;
}

function TurnActions({
  assistantMessages,
  sessionId,
}: {
  assistantMessages: AssistantMessageBlock[];
  sessionId: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [visualizeState, setVisualizeState] = useState<VisualizeState>("idle");
  const [visualizeError, setVisualizeError] = useState<string | null>(null);
  const visualizeHtmlRef = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { openTab } = useRightPanel();
  const latestAssistantMessage = assistantMessages[assistantMessages.length - 1];
  const copyText = useMemo(
    () => assistantMessages.map((message) => message.content).join("\n\n"),
    [assistantMessages]
  );

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  if (!latestAssistantMessage) {
    return null;
  }

  const usageLabel = latestAssistantMessage.usage
    ? `${latestAssistantMessage.usage.totalTokens.toLocaleString("zh-CN")} Token · ${formatUsdCost(latestAssistantMessage.usage.costUsd)}`
    : null;

  async function handleCopy(value: string) {
    await copyToClipboard(value);
    setMenuOpen(false);
  }

  const visualizeTabId = `viz:${latestAssistantMessage.id}`;

  function focusVisualizeTab(html: string) {
    openTab({
      id: visualizeTabId,
      kind: "html",
      title: deriveVisualizeTitle(copyText),
      html,
      trust: "chat",
    });
  }

  /**
   * 可视化转换：成本敏感，绝不每次点击都调模型。
   * - 本地已有结果（ready）且非重生成 → 直接聚焦 Tab，零 IPC。
   * - 否则走 IPC；main 侧按 messageId+sourceHash 命中缓存即不调模型。
   */
  async function handleVisualize(regenerate: boolean) {
    setMenuOpen(false);
    if (visualizeState === "generating") {
      return;
    }
    if (!regenerate && visualizeState === "ready" && visualizeHtmlRef.current) {
      focusVisualizeTab(visualizeHtmlRef.current);
      return;
    }
    if (typeof window === "undefined" || !window.actspace?.visualizeReply || !sessionId) {
      setVisualizeState("error");
      setVisualizeError("当前环境不支持可视化转换。");
      return;
    }

    setVisualizeState("generating");
    setVisualizeError(null);
    try {
      const result = await window.actspace.visualizeReply({
        sessionId,
        messageId: latestAssistantMessage.id,
        content: copyText,
        regenerate,
      });
      visualizeHtmlRef.current = result.html;
      setVisualizeState("ready");
      focusVisualizeTab(result.html);
    } catch (error) {
      setVisualizeState("error");
      setVisualizeError(error instanceof Error ? error.message : "可视化转换失败");
    }
  }

  const visualizeLabel =
    visualizeState === "ready"
      ? "查看可视化（已生成）"
      : visualizeState === "generating"
        ? "正在生成可视化…"
        : visualizeState === "error"
          ? (visualizeError ?? "可视化失败，点击重试")
          : "用主模型把这条回复转成可视化 HTML";

  return (
    <div className={TURN_ACTIONS_CLASS}>
      <div
        className={TURN_USAGE_META_CLASS}
        aria-label={usageLabel ? `本轮消耗：${usageLabel}` : `回复时间：${formatMessageTime(latestAssistantMessage.createdAt)}`}
      >
        <span>{formatMessageTime(latestAssistantMessage.createdAt)}</span>
        {usageLabel ? <span aria-hidden="true">·</span> : null}
        {usageLabel ? <span>{usageLabel}</span> : null}
      </div>
      <div className={TURN_ACTIONS_RIGHT_CLASS}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={TURN_ACTION_TRIGGER_CLASS}
              type="button"
              aria-label="复制回复"
              onClick={() => void handleCopy(copyText)}
            >
              <Copy size={15} strokeWidth={2} />
            </button>
          </TooltipTrigger>
          <TooltipContent>复制回复</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={TURN_ACTION_TRIGGER_CLASS}
              type="button"
              aria-label={visualizeState === "ready" ? "查看可视化" : "可视化这条回复"}
              aria-disabled={visualizeState === "generating"}
              onClick={() => void handleVisualize(false)}
            >
              {visualizeState === "generating" ? (
                <Loader2 size={16} strokeWidth={2.2} className="animate-spin" />
              ) : visualizeState === "ready" ? (
                <Eye size={16} strokeWidth={2} />
              ) : (
                <Wand2 size={16} strokeWidth={2} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>{visualizeLabel}</TooltipContent>
        </Tooltip>
        <div className={TURN_ACTION_ANCHOR_CLASS} ref={menuRef}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={TURN_ACTION_TRIGGER_CLASS}
                type="button"
                aria-label="更多消息操作"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((isOpen) => !isOpen)}
              >
                <MoreHorizontal size={18} strokeWidth={2.2} />
              </button>
            </TooltipTrigger>
            <TooltipContent>更多操作</TooltipContent>
          </Tooltip>
          {menuOpen ? (
            <div className={TURN_ACTION_MENU_CLASS} role="menu">
              <button className={TURN_ACTION_MENU_BUTTON_CLASS} type="button" role="menuitem" disabled>
                分叉会话
              </button>
              <button className={TURN_ACTION_MENU_BUTTON_CLASS} type="button" role="menuitem" onClick={() => void handleCopy(copyText)}>
                复制消息
              </button>
              <button className={TURN_ACTION_MENU_BUTTON_CLASS} type="button" role="menuitem" onClick={() => void handleCopy(latestAssistantMessage.id)}>
                复制请求 ID
              </button>
              {visualizeState === "ready" || visualizeState === "error" ? (
                <button
                  className={TURN_ACTION_MENU_BUTTON_CLASS}
                  type="button"
                  role="menuitem"
                  onClick={() => void handleVisualize(true)}
                >
                  重新生成可视化
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ConversationView({
  messages,
  contextSnapshot,
  contextState,
  durableSurfaceMessageCount,
  composerPhase,
  sessionId = null,
  isStreaming = false,
  isAborting = false,
  sendScrollRequestId = 0,
  composerFocusRequestId = 0,
  onSend,
  onAbort,
  isSessionReady = true,
  defaultModelId,
  selectedModelId,
  onSelectedModelChange,
  composerMode,
  onComposerModeChange,
  selectedSkills,
  onSelectedSkillsChange,
  workspaceOptions,
  selectedWorkspaceRoot,
  onSelectWorkspace,
  executionContext,
  draftRestore,
  draftKey,
  readDraft,
  writeDraft,
  reviewSummary,
  onOpenReview,
  models,
  activeView = "chat",
  trajectory,
}: {
  messages: MessageBlock[];
  contextSnapshot: ContextUsageSnapshot | null;
  contextState?: ContextState | null;
  /** Durable Surface count from ClientSessionStore; prevents the composer from treating a stale local list as blank. */
  durableSurfaceMessageCount?: number;
  /** Session-owned phase from ClientSessionStore; local message length is only a fallback for isolated tests. */
  composerPhase?: "blank" | "engaging" | "active";
  sessionId?: string | null;
  isStreaming?: boolean;
  isAborting?: boolean;
  sendScrollRequestId?: number;
  composerFocusRequestId?: number;
  onSend?: (text: string, options: ComposerSendOptions) => void;
  onAbort?: () => void;
  isSessionReady?: boolean;
  defaultModelId?: ModelSelectionId;
  selectedModelId?: ModelSelectionId;
  onSelectedModelChange?: (modelId: ModelSelectionId) => void;
  composerMode?: ComposerMode;
  onComposerModeChange?: (mode: ComposerMode) => void;
  selectedSkills?: string[];
  onSelectedSkillsChange?: (skills: string[]) => void;
  models?: UsableModelView[];
  workspaceOptions?: ComposerWorkspaceOption[];
  selectedWorkspaceRoot?: string | null;
  onSelectWorkspace?: (workspaceRoot: string) => void;
  executionContext?: ComposerExecutionContext;
  draftRestore?: ComposerDraftRestore | null;
  draftKey?: string;
  readDraft?: ComposerDraftReader;
  writeDraft?: ComposerDraftWriter;
  reviewSummary?: ComposerReviewSummary | null;
  onOpenReview?: () => void;
  activeView?: SessionMainView;
  trajectory?: RuntimeV2TrajectorySnapshot | null;
}) {
  const sessionProjection = useOptionalSessionProjection();
  const projectionCell = sessionProjection !== null && sessionProjection.sessionId !== null && (sessionId === null || sessionId === undefined || sessionProjection.sessionId === sessionId)
    ? sessionProjection.cell
    : null;
  const projectedSurfaceMessages = projectionCell ? selectSurfaceMessages(projectionCell) : [];
  const projectedComposer = projectionCell ? selectComposer(projectionCell) : null;
  const projectedProviderUsage = projectionCell ? selectProviderUsage(projectionCell) : null;
  const projectedContextEstimate = projectionCell ? selectRequestContextEstimate(projectionCell) : null;
  const effectiveContextSnapshot = contextSnapshot
    ?? (projectedProviderUsage ? providerUsageToContextSnapshot(projectedProviderUsage) : null)
    ?? (projectedContextEstimate ? contextEstimateToSnapshot(projectedContextEstimate) : null);
  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages]);
  const inputHistory = useMemo(
    () => messages
      .filter((message): message is UserMessageBlock => message.kind === "user" && message.content.length > 0)
      .map((message) => message.content),
    [messages],
  );
  const turnNavigationItems = useMemo(
    () => createTurnNavigationItems(turns, isStreaming),
    [isStreaming, turns],
  );
  const durableMessageCount = durableSurfaceMessageCount ?? (projectedSurfaceMessages.length > 0 ? projectedSurfaceMessages.length : messages.length);
  const hasConversationContent = durableMessageCount > 0 || messages.length > 0;
  const requestedComposerPhase = composerPhase ?? projectedComposer?.phase;
  const resolvedComposerPhase = requestedComposerPhase === "blank" && hasConversationContent
    ? "active"
    : requestedComposerPhase ?? (durableMessageCount === 0 ? "blank" : "active");
  const projectionSessionReady = projectionCell !== null && projectionCell.status !== "error";
  const resolvedSessionReady = projectedComposer?.phase !== "blank" || isSessionReady || projectionSessionReady;
  const isInitialComposer = resolvedSessionReady && resolvedComposerPhase === "blank" && !isStreaming;
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const messageStackRef = useRef<HTMLDivElement | null>(null);
  const turnElementsRef = useRef(new Map<string, HTMLElement>());
  const updateConversationViewportRef = useRef<() => void>(() => {});
  // 是否「贴底自动跟随」：流式输出时保持视图贴底；用户向上滚动阅读历史则暂停，
  // 滚回接近底部时恢复（类似 Cursor 的聊天滚动）。
  const stickToBottomRef = useRef(true);
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [turnRailVisible, setTurnRailVisible] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(turnNavigationItems[0]?.id ?? null);
  const openedSubagentRuns = useRef(new Set<string>());
  const { openTab } = useRightPanel();
  const openContextTab = () => openTab({ id: "context", kind: "context", title: "上下文" });
  const openAttachmentPreview = useCallback((attachment: ComposerAttachment) => {
    if (!attachment.previewUrl) return;
    openTab({
      id: `composer-attachment:${attachment.id}`,
      kind: "image",
      title: attachment.name,
      src: attachment.previewUrl,
    });
  }, [openTab]);

  const openAgentTranscript = useCallback((message: AgentMessageBlock) => {
    if (sessionId) openTab({ id: "subagents", kind: "subagents", title: "子 Agent", sessionId, selected: message });
  }, [sessionId, openTab]);
  const openReadFile = useCallback(async (message: ReadMessageBlock) => {
    const workspaceRoot = selectedWorkspaceRoot?.trim();
    const relativePath = message.filePath.trim();
    const api = typeof window !== "undefined" ? window.actspace?.readWorkspaceFile : undefined;
    if (!workspaceRoot || !api || !isSafeWorkspaceRelativePath(relativePath)) return;
    try {
      openTab(tabFromFile(await api({ workspaceRoot, relativePath })));
    } catch {
      const title = relativePath.split(/[\\/]/).pop() || relativePath;
      openTab(readFailureTab(relativePath, title));
    }
  }, [openTab, selectedWorkspaceRoot]);
  useEffect(() => {
    const turn = turns.at(-1);
    if (!sessionId || !isStreaming || !turn?.messages.some((message) => message.kind === "agent")) return;
    const key = `${sessionId}:${turn.id}`;
    if (openedSubagentRuns.current.has(key)) return;
    openedSubagentRuns.current.add(key);
    openTab({ id: "subagents", kind: "subagents", title: "子 Agent", sessionId });
  }, [sessionId, turns, isStreaming, openTab]);

  const updateConversationViewport = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const scrollable = el.scrollHeight > el.clientHeight + 1;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = !scrollable || distanceFromBottom < SCROLL_BOTTOM_THRESHOLD_PX;
    stickToBottomRef.current = atBottom;
    setIsAwayFromBottom(scrollable && !atBottom);
    setTurnRailVisible(
      scrollable &&
      el.clientWidth >= TURN_RAIL_MIN_VIEWPORT_WIDTH_PX &&
      turnNavigationItems.length >= TURN_RAIL_MIN_TURNS,
    );

    if (turnNavigationItems.length === 0) {
      setActiveTurnId(null);
      return;
    }

    if (atBottom) {
      setActiveTurnId(turnNavigationItems[turnNavigationItems.length - 1].id);
      return;
    }

    const viewportRect = el.getBoundingClientRect();
    const readingLine = viewportRect.top + Math.min(el.clientHeight * 0.32, 180);
    let nextActiveTurnId = turnNavigationItems[0].id;

    for (const item of turnNavigationItems) {
      const turnElement = turnElementsRef.current.get(item.id);
      if (!turnElement) continue;
      if (turnElement.getBoundingClientRect().top <= readingLine) {
        nextActiveTurnId = item.id;
        continue;
      }
      break;
    }

    setActiveTurnId(nextActiveTurnId);
  }, [turnNavigationItems]);

  useLayoutEffect(() => {
    updateConversationViewportRef.current = updateConversationViewport;
  }, [updateConversationViewport]);

  // 用户滚动时统一更新贴底状态、回底按钮和当前轮次。
  const handleMessagesScroll = useCallback(() => {
    updateConversationViewport();
  }, [updateConversationViewport]);

  // 流式输出 / 消息增长时，若仍处于贴底状态则跟随滚动到底部。
  const scrollToBottomIfStuck = useCallback(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    updateConversationViewportRef.current();
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    bottomAnchorRef.current?.scrollIntoView?.({ block: "end" });
    el.scrollTop = el.scrollHeight;
    setIsAwayFromBottom(false);
    updateConversationViewportRef.current();
  }, []);

  const navigateToTurn = useCallback((turnId: string) => {
    const turnElement = turnElementsRef.current.get(turnId);
    if (!turnElement) return;
    stickToBottomRef.current = false;
    setIsAwayFromBottom(true);
    setActiveTurnId(turnId);
    turnElement.scrollIntoView({ block: "start" });
    updateConversationViewport();
  }, [updateConversationViewport]);

  const setTurnElement = useCallback((turnId: string, element: HTMLElement | null) => {
    if (element) {
      turnElementsRef.current.set(turnId, element);
      return;
    }
    turnElementsRef.current.delete(turnId);
  }, []);

  useEffect(() => {
    if (sendScrollRequestId === 0) {
      return;
    }

    // 发送新消息时强制回到底部并恢复自动跟随。
    scrollToBottom();
  }, [scrollToBottom, sendScrollRequestId]);

  // 切换会话时重置为贴底状态，避免上一会话的「已上滚」状态影响新会话。
  useEffect(() => {
    stickToBottomRef.current = true;
    setIsAwayFromBottom(false);
  }, [sessionId]);

  useLayoutEffect(() => {
    scrollToBottomIfStuck();
    updateConversationViewport();
  }, [messages, scrollToBottomIfStuck, updateConversationViewport]);

  // 同一条 running 消息内部变高时（例如 write_file 持续追加 code preview），
  // messages 引用可能不变；观察消息栈尺寸，保持贴底状态继续跟随尾部。
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const viewport = scrollContainerRef.current;
    const stack = messageStackRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(() => {
      scrollToBottomIfStuck();
      updateConversationViewport();
    });
    observer.observe(viewport);
    if (stack) observer.observe(stack);
    return () => observer.disconnect();
  }, [messages, scrollToBottomIfStuck, updateConversationViewport]);



  return (
    <main className={CONVERSATION_SHELL_CLASS}>
      <div className={MESSAGE_VIEWPORT_CLASS}>
        <div
          className={activeView === "trajectory" ? "hidden" : "block h-full min-h-0"}
          aria-hidden={activeView === "trajectory"}
        >
          <section
            ref={scrollContainerRef}
            onScroll={handleMessagesScroll}
            className={isInitialComposer ? MESSAGE_SCROLL_INITIAL_CLASS : MESSAGE_SCROLL_CLASS}
            aria-label="会话消息"
          >
              {isInitialComposer ? (
                <div className={INITIAL_COMPOSER_STAGE_CLASS}>
                  <Composer
                    contextSnapshot={effectiveContextSnapshot}
                    contextState={contextState}
                    isStreaming={isStreaming}
                    isAborting={isAborting}
                    onSend={onSend}
                    onAbort={onAbort}
                    surface="initial"
                    defaultModelId={defaultModelId}
                    selectedModelId={selectedModelId}
                    onSelectedModelChange={onSelectedModelChange}
                    mode={composerMode}
                    onModeChange={onComposerModeChange}
                    selectedSkills={selectedSkills}
                    onSelectedSkillsChange={onSelectedSkillsChange}
                    onOpenAttachmentPreview={openAttachmentPreview}
                    onExpandContext={openContextTab}
                    workspaceOptions={workspaceOptions}
                    selectedWorkspaceRoot={selectedWorkspaceRoot}
                    onSelectWorkspace={onSelectWorkspace}
                    executionContext={executionContext}
                    draftRestore={draftRestore}
                    draftKey={draftKey}
                    readDraft={readDraft}
                    writeDraft={writeDraft}
                    inputHistory={inputHistory}
                    focusRequestId={composerFocusRequestId}
                    models={models}
                    sessionId={sessionId}
                  />
                </div>
              ) : (
                <div ref={messageStackRef} className={MESSAGE_STACK_CLASS}>
                  {turns.map((turn, turnIndex) => (
                    <section
                      className={MESSAGE_TURN_CLASS}
                      key={turn.id}
                      ref={turn.user ? (element) => setTurnElement(turn.id, element) : undefined}
                      data-conversation-turn-id={turn.user ? turn.id : undefined}
                    >
                      <TurnPrompt turn={turn} onOpenAttachmentPreview={openAttachmentPreview} />
                      <div className={ASSISTANT_TURN_GROUP_CLASS}>
                        <div className={TURN_BODY_CLASS}>
                          {renderTurnBody(turn, isStreaming && turnIndex === turns.length - 1, openAgentTranscript, openReadFile)}
                        </div>
                        {splitTurnMessages(turn.messages).finalReply.length > 0
                          && (!isStreaming || turnIndex !== turns.length - 1) ? (
                          <TurnOutputArtifacts
                            messages={turn.messages}
                            sessionId={sessionId}
                            workspaceRoot={selectedWorkspaceRoot}
                          />
                        ) : null}
                        <TurnActions
                          sessionId={sessionId}
                          assistantMessages={
                            splitTurnMessages(turn.messages).finalReply.filter(
                              (message): message is AssistantMessageBlock => message.kind === "assistant",
                            )
                          }
                        />
                      </div>
                    </section>
                  ))}
                  <div ref={bottomAnchorRef} aria-hidden="true" />
                </div>
              )}
          </section>

          {turnRailVisible ? (
            <ConversationTurnRail
              items={turnNavigationItems}
              activeTurnId={activeTurnId}
              onNavigate={navigateToTurn}
            />
          ) : null}
          {isAwayFromBottom ? <ScrollToBottomButton onClick={scrollToBottom} /> : null}
        </div>
        {activeView === "trajectory" ? <div className="flex h-full min-h-0 flex-col">
          {isStreaming ? <div className="flex shrink-0 justify-end border-b border-line px-4 py-2"><button type="button" className="rounded-act-md border border-line px-3 py-1 text-[12px] text-text-main hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring" onClick={onAbort} disabled={isAborting}>{isAborting ? "正在停止…" : "停止"}</button></div> : null}
          <div className="min-h-0 flex-1"><TrajectoryView snapshot={trajectory ?? null} /></div>
        </div> : null}
      </div>

      {resolvedSessionReady && !isInitialComposer ? (
        <div className="composer-zone grid min-w-0 w-full gap-3 overflow-visible pb-5" style={activeView === "trajectory" ? { display: "none" } : undefined} aria-hidden={activeView === "trajectory"}>
          <Composer
            contextSnapshot={effectiveContextSnapshot}
            contextState={contextState}
            isStreaming={isStreaming}
            isAborting={isAborting}
            onSend={onSend}
            onAbort={onAbort}
            surface="followup"
            defaultModelId={defaultModelId}
            selectedModelId={selectedModelId}
            onSelectedModelChange={onSelectedModelChange}
            mode={composerMode}
            onModeChange={onComposerModeChange}
            selectedSkills={selectedSkills}
            onSelectedSkillsChange={onSelectedSkillsChange}
            onOpenAttachmentPreview={openAttachmentPreview}
            onExpandContext={openContextTab}
            workspaceOptions={workspaceOptions}
            selectedWorkspaceRoot={selectedWorkspaceRoot}
            onSelectWorkspace={onSelectWorkspace}
            executionContext={executionContext}
            draftRestore={draftRestore}
            draftKey={draftKey}
            readDraft={readDraft}
            writeDraft={writeDraft}
            inputHistory={inputHistory}
            focusRequestId={composerFocusRequestId}
            reviewSummary={reviewSummary}
            onOpenReview={onOpenReview}
            models={models}
            sessionId={sessionId}
          />
        </div>
      ) : null}
    </main>
  );
}
