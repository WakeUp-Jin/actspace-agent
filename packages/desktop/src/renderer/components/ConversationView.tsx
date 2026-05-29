import { MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ContextUsageSnapshot, MessageBlock, ModelId } from "@actspace/shared";
import { Composer, type ComposerSendOptions } from "./Composer";
import { AssistantReply } from "./messages/AssistantReply";
import { BashRunBlock } from "./messages/BashRunBlock";
import { FileDiffBlock } from "./messages/FileDiffBlock";
import { ThinkingBlock } from "./messages/ThinkingBlock";
import { ToolLogLine } from "./messages/ToolLogLine";
import { UserMessage } from "./messages/UserMessage";

type UserMessageBlock = Extract<MessageBlock, { kind: "user" }>;
type AssistantMessageBlock = Extract<MessageBlock, { kind: "assistant" }>;

type ConversationTurn = {
  id: string;
  user: UserMessageBlock | null;
  messages: MessageBlock[];
};

const CONVERSATION_SHELL_CLASS =
  "conversation-shell grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-white pt-[var(--window-chrome-strip-height)]";
const MESSAGE_SCROLL_CLASS = "message-scroll min-h-0 overflow-auto bg-white pb-6 [scrollbar-gutter:stable_both-edges]";
const MESSAGE_SCROLL_INITIAL_CLASS =
  "message-scroll message-scroll-initial min-h-0 overflow-auto bg-white pb-6 [scrollbar-gutter:stable_both-edges]";
const MESSAGE_STACK_CLASS =
  "message-stack mx-auto flex w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] flex-col gap-7 pb-7";
const INITIAL_COMPOSER_STAGE_CLASS =
  "initial-composer-stage flex h-full min-h-[420px] items-center justify-center px-[var(--conversation-inline-padding)]";
const MESSAGE_TURN_CLASS = "message-turn relative flex flex-col gap-0";
const TURN_PROMPT_CLASS =
  "turn-prompt sticky top-0 z-12 bg-[linear-gradient(180deg,#fff_0%,rgba(255,255,255,0.96)_78%,rgba(255,255,255,0)_100%)] py-4";
const TURN_BODY_CLASS = "turn-body flex flex-col gap-[9px]";
const TURN_ACTIONS_CLASS = "turn-actions mt-[-12px] flex min-h-6 justify-end";
const TURN_ACTION_ANCHOR_CLASS = "turn-action-anchor relative flex-none";
const TURN_ACTION_TRIGGER_CLASS =
  "turn-action-trigger grid h-[30px] w-[30px] place-items-center rounded-act-md border-0 bg-transparent text-text-faint opacity-65 transition-[background,color,opacity] duration-[150ms] ease-in-out hover:bg-brand-soft hover:text-brand-strong hover:opacity-100 aria-expanded:bg-brand-soft aria-expanded:text-brand-strong aria-expanded:opacity-100";
const TURN_ACTION_MENU_CLASS =
  "turn-action-menu absolute bottom-[30px] right-0 z-40 w-[178px] rounded-act-md border border-line bg-white/98 p-1.5 shadow-act-popover";
const TURN_ACTION_MENU_BUTTON_CLASS =
  "flex min-h-[34px] w-full items-center rounded-act-sm border-0 bg-transparent px-2.5 text-left text-sm font-semibold text-text-main transition-colors duration-[150ms] ease-in-out hover:bg-brand-soft hover:text-brand disabled:cursor-default disabled:text-text-faint";
const TURN_STATUS_LINE_CLASS = "turn-status-line w-fit py-0.5 text-[13px] leading-[1.4] text-[#8b95a5]";
const TURN_STATUS_LINE_ERROR_CLASS = "is-error text-[#b45858]";
const COMPACT_MESSAGE_RELATION_CLASS = "-mt-1";

const TOOL_LOG_MESSAGE_KINDS = new Set<MessageBlock["kind"]>([
  "read",
  "search",
  "grep",
  "glob",
  "web_search",
  "directory_list",
  "tool",
  "error",
]);
const DIFF_MESSAGE_KINDS = new Set<MessageBlock["kind"]>(["edit_diff", "write_diff"]);

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
    (previousIsTool && currentIsDiff)
  ) {
    return COMPACT_MESSAGE_RELATION_CLASS;
  }

  return undefined;
}

function renderMessage(message: MessageBlock, className?: string) {
  switch (message.kind) {
    case "user":
      return <UserMessage key={message.id} message={message} />;
    case "assistant":
      return <AssistantReply key={message.id} message={message} />;
    case "thinking":
      return <ThinkingBlock key={message.id} message={message} className={className} />;
    case "bash":
      return <BashRunBlock key={message.id} message={message} />;
    case "read":
    case "search":
    case "grep":
    case "glob":
    case "web_search":
    case "directory_list":
    case "tool":
    case "error":
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

function TurnActions({ assistantMessages }: { assistantMessages: AssistantMessageBlock[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className={TURN_ACTIONS_CLASS}>
      <div className={TURN_ACTION_ANCHOR_CLASS} ref={menuRef}>
        <button
          className={TURN_ACTION_TRIGGER_CLASS}
          type="button"
          aria-label="Open message actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
        >
          <MoreHorizontal size={18} strokeWidth={2.2} />
        </button>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConversationView({
  messages,
  contextSnapshot,
  isStreaming = false,
  isAborting = false,
  sendScrollRequestId = 0,
  onSend,
  onAbort,
  isSessionReady = true,
  showDemoAttachments = false,
  defaultModelId,
}: {
  messages: MessageBlock[];
  contextSnapshot: ContextUsageSnapshot | null;
  isStreaming?: boolean;
  isAborting?: boolean;
  sendScrollRequestId?: number;
  onSend?: (text: string, options: ComposerSendOptions) => void;
  onAbort?: () => void;
  isSessionReady?: boolean;
  showDemoAttachments?: boolean;
  defaultModelId?: ModelId;
}) {
  const turns = groupMessagesIntoTurns(messages);
  const isInitialComposer = isSessionReady && messages.length === 0 && !isStreaming;
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (sendScrollRequestId === 0) {
      return;
    }

    bottomAnchorRef.current?.scrollIntoView({ block: "end" });
  }, [sendScrollRequestId]);

  return (
    <main className={CONVERSATION_SHELL_CLASS}>
      <section className={isInitialComposer ? MESSAGE_SCROLL_INITIAL_CLASS : MESSAGE_SCROLL_CLASS} aria-label="Conversation messages">
        {isInitialComposer ? (
          <div className={INITIAL_COMPOSER_STAGE_CLASS}>
            <Composer
              contextSnapshot={contextSnapshot}
              isStreaming={isStreaming}
              isAborting={isAborting}
              onSend={onSend}
              onAbort={onAbort}
              surface="initial"
              showDemoAttachments={showDemoAttachments}
              defaultModelId={defaultModelId}
            />
          </div>
        ) : (
          <div className={MESSAGE_STACK_CLASS}>
            {turns.map((turn) => (
              <section className={MESSAGE_TURN_CLASS} key={turn.id}>
                {turn.user ? (
                  <div className={TURN_PROMPT_CLASS}>
                    <UserMessage message={turn.user} />
                  </div>
                ) : null}
                <div className={TURN_BODY_CLASS}>
                  {turn.messages.map((message, index) =>
                    renderMessage(message, getMessageRelationClass(turn.messages[index - 1], message))
                  )}
                </div>
                <TurnActions
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
        <div className="composer-zone grid w-full overflow-visible pb-5">
          <Composer
            contextSnapshot={contextSnapshot}
            isStreaming={isStreaming}
            isAborting={isAborting}
            onSend={onSend}
            onAbort={onAbort}
            surface="followup"
            showDemoAttachments={showDemoAttachments}
            defaultModelId={defaultModelId}
          />
        </div>
      ) : null}
    </main>
  );
}
