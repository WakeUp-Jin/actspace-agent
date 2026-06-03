import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import type { MessageBlock, SessionEvent, SubAgentTranscriptRef } from "@actspace/shared";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;

const MODAL_ROOT_CLASS = "fixed inset-0 z-[1000] flex items-center justify-center px-5 py-6";
const MODAL_OVERLAY_CLASS = "absolute inset-0 bg-overlay";
const MODAL_PANEL_CLASS =
  "relative flex h-[min(760px,calc(100vh_-_48px))] w-[min(920px,calc(100vw_-_40px))] flex-col overflow-hidden rounded-act-lg border border-line bg-surface-raised shadow-act-popover";
const MODAL_HEADER_CLASS = "flex items-start justify-between gap-4 border-b border-line px-5 py-4";
const MODAL_TITLE_CLASS = "m-0 text-[16px] font-semibold leading-[1.35] text-text-main";
const MODAL_META_CLASS = "mt-1 text-[13px] leading-[1.45] text-text-muted";
const MODAL_ACTIONS_CLASS = "flex flex-none items-center gap-2";
const MODAL_ICON_BUTTON_CLASS =
  "grid h-8 w-8 place-items-center rounded-act-md border border-line bg-surface text-text-muted transition hover:border-line-strong hover:bg-surface-subtle hover:text-text-main";
const MODAL_BODY_CLASS = "min-h-0 flex-1 overflow-y-auto px-5 py-4";
const PROMPT_CLASS =
  "mb-4 rounded-act-md border border-line bg-surface-subtle px-3 py-2.5 text-[13px] leading-[1.55] text-text-muted";
const TIMELINE_CLASS = "flex flex-col gap-2";
const EVENT_ROW_CLASS = "rounded-act-md border border-line bg-surface px-3 py-2.5";
const EVENT_HEADER_CLASS = "mb-1 flex items-center justify-between gap-3 text-[12px] leading-[1.35]";
const EVENT_TITLE_CLASS = "font-semibold text-text-main";
const EVENT_TIME_CLASS = "flex-none text-text-faint";
const EVENT_BODY_CLASS = "whitespace-pre-wrap text-[13px] leading-[1.6] text-text-muted [overflow-wrap:anywhere]";
const EVENT_ERROR_CLASS = "border-danger bg-danger-soft";

function mergeEvents(current: SessionEvent[], next: SessionEvent[] | undefined): SessionEvent[] {
  if (!next?.length) return current;
  const seen = new Set(current.map((event) => event.id));
  const merged = [...current];
  for (const event of next) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }
  return merged;
}

function getTranscriptTitle(event: SessionEvent): string {
  switch (event.type) {
    case "user_message":
      return "Prompt";
    case "thinking":
      return "Thinking";
    case "tool_call": {
      const payload = event.payload as { name?: string };
      return payload.name ?? "Tool call";
    }
    case "tool_result": {
      const payload = event.payload as { toolName?: string };
      return payload.toolName ?? "Tool result";
    }
    case "assistant_message":
    case "assistant_reply":
      return "Report";
    case "llm_usage":
      return "Usage";
    case "error":
      return "Error";
    default:
      return event.type;
  }
}

function getTranscriptBody(event: SessionEvent): string {
  if (event.type === "tool_call") {
    const payload = event.payload as { arguments?: Record<string, unknown> };
    return JSON.stringify(payload.arguments ?? {}, null, 2);
  }
  if (event.type === "tool_result") {
    const payload = event.payload as { summary?: string; modelOutput?: string; rawOutput?: string };
    return payload.summary ?? payload.modelOutput ?? payload.rawOutput ?? "";
  }
  if (event.type === "llm_usage") {
    const payload = event.payload as { totalTokens?: number; promptTokens?: number; completionTokens?: number };
    return `Tokens ${payload.totalTokens ?? 0} · input ${payload.promptTokens ?? 0} · output ${payload.completionTokens ?? 0}`;
  }
  if (event.type === "error") {
    const payload = event.payload as { message?: string };
    return payload.message ?? "";
  }
  const payload = event.payload as { content?: string };
  if (typeof payload.content === "string") return payload.content;
  return JSON.stringify(event.payload, null, 2);
}

function firstPrompt(events: SessionEvent[]): string | null {
  const prompt = events.find((event) => event.type === "user_message");
  const payload = prompt?.payload as { content?: string } | undefined;
  return payload?.content ?? null;
}

async function loadTranscript(ref: SubAgentTranscriptRef | undefined): Promise<SessionEvent[]> {
  if (!ref || typeof window === "undefined" || !window.actspace?.getSubAgentTranscript) {
    return [];
  }
  return window.actspace.getSubAgentTranscript({ transcriptRef: ref });
}

export function SubAgentTranscriptModal({
  message,
  open,
  onClose,
}: {
  message: AgentMessage;
  open: boolean;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<SessionEvent[]>(message.transcriptEvents ?? []);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setEvents((current) => mergeEvents(current, message.transcriptEvents));
  }, [message.transcriptEvents]);

  useEffect(() => {
    if (!open) return;
    setEvents((current) => mergeEvents(current, message.transcriptEvents));
    closeButtonRef.current?.focus();
    void loadTranscript(message.transcriptRef)
      .then((loaded) => setEvents((current) => mergeEvents(current, loaded)))
      .catch((error: unknown) => {
        console.error("Failed to load SubAgent transcript", error);
      });
  }, [message.transcriptEvents, message.transcriptRef, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const prompt = useMemo(() => firstPrompt(events), [events]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={MODAL_ROOT_CLASS}>
      <button className={MODAL_OVERLAY_CLASS} type="button" aria-label="Close transcript" onClick={onClose} />
      <section className={MODAL_PANEL_CLASS} role="dialog" aria-modal="true" aria-label={`SubAgent transcript: ${message.description}`}>
        <header className={MODAL_HEADER_CLASS}>
          <div className="min-w-0">
            <h2 className={MODAL_TITLE_CLASS}>{message.description}</h2>
            <div className={MODAL_META_CLASS}>
              {message.status} · {events.length} events
            </div>
          </div>
          <div className={MODAL_ACTIONS_CLASS}>
            <button className={MODAL_ICON_BUTTON_CLASS} type="button" aria-label="Expand transcript view" disabled>
              <Maximize2 size={15} aria-hidden="true" />
            </button>
            <button ref={closeButtonRef} className={MODAL_ICON_BUTTON_CLASS} type="button" aria-label="Close transcript" onClick={onClose}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className={MODAL_BODY_CLASS}>
          {prompt ? <div className={PROMPT_CLASS}>{prompt}</div> : null}
          <div className={TIMELINE_CLASS}>
            {events.map((event) => {
              const isError = event.type === "error" || (event.type === "tool_result" && (event.payload as { ok?: boolean }).ok === false);
              return (
                <article key={event.id} className={`${EVENT_ROW_CLASS}${isError ? ` ${EVENT_ERROR_CLASS}` : ""}`}>
                  <div className={EVENT_HEADER_CLASS}>
                    <span className={EVENT_TITLE_CLASS}>{getTranscriptTitle(event)}</span>
                    <span className={EVENT_TIME_CLASS}>{event.timestamp}</span>
                  </div>
                  <div className={EVENT_BODY_CLASS}>{getTranscriptBody(event)}</div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
