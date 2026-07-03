import { Eye, Loader2, MoreHorizontal, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContextUsageSnapshot, MessageBlock, ModelId } from "@actspace/shared";
import { Composer, type ComposerReviewSummary, type ComposerSendOptions, type ComposerWorkspaceOption } from "./Composer";
import { useRightPanel } from "./right-panel/RightPanelContext";
import { AssistantReply } from "./messages/AssistantReply";
import { AgentRunBlock } from "./messages/AgentRunBlock";
import { ExploreRunBlock } from "./messages/ExploreRunBlock";
import { BashRunBlock } from "./messages/BashRunBlock";
import { CompactCommandBlock } from "./messages/CompactCommandBlock";
import { DeleteFileBlock } from "./messages/DeleteFileBlock";
import { FileDiffBlock } from "./messages/FileDiffBlock";
import { SubAgentTranscriptPanel } from "./messages/SubAgentTranscriptModal";
import { ThinkingBlock } from "./messages/ThinkingBlock";
import { ToolActivityGroup } from "./messages/ToolActivityGroup";
import { ToolLogLine } from "./messages/ToolLogLine";
import { UserMessage } from "./messages/UserMessage";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

type UserMessageBlock = Extract<MessageBlock, { kind: "user" }>;
type AssistantMessageBlock = Extract<MessageBlock, { kind: "assistant" }>;
type AgentMessageBlock = Extract<MessageBlock, { kind: "agent" }>;

type ConversationTurn = {
  id: string;
  user: UserMessageBlock | null;
  messages: MessageBlock[];
};

const CONVERSATION_SHELL_CLASS =
  "conversation-shell grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-surface pt-[var(--window-chrome-strip-height)]";
const MESSAGE_SCROLL_CLASS = "message-scroll min-h-0 overflow-auto bg-surface pb-6 [scrollbar-gutter:stable_both-edges]";
const MESSAGE_SCROLL_INITIAL_CLASS =
  "message-scroll message-scroll-initial min-h-0 overflow-auto bg-surface pb-6 [scrollbar-gutter:stable_both-edges]";
const MESSAGE_STACK_CLASS =
  "message-stack mx-auto flex w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] flex-col gap-7 pb-7";
const INITIAL_COMPOSER_STAGE_CLASS =
  "initial-composer-stage flex h-full min-h-[420px] items-center justify-center px-[var(--conversation-inline-padding)]";
const MESSAGE_TURN_CLASS = "message-turn relative flex flex-col gap-0";
const TURN_PROMPT_CLASS =
  "turn-prompt sticky top-0 z-12 bg-[image:var(--act-gradient-surface-fade)] py-4";
const TURN_BODY_CLASS = "turn-body flex flex-col gap-[9px]";
const TURN_ACTIONS_CLASS = "turn-actions mt-[-12px] flex min-h-6 justify-end";
const TURN_ACTION_ANCHOR_CLASS = "turn-action-anchor relative flex-none";
const TURN_ACTION_TRIGGER_CLASS =
  "turn-action-trigger grid h-[30px] w-[30px] place-items-center rounded-act-md border-0 bg-transparent text-text-faint opacity-65 transition-[background,color,opacity] duration-[150ms] ease-in-out hover:bg-brand-soft hover:text-brand-strong hover:opacity-100 aria-disabled:cursor-default aria-expanded:bg-brand-soft aria-expanded:text-brand-strong aria-expanded:opacity-100";
const TURN_ACTION_MENU_CLASS =
  "turn-action-menu absolute bottom-[30px] right-0 z-40 w-[178px] rounded-act-md border border-line bg-surface-raised/98 p-1.5 shadow-act-popover";
const TURN_ACTION_MENU_BUTTON_CLASS =
  "flex min-h-[34px] w-full items-center rounded-act-sm border-0 bg-transparent px-2.5 text-left text-sm font-semibold text-text-main transition-colors duration-[150ms] ease-in-out hover:bg-brand-soft hover:text-brand disabled:cursor-default disabled:text-text-faint";
const TURN_STATUS_LINE_CLASS = "turn-status-line w-fit py-0.5 text-[13px] leading-[1.4] text-text-faint";
const TURN_STATUS_LINE_ERROR_CLASS = "is-error text-on-danger";
const COMPACT_MESSAGE_RELATION_CLASS = "-mt-1";

const TOOL_LOG_MESSAGE_KINDS = new Set<MessageBlock["kind"]>([
  "read",
  "search",
  "grep",
  "glob",
  "web_search",
  "media_analysis",
  "directory_list",
  "delete",
  "agent",
  "tool",
  "error",
]);
const DIFF_MESSAGE_KINDS = new Set<MessageBlock["kind"]>(["edit_diff", "write_diff"]);
const SYSTEM_MESSAGE_KINDS = new Set<MessageBlock["kind"]>(["context_compaction", "status"]);

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

function renderMessage(
  message: MessageBlock,
  className?: string,
  onOpenAgentTranscript?: (message: AgentMessageBlock) => void,
) {
  switch (message.kind) {
    case "user":
      return <UserMessage key={message.id} message={message} />;
    case "assistant":
      return <AssistantReply key={message.id} message={message} />;
    case "thinking":
      return <ThinkingBlock key={message.id} message={message} className={className} />;
    case "agent":
      if (message.display === "inline") {
        return <ExploreRunBlock key={message.id} message={message} className={className} />;
      }
      return <AgentRunBlock key={message.id} message={message} className={className} onOpenTranscript={onOpenAgentTranscript} />;
    case "bash":
      return <BashRunBlock key={message.id} message={message} />;
    case "context_compaction":
      return <CompactCommandBlock key={message.id} message={message} className={className} />;
    case "read":
    case "search":
    case "grep":
    case "glob":
    case "web_search":
    case "media_analysis":
    case "directory_list":
    case "delete":
    case "tool":
    case "error":
      if (message.kind === "delete" && message.status === "pending") {
        return <DeleteFileBlock key={message.id} message={message} className={className} />;
      }
      return <ToolLogLine key={message.id} message={message} className={className} />;
    case "status":
      return (
        <div
          key={message.id}
          className={`${TURN_STATUS_LINE_CLASS}${message.tone === "error" ? ` ${TURN_STATUS_LINE_ERROR_CLASS}` : ""}`}
        >
          {message.content}
        </div>
      );
    case "edit_diff":
    case "write_diff":
      return <FileDiffBlock key={message.id} message={message} className={className} />;
  }
}

function groupMessagesIntoTurns(messages: MessageBlock[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: ConversationTurn | null = null;

  for (const message of messages) {
    if (message.kind === "user") {
      currentTurn = {
        id: message.id,
        user: message,
        messages: []
      };
      turns.push(currentTurn);
      continue;
    }

    if (message.kind === "context_compaction") {
      currentTurn = null;
      turns.push({
        id: message.id,
        user: null,
        messages: [message],
      });
      continue;
    }

    if (!currentTurn) {
      currentTurn = {
        id: `turn-${message.id}`,
        user: null,
        messages: []
      };
      turns.push(currentTurn);
    }

    currentTurn.messages.push(message);
  }

  return turns;
}

// 工具活动组：哪些消息算「过程行」（thinking + 工具 + diff），有它才把过程聚合成 Worked for 折叠组。
const WORK_TOOL_LIKE_KINDS = new Set<MessageBlock["kind"]>([
  ...TOOL_LOG_MESSAGE_KINDS,
  ...DIFF_MESSAGE_KINDS,
  "bash",
]);

function hasToolLikeItem(messages: MessageBlock[]): boolean {
  return messages.some((message) => WORK_TOOL_LIKE_KINDS.has(message.kind));
}

/**
 * 把一个 turn 的消息拆成「过程」和「最终回复」两段。
 *
 * 最终回复 = turn 末尾、后面不再跟任何工具/thinking 的连续 assistant 块。
 * 其余（thinking / 工具 / 工具间旁白 content）都归到过程段，进 Worked for 折叠组。
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

function workDurationMs(workItems: MessageBlock[], finalReply: MessageBlock[]): number | undefined {
  if (workItems.length === 0) return undefined;
  const start = Date.parse(workItems[0].createdAt);
  const endSource = finalReply[0]?.createdAt ?? workItems[workItems.length - 1].createdAt;
  const end = Date.parse(endSource);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return end - start;
}

type AgentTranscriptHandler = (message: AgentMessageBlock) => void;

function renderMessageList(messages: MessageBlock[], onOpenAgentTranscript?: AgentTranscriptHandler) {
  return messages.map((message, index) =>
    renderMessage(message, getMessageRelationClass(messages[index - 1], message), onOpenAgentTranscript),
  );
}

/**
 * 渲染一个 turn 的正文：含工具时把过程聚合进 ToolActivityGroup（执行中滚动视口 / 完成后 Worked for 折叠），
 * 最终回复始终留在折叠组外正常渲染；没有工具时回退到原来的平铺渲染。
 */
function renderTurnBody(
  turn: ConversationTurn,
  isActive: boolean,
  onOpenAgentTranscript?: AgentTranscriptHandler,
) {
  const { workItems, finalReply } = splitTurnMessages(turn.messages);

  if (!hasToolLikeItem(workItems)) {
    return renderMessageList(turn.messages, onOpenAgentTranscript);
  }

  return (
    <>
      <ToolActivityGroup
        running={isActive}
        durationMs={workDurationMs(workItems, finalReply)}
      >
        {renderMessageList(workItems, onOpenAgentTranscript)}
      </ToolActivityGroup>
      {finalReply.length > 0 ? renderMessageList(finalReply, onOpenAgentTranscript) : null}
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
              Fork Chat
            </button>
            <button className={TURN_ACTION_MENU_BUTTON_CLASS} type="button" role="menuitem" onClick={() => void handleCopy(copyText)}>
              Copy Message
            </button>
            <button className={TURN_ACTION_MENU_BUTTON_CLASS} type="button" role="menuitem" onClick={() => void handleCopy(latestAssistantMessage.id)}>
              Copy Request ID
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
  );
}

export function ConversationView({
  messages,
  contextSnapshot,
  sessionId = null,
  isStreaming = false,
  isAborting = false,
  sendScrollRequestId = 0,
  onSend,
  onAbort,
  isSessionReady = true,
  defaultModelId,
  selectedModelId,
  onSelectedModelChange,
  workspaceOptions,
  selectedWorkspaceRoot,
  onSelectWorkspace,
  reviewSummary,
  onOpenReview,
}: {
  messages: MessageBlock[];
  contextSnapshot: ContextUsageSnapshot | null;
  sessionId?: string | null;
  isStreaming?: boolean;
  isAborting?: boolean;
  sendScrollRequestId?: number;
  onSend?: (text: string, options: ComposerSendOptions) => void;
  onAbort?: () => void;
  isSessionReady?: boolean;
  defaultModelId?: ModelId;
  selectedModelId?: ModelId;
  onSelectedModelChange?: (modelId: ModelId) => void;
  workspaceOptions?: ComposerWorkspaceOption[];
  selectedWorkspaceRoot?: string | null;
  onSelectWorkspace?: (workspaceRoot: string) => void;
  reviewSummary?: ComposerReviewSummary | null;
  onOpenReview?: () => void;
}) {
  const turns = groupMessagesIntoTurns(messages);
  const isInitialComposer = isSessionReady && messages.length === 0 && !isStreaming;
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const messageStackRef = useRef<HTMLDivElement | null>(null);
  // 是否「贴底自动跟随」：流式输出时保持视图贴底；用户向上滚动阅读历史则暂停，
  // 滚回接近底部时恢复（类似 Cursor 的聊天滚动）。
  const stickToBottomRef = useRef(true);
  const [activeTranscriptMessage, setActiveTranscriptMessage] = useState<AgentMessageBlock | null>(null);
  const { openTab } = useRightPanel();
  const openContextTab = () => openTab({ id: "context", kind: "context", title: "Context" });

  const latestActiveTranscriptMessage = activeTranscriptMessage
    ? messages.find((message): message is AgentMessageBlock => message.kind === "agent" && message.id === activeTranscriptMessage.id) ?? activeTranscriptMessage
    : null;

  useEffect(() => {
    if (sendScrollRequestId === 0) {
      return;
    }

    // 发送新消息时强制回到底部并恢复自动跟随。
    stickToBottomRef.current = true;
    bottomAnchorRef.current?.scrollIntoView({ block: "end" });
  }, [sendScrollRequestId]);

  // 切换会话时重置为贴底状态，避免上一会话的「已上滚」状态影响新会话。
  useEffect(() => {
    stickToBottomRef.current = true;
  }, [sessionId]);

  // 用户滚动时判断是否贴底（距底 < 80px 视为贴底），决定是否继续自动跟随。
  const handleMessagesScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // 流式输出 / 消息增长时，若仍处于贴底状态则跟随滚动到底部。
  const scrollToBottomIfStuck = useCallback(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottomIfStuck();
  }, [messages, isStreaming, scrollToBottomIfStuck]);

  // 同一条 running 消息内部变高时（例如 write_file 持续追加 code preview），
  // messages 引用可能不变；观察消息栈尺寸，保持贴底状态继续跟随尾部。
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const stack = messageStackRef.current;
    if (!stack) return;

    const observer = new ResizeObserver(() => {
      scrollToBottomIfStuck();
    });
    observer.observe(stack);
    return () => observer.disconnect();
  }, [messages, isStreaming, scrollToBottomIfStuck]);

  useEffect(() => {
    if (!activeTranscriptMessage) return;
    const stillPresent = messages.some((message) => message.kind === "agent" && message.id === activeTranscriptMessage.id);
    if (!stillPresent) {
      setActiveTranscriptMessage(null);
    }
  }, [activeTranscriptMessage, messages]);

  return (
    <main className={CONVERSATION_SHELL_CLASS}>
      <section
        ref={scrollContainerRef}
        onScroll={handleMessagesScroll}
        className={isInitialComposer ? MESSAGE_SCROLL_INITIAL_CLASS : MESSAGE_SCROLL_CLASS}
        aria-label="Conversation messages"
      >
        {isInitialComposer ? (
          <div className={INITIAL_COMPOSER_STAGE_CLASS}>
            <Composer
              contextSnapshot={contextSnapshot}
              isStreaming={isStreaming}
              isAborting={isAborting}
              onSend={onSend}
              onAbort={onAbort}
              surface="initial"
              defaultModelId={defaultModelId}
              selectedModelId={selectedModelId}
              onSelectedModelChange={onSelectedModelChange}
              onExpandContext={openContextTab}
              workspaceOptions={workspaceOptions}
              selectedWorkspaceRoot={selectedWorkspaceRoot}
              onSelectWorkspace={onSelectWorkspace}
            />
          </div>
        ) : (
          <div ref={messageStackRef} className={MESSAGE_STACK_CLASS}>
            {turns.map((turn, turnIndex) => (
              <section className={MESSAGE_TURN_CLASS} key={turn.id}>
                {turn.user ? (
                  <div className={TURN_PROMPT_CLASS}>
                    <UserMessage message={turn.user} />
                  </div>
                ) : null}
                <div className={TURN_BODY_CLASS}>
                  {renderTurnBody(turn, isStreaming && turnIndex === turns.length - 1, setActiveTranscriptMessage)}
                </div>
                <TurnActions
                  sessionId={sessionId}
                  assistantMessages={
                    turn.messages.filter((message): message is AssistantMessageBlock => message.kind === "assistant")
                  }
                />
              </section>
            ))}
            <div ref={bottomAnchorRef} aria-hidden="true" />
          </div>
        )}
      </section>

      {isSessionReady && !isInitialComposer ? (
        <div className="composer-zone grid w-full gap-3 overflow-visible pb-5">
          {latestActiveTranscriptMessage ? (
            <SubAgentTranscriptPanel
              message={latestActiveTranscriptMessage}
              open={true}
              onClose={() => setActiveTranscriptMessage(null)}
            />
          ) : null}
          <Composer
            contextSnapshot={contextSnapshot}
            isStreaming={isStreaming}
            isAborting={isAborting}
            onSend={onSend}
            onAbort={onAbort}
            surface="followup"
            defaultModelId={defaultModelId}
            selectedModelId={selectedModelId}
            onSelectedModelChange={onSelectedModelChange}
            onExpandContext={openContextTab}
            workspaceOptions={workspaceOptions}
            selectedWorkspaceRoot={selectedWorkspaceRoot}
            onSelectWorkspace={onSelectWorkspace}
            reviewSummary={latestActiveTranscriptMessage ? null : reviewSummary}
            onOpenReview={onOpenReview}
          />
        </div>
      ) : null}
    </main>
  );
}
