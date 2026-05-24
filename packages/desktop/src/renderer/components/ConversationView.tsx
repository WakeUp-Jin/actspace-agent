import { MoreHorizontal, PanelRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ContextUsageSnapshot, MessageBlock } from "@actspace/shared";
import { Composer, type ComposerProvider } from "./Composer";
import { AssistantReply } from "./messages/AssistantReply";
import { BashRunBlock } from "./messages/BashRunBlock";
import { EditDiffBlock } from "./messages/EditDiffBlock";
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

function renderMessage(message: MessageBlock) {
  switch (message.kind) {
    case "user":
      return <UserMessage key={message.id} message={message} />;
    case "assistant":
      return <AssistantReply key={message.id} message={message} />;
    case "thinking":
      return <ThinkingBlock key={message.id} message={message} />;
    case "bash":
      return <BashRunBlock key={message.id} message={message} />;
    case "read":
    case "search":
    case "tool":
    case "error":
      return <ToolLogLine key={message.id} message={message} />;
    case "edit_diff":
      return <EditDiffBlock key={message.id} message={message} />;
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
    <div className="turn-actions">
      <div className="turn-action-anchor" ref={menuRef}>
        <button
          className="turn-action-trigger"
          type="button"
          aria-label="Open message actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
        >
          <MoreHorizontal size={18} strokeWidth={2.2} />
        </button>
        {menuOpen ? (
          <div className="turn-action-menu" role="menu">
            <button type="button" role="menuitem" disabled>
              Fork Chat
            </button>
            <button type="button" role="menuitem" onClick={() => void handleCopy(copyText)}>
              Copy Message
            </button>
            <button type="button" role="menuitem" onClick={() => void handleCopy(latestAssistantMessage.id)}>
              Copy Request ID
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConversationView({
  title,
  messages,
  contextSnapshot,
  rightPanelOpen,
  onToggleRightPanel,
  isStreaming = false,
  onSend,
  showDemoAttachments = false,
}: {
  title: string;
  messages: MessageBlock[];
  contextSnapshot: ContextUsageSnapshot | null;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  isStreaming?: boolean;
  onSend?: (text: string, options: { provider: ComposerProvider; thinkingEnabled: boolean }) => void;
  showDemoAttachments?: boolean;
}) {
  const turns = groupMessagesIntoTurns(messages);

  return (
    <main className="conversation-shell">
      <header className="topbar">
        <div className="topbar-title">
          <h1>{title}</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="topbar-panel-toggle"
            type="button"
            aria-label={rightPanelOpen ? "Close panel" : "Open panel"}
            aria-pressed={rightPanelOpen}
            onClick={onToggleRightPanel}
          >
            <PanelRight size={16} strokeWidth={2.1} />
          </button>
        </div>
      </header>

      <section className="message-scroll" aria-label="Conversation messages">
        <div className="message-stack">
          {turns.map((turn) => (
            <section className="message-turn" key={turn.id}>
              {turn.user ? (
                <div className="turn-prompt">
                  <UserMessage message={turn.user} />
                </div>
              ) : null}
              <div className="turn-body">{turn.messages.map(renderMessage)}</div>
              <TurnActions
                assistantMessages={
                  turn.messages.filter((message): message is AssistantMessageBlock => message.kind === "assistant")
                }
              />
            </section>
          ))}
        </div>
      </section>

      <div className="composer-zone">
        <Composer
          contextSnapshot={contextSnapshot}
          isStreaming={isStreaming}
          onSend={onSend}
          showDemoAttachments={showDemoAttachments}
        />
      </div>
    </main>
  );
}
