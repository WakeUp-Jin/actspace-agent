import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Infinity, Paperclip, SendHorizontal, X } from "lucide-react";
import type { ContextUsageSnapshot } from "@actspace/shared";
import { ContextPopup } from "./ContextPopup";

export function Composer({
  contextSnapshot,
  isStreaming = false,
  onSend,
}: {
  contextSnapshot: ContextUsageSnapshot | null;
  isStreaming?: boolean;
  onSend?: (text: string) => void;
}) {
  const [modeOpen, setModeOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [imageAttached, setImageAttached] = useState(true);
  const [fileAttached, setFileAttached] = useState(true);
  const [message, setMessage] = useState("");
  const composerRef = useRef<HTMLElement | null>(null);
  const hasAttachments = imageAttached || fileAttached;

  function closeFloatingPanels() {
    setModeOpen(false);
    setModelOpen(false);
    setContextOpen(false);
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (composerRef.current?.contains(event.target as Node)) {
        return;
      }

      closeFloatingPanels();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeFloatingPanels();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <footer className="composer-wrap" ref={composerRef}>
      {contextOpen ? <ContextPopup snapshot={contextSnapshot} onClose={() => setContextOpen(false)} /> : null}

      {hasAttachments ? (
        <div className="composer-attachments" aria-label="Attached files">
          {imageAttached ? (
            <div className="image-attachment" aria-label="Attached image preview">
              <button
                className="attachment-remove image-attachment-remove"
                type="button"
                aria-label="Remove attached image"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setImageAttached(false);
                }}
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
          ) : null}
          {fileAttached ? (
            <div className="file-attachment">
              <FileText size={19} strokeWidth={1.9} aria-hidden="true" />
              README.md
              <button
                className="attachment-remove file-attachment-remove"
                type="button"
                aria-label="Remove README.md"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setFileAttached(false);
                }}
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <textarea
        className="composer-input"
        aria-label="Message composer"
        placeholder="Plan, Build, / for commands, @ for context"
        value={message}
        disabled={isStreaming}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (message.trim() && onSend && !isStreaming) {
              onSend(message.trim());
              setMessage("");
            }
          }
        }}
      />

      <div className="composer-controls">
        <div className="control-group">
          <button
            className="mode-button"
            type="button"
            aria-expanded={modeOpen}
            onClick={() => {
              setModeOpen((value) => !value);
              setModelOpen(false);
              setContextOpen(false);
            }}
          >
            <Infinity size={19} strokeWidth={2.1} aria-hidden="true" />
            Agent
            <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
          {modeOpen ? (
            <div className="dropdown-menu mode-menu">
              {["Agent", "Plan", "Debug", "Multitask", "Ask"].map((mode) => (
                <button type="button" key={mode} className={mode === "Agent" ? "is-selected" : ""}>
                  <span>{mode}</span>
                  {mode === "Agent" ? <Check size={14} strokeWidth={2.2} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="control-group">
          <button
            className="model-button"
            type="button"
            aria-expanded={modelOpen}
            onClick={() => {
              setModelOpen((value) => !value);
              setModeOpen(false);
              setContextOpen(false);
            }}
          >
            actspace-4.1
            <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
          {modelOpen ? (
            <div className="dropdown-menu model-menu">
              {["actspace-4.1", "deepseek-chat", "deepseek-reasoner", "claude-opus-4-6", "gpt-4.1"].map((model) => (
                <button type="button" key={model} className={model === "actspace-4.1" ? "is-selected" : ""}>
                  <span>{model}</span>
                  {model === "actspace-4.1" ? <Check size={14} strokeWidth={2.2} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="composer-spacer" />
        <button className="attach-button" type="button" aria-label="Add files">
          <Paperclip size={20} strokeWidth={2.1} />
        </button>
        <button
          className="context-button"
          type="button"
          aria-label="Show context usage"
          aria-expanded={contextOpen}
          onClick={() => {
            setContextOpen((value) => !value);
            setModeOpen(false);
            setModelOpen(false);
          }}
        >
          <span className="context-ring" aria-hidden="true" />
        </button>
        <button
          className="send-button"
          type="button"
          aria-label="Send message"
          disabled={isStreaming || !message.trim()}
          onClick={() => {
            if (message.trim() && onSend && !isStreaming) {
              onSend(message.trim());
              setMessage("");
            }
          }}
        >
          <SendHorizontal size={18} strokeWidth={2.2} />
        </button>
      </div>
    </footer>
  );
}
