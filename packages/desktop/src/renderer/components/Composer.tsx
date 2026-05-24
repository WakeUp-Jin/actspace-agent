import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Infinity, Paperclip, SendHorizontal, X } from "lucide-react";
import type { ContextUsageSnapshot } from "@actspace/shared";
import { ContextPopup } from "./ContextPopup";

export type ComposerProvider = "deepseek" | "kimi";

type ComposerSendOptions = {
  provider: ComposerProvider;
  thinkingEnabled: boolean;
};

const MODEL_OPTIONS: ComposerProvider[] = ["deepseek", "kimi"];

export function Composer({
  contextSnapshot,
  isStreaming = false,
  onSend,
  showDemoAttachments = false,
}: {
  contextSnapshot: ContextUsageSnapshot | null;
  isStreaming?: boolean;
  onSend?: (text: string, options: ComposerSendOptions) => void;
  showDemoAttachments?: boolean;
}) {
  const [modeOpen, setModeOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelOptionsOpen, setModelOptionsOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ComposerProvider>("deepseek");
  const [editingProvider, setEditingProvider] = useState<ComposerProvider>("deepseek");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [imageAttached, setImageAttached] = useState(showDemoAttachments);
  const [fileAttached, setFileAttached] = useState(showDemoAttachments);
  const [message, setMessage] = useState("");
  const composerRef = useRef<HTMLElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelOptionsRef = useRef<HTMLDivElement | null>(null);
  const hasAttachments = imageAttached || fileAttached;

  useEffect(() => {
    setImageAttached(showDemoAttachments);
    setFileAttached(showDemoAttachments);
  }, [showDemoAttachments]);

  function closeFloatingPanels() {
    setModeOpen(false);
    setModelOpen(false);
    setModelOptionsOpen(false);
    setContextOpen(false);
  }

  function sendCurrentMessage() {
    if (!message.trim() || !onSend || isStreaming) return;
    onSend(message.trim(), { provider: selectedProvider, thinkingEnabled });
    setMessage("");
    closeFloatingPanels();
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const clickedInsideModelPopover =
        modelButtonRef.current?.contains(target) ||
        modelMenuRef.current?.contains(target) ||
        modelOptionsRef.current?.contains(target);

      if (!clickedInsideModelPopover) {
        setModelOpen(false);
        setModelOptionsOpen(false);
      }

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
            sendCurrentMessage();
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
            ref={modelButtonRef}
            aria-expanded={modelOpen}
            onClick={() => {
              setModelOpen((value) => !value);
              setModelOptionsOpen(false);
              setModeOpen(false);
              setContextOpen(false);
            }}
          >
            {selectedProvider}
            <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
          {modelOpen ? (
            <div className="dropdown-menu model-menu" ref={modelMenuRef}>
              {MODEL_OPTIONS.map((provider) => (
                <div
                  className={`model-menu-row ${provider === selectedProvider ? "is-selected-row" : ""}`}
                  key={provider}
                >
                  <button
                    type="button"
                    className="model-select-button"
                    onClick={() => {
                      setSelectedProvider(provider);
                      setEditingProvider(provider);
                      setModelOptionsOpen(false);
                      setModelOpen(false);
                    }}
                  >
                    <span>{provider}</span>
                  </button>
                  <div className="model-row-actions">
                    <button
                      type="button"
                      className="model-edit-button"
                      aria-label={`Edit ${provider} options`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingProvider(provider);
                        setModelOptionsOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    {provider === selectedProvider ? (
                      <Check className="model-check-icon" size={14} strokeWidth={2.2} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {modelOpen && modelOptionsOpen ? (
            <div className="dropdown-menu model-options-menu" ref={modelOptionsRef}>
              <div className="dropdown-label">Options</div>
              <label className="option-toggle-row">
                <span>Thinking</span>
                <input
                  type="checkbox"
                  checked={thinkingEnabled}
                  onChange={(event) => setThinkingEnabled(event.target.checked)}
                  aria-label={`${editingProvider} Thinking`}
                />
                <span className="toggle-track" aria-hidden="true">
                  <span className="toggle-thumb" />
                </span>
              </label>
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
            setModelOptionsOpen(false);
          }}
        >
          <span className="context-ring" aria-hidden="true" />
        </button>
        <button
          className="send-button"
          type="button"
          aria-label="Send message"
          disabled={isStreaming || !message.trim()}
          onClick={sendCurrentMessage}
        >
          <SendHorizontal size={18} strokeWidth={2.2} />
        </button>
      </div>
    </footer>
  );
}
