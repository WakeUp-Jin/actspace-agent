import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { MessageBlock, SessionEvent, SubAgentTranscriptRef } from "@actspace/shared";
import { MarkdownProse } from "./MarkdownProse";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolLogLine } from "./ToolLogLine";
import { TOOL_LOG_LINE_CLASS, TOOL_LOG_LINE_TEXT_CLASS } from "./toolLogStyles";

type AgentMessage = Extract<MessageBlock, { kind: "agent" }>;
type AssistantMessage = Extract<MessageBlock, { kind: "assistant" }>;
type TranscriptMessage =
  | Extract<MessageBlock, { kind: "thinking" }>
  | Extract<MessageBlock, { kind: "read" }>
  | Extract<MessageBlock, { kind: "grep" }>
  | Extract<MessageBlock, { kind: "glob" }>
  | Extract<MessageBlock, { kind: "directory_list" }>
  | Extract<MessageBlock, { kind: "tool" }>
  | Extract<MessageBlock, { kind: "error" }>;
type TranscriptItem =
  | { kind: "message"; message: TranscriptMessage }
  | { kind: "usage"; id: string; text: string };
type TranscriptTaskInput = { id: string; content: string; createdAt: string };
type TranscriptSections = {
  taskInput: TranscriptTaskInput | null;
  processItems: TranscriptItem[];
  fallbackFinalReport: AssistantMessage | null;
};

const MODAL_ROOT_CLASS = "fixed inset-0 z-[1000] flex items-center justify-center px-4 py-5";
const MODAL_OVERLAY_CLASS = "absolute inset-0 bg-overlay";
const MODAL_PANEL_CLASS =
  "relative flex h-[min(860px,calc(100vh_-_40px))] w-[min(1180px,calc(100vw_-_32px))] flex-col overflow-hidden rounded-act-lg border border-line bg-surface-raised shadow-act-popover";
const MODAL_HEADER_CLASS = "flex items-start justify-between gap-5 border-b border-line px-6 py-5";
const MODAL_TITLE_CLASS = "m-0 text-[20px] font-semibold leading-[1.3] text-text-main";
const MODAL_META_CLASS = "mt-1 text-[15px] leading-[1.45] text-text-muted";
const MODAL_ICON_BUTTON_CLASS =
  "grid h-9 w-9 place-items-center rounded-act-md border border-line bg-surface text-text-muted transition hover:border-line-strong hover:bg-surface-subtle hover:text-text-main";
const MODAL_BODY_CLASS = "min-h-0 flex-1 overflow-y-auto";
const MODAL_CONTENT_CLASS = "min-h-full bg-surface";
const TRANSCRIPT_FLOW_CLASS = "flex flex-col gap-1.5";
const EMPTY_CLASS = "px-[var(--conversation-text-inset)] text-sm leading-[1.55] text-text-muted";
const TASK_INPUT_SECTION_CLASS = "sticky top-0 z-10 bg-surface-raised px-5 py-3";
const TASK_INPUT_BUTTON_CLASS =
  "relative block w-full rounded-act-md border border-line bg-surface px-4 py-3 text-left text-[15px] leading-[1.65] text-text-main transition hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--act-color-focus-ring)]";
const TASK_INPUT_TEXT_CLASS = "block whitespace-pre-wrap";
const TASK_INPUT_COLLAPSED_CLASS = "max-h-[98px] overflow-hidden";
const TASK_INPUT_EXPANDED_CLASS = "max-h-none";
const TASK_INPUT_FADE_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-act-md bg-gradient-to-b from-transparent to-surface";
const WORK_SECTION_CLASS =
  "relative bg-surface px-6 py-4 after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-line after:content-['']";
const WORK_HEADER_CLASS = "flex items-center gap-4";
const WORK_TOGGLE_CLASS =
  "inline-flex items-center gap-2 border-0 bg-transparent p-0 text-[15px] font-medium leading-[1.4] text-text-muted transition hover:text-text-main";
const WORK_FLOW_CLASS = "mt-4 flex flex-col gap-1.5";
const FINAL_REPORT_SECTION_CLASS = "bg-surface px-6 py-6";
const FINAL_REPORT_CONTENT_CLASS = "max-w-[840px] text-[15px] leading-[1.7] text-text-main";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function eventPayload(event: SessionEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function displayFileName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return (normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized) || path;
}

function displayPathTail(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return (normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized) || path;
}

function getLineRange(args: Record<string, unknown>): string | undefined {
  const offset = numberValue(args.offset);
  if (offset === undefined) return undefined;
  const limit = numberValue(args.limit);
  return limit === undefined ? String(offset) : `${offset}-${offset + limit - 1}`;
}

function getResultText(event: SessionEvent | undefined): string {
  if (!event) return "";
  const payload = eventPayload(event);
  return stringValue(payload.modelOutput) || stringValue(payload.truncatedOutput) || stringValue(payload.rawOutput);
}

function getResultError(event: SessionEvent | undefined): string {
  if (!event) return "";
  const payload = eventPayload(event);
  const nestedError = isRecord(payload.error) ? stringValue(payload.error.message) : "";
  return nestedError || stringValue(payload.summary) || getResultText(event);
}

function resultSucceeded(event: SessionEvent | undefined): boolean {
  if (!event) return true;
  return eventPayload(event).ok !== false;
}

function getGrepScope(args: Record<string, unknown>): string | undefined {
  return stringValue(args.glob) || stringValue(args.path) || undefined;
}

function getSearchResultCount(output: string): number | undefined {
  const match = output.match(/^Found\s+(\d+)\s+match/);
  return match ? Number(match[1]) : undefined;
}

function getGlobResultCount(output: string): number | undefined {
  const match = output.match(/^Found\s+(\d+)\s+file/);
  return match ? Number(match[1]) : undefined;
}

function getDirectoryEntryCount(output: string): number | undefined {
  if (!output) return undefined;
  if (output.trim() === "(empty directory)") return 0;
  return output.split("\n").filter((line) => line.trim().length > 0).length;
}

function createToolErrorMessage(event: SessionEvent, toolName: string, result: SessionEvent | undefined): TranscriptMessage {
  return {
    kind: "error",
    id: result?.id ?? event.id,
    title: `Error in ${toolName}`,
    content: getResultError(result) || "Tool failed",
    recoverable: true,
    createdAt: result?.timestamp ?? event.timestamp,
  };
}

function toolCallMessage(event: SessionEvent, result: SessionEvent | undefined): TranscriptMessage {
  const payload = eventPayload(event);
  const toolName = stringValue(payload.name, "tool");
  const args = isRecord(payload.arguments) ? payload.arguments : {};
  const output = getResultText(result);
  const status = result ? "completed" : "running";

  if (!resultSucceeded(result)) {
    return createToolErrorMessage(event, toolName, result);
  }

  if (toolName === "read_file") {
    const filePath = displayFileName(stringValue(args.path, "file"));
    const range = getLineRange(args);
    return {
      kind: "read",
      id: event.id,
      filePath,
      range,
      displayText: `Read ${filePath}${range ? ` ${range}` : ""}`,
      status,
      createdAt: event.timestamp,
    };
  }

  if (toolName === "grep") {
    const pattern = stringValue(args.pattern, "pattern");
    return {
      kind: "grep",
      id: event.id,
      pattern,
      scope: getGrepScope(args),
      resultCount: getSearchResultCount(output),
      displayText: `Grep ${pattern}`,
      status,
      createdAt: event.timestamp,
    };
  }

  if (toolName === "glob") {
    const pattern = stringValue(args.pattern, "pattern");
    return {
      kind: "glob",
      id: event.id,
      pattern,
      scope: stringValue(args.path) || undefined,
      resultCount: getGlobResultCount(output),
      displayText: `Glob ${pattern}`,
      status,
      createdAt: event.timestamp,
    };
  }

  if (toolName === "list_directory") {
    const path = displayPathTail(stringValue(args.path, "directory"));
    return {
      kind: "directory_list",
      id: event.id,
      path,
      entryCount: getDirectoryEntryCount(output),
      displayText: `Listed ${path}`,
      status,
      createdAt: event.timestamp,
    };
  }

  return {
    kind: "tool",
    id: result?.id ?? event.id,
    title: result ? stringValue(eventPayload(result).summary, `Ran ${toolName}`) : `Running ${toolName}`,
    content: result ? getResultText(result) : "",
    createdAt: result?.timestamp ?? event.timestamp,
  };
}

function toolResultFallbackMessage(event: SessionEvent): TranscriptMessage {
  const payload = eventPayload(event);
  const toolName = stringValue(payload.toolName, "tool");
  if (payload.ok === false) {
    return createToolErrorMessage(event, toolName, event);
  }
  return {
    kind: "tool",
    id: event.id,
    title: stringValue(payload.summary, `Ran ${toolName}`),
    content: getResultText(event),
    createdAt: event.timestamp,
  };
}

function usageText(event: SessionEvent): string {
  const payload = eventPayload(event);
  const total = numberValue(payload.totalTokens) ?? 0;
  const input = numberValue(payload.promptTokens) ?? 0;
  const output = numberValue(payload.completionTokens) ?? 0;
  return `Usage Tokens ${total} · input ${input} · output ${output}`;
}

function durationFromEvents(events: SessionEvent[]): number | undefined {
  let firstTime = Number.POSITIVE_INFINITY;
  let lastTime = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    const time = Date.parse(event.timestamp);
    if (!Number.isFinite(time)) continue;
    firstTime = Math.min(firstTime, time);
    lastTime = Math.max(lastTime, time);
  }

  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime) || lastTime <= firstTime) {
    return undefined;
  }

  return lastTime - firstTime;
}

function formatWorkedDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "Worked";
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `Worked for ${seconds}s`;
  }

  if (seconds === 0) {
    return `Worked for ${minutes}m`;
  }

  return `Worked for ${minutes}m ${seconds}s`;
}

function taskInputFromEvent(event: SessionEvent): TranscriptTaskInput | null {
  const payload = eventPayload(event);
  const content = stringValue(payload.content) || stringValue(payload.message);
  if (!content) return null;
  return { id: event.id, content, createdAt: event.timestamp };
}

function assistantMessageFromEvent(event: SessionEvent): AssistantMessage | null {
  const payload = eventPayload(event);
  const content = stringValue(payload.content);
  if (!content) return null;
  return {
    kind: "assistant",
    id: event.id,
    content,
    createdAt: event.timestamp,
    model: stringValue(payload.model) || undefined,
    provider: stringValue(payload.provider) || undefined,
  };
}

function buildTranscriptSections(events: SessionEvent[]): TranscriptSections {
  const resultsByToolCallId = new Map<string, SessionEvent>();
  const matchedResultIds = new Set<string>();

  for (const event of events) {
    if (event.type !== "tool_result") continue;
    const toolCallId = stringValue(eventPayload(event).toolCallId);
    if (toolCallId) {
      resultsByToolCallId.set(toolCallId, event);
    }
  }

  const processItems: TranscriptItem[] = [];
  let taskInput: TranscriptTaskInput | null = null;
  let fallbackFinalReport: AssistantMessage | null = null;

  for (const event of events) {
    switch (event.type) {
      case "user_message":
        taskInput = taskInput ?? taskInputFromEvent(event);
        break;
      case "thinking": {
        const payload = eventPayload(event);
        const content = stringValue(payload.content);
        if (!content) break;
        processItems.push({
          kind: "message",
          message: {
            kind: "thinking",
            id: event.id,
            title: stringValue(payload.title, "Thinking"),
            content,
            collapsedByDefault: typeof payload.collapsedByDefault === "boolean" ? payload.collapsedByDefault : true,
            createdAt: event.timestamp,
          },
        });
        break;
      }
      case "tool_call": {
        const toolCallId = stringValue(eventPayload(event).id);
        const result = toolCallId ? resultsByToolCallId.get(toolCallId) : undefined;
        if (result) {
          matchedResultIds.add(result.id);
        }
        processItems.push({ kind: "message", message: toolCallMessage(event, result) });
        break;
      }
      case "tool_result": {
        if (!matchedResultIds.has(event.id)) {
          processItems.push({ kind: "message", message: toolResultFallbackMessage(event) });
        }
        break;
      }
      case "assistant_message":
      case "assistant_reply": {
        fallbackFinalReport = assistantMessageFromEvent(event) ?? fallbackFinalReport;
        break;
      }
      case "llm_usage":
        processItems.push({ kind: "usage", id: event.id, text: usageText(event) });
        break;
      case "error": {
        const payload = eventPayload(event);
        processItems.push({
          kind: "message",
          message: {
            kind: "error",
            id: event.id,
            title: stringValue(payload.code, "Error"),
            content: stringValue(payload.message, "SubAgent error"),
            recoverable: payload.recoverable !== false,
            createdAt: event.timestamp,
          },
        });
        break;
      }
    }
  }

  return { taskInput, processItems, fallbackFinalReport };
}

function finalReportFromAgentSummary(message: AgentMessage): AssistantMessage | null {
  const content = typeof message.summary === "string" ? message.summary.trim() : "";
  if (!content) return null;
  return {
    kind: "assistant",
    id: `${message.id}:summary`,
    content,
    createdAt: message.createdAt,
  };
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
  const [workExpanded, setWorkExpanded] = useState(false);
  const [taskInputExpanded, setTaskInputExpanded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setEvents((current) => mergeEvents(current, message.transcriptEvents));
  }, [message.transcriptEvents]);

  useEffect(() => {
    if (!open) return;
    setWorkExpanded(false);
    setTaskInputExpanded(false);
    setEvents((current) => mergeEvents(current, message.transcriptEvents));
    closeButtonRef.current?.focus();
    void loadTranscript(message.transcriptRef)
      .then((loaded) => setEvents((current) => mergeEvents(current, loaded)))
      .catch((error: unknown) => {
        console.error("Failed to load SubAgent transcript", error);
      });
  }, [message.transcriptEvents, message.transcriptRef, open]);

  useEffect(() => {
    setWorkExpanded(false);
    setTaskInputExpanded(false);
  }, [message.id]);

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

  const transcriptSections = useMemo(() => buildTranscriptSections(events), [events]);
  const finalReportCandidate = finalReportFromAgentSummary(message) ?? transcriptSections.fallbackFinalReport;
  const finalReport = message.status === "running" ? null : finalReportCandidate;
  const hasFinalReport = finalReport !== null;
  const workVisible = !hasFinalReport || workExpanded;
  const workedLabel = formatWorkedDuration(message.stats?.durationMs ?? durationFromEvents(events));

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
              {events.length} events
            </div>
          </div>
          <button ref={closeButtonRef} className={MODAL_ICON_BUTTON_CLASS} type="button" aria-label="Close transcript" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </button>
        </header>
        <div className={MODAL_BODY_CLASS}>
          <div className={MODAL_CONTENT_CLASS}>
            {transcriptSections.taskInput ? (
              <section className={TASK_INPUT_SECTION_CLASS} aria-label="Task input">
                <div className="sr-only">Task input</div>
                <button
                  className={`${TASK_INPUT_BUTTON_CLASS} ${taskInputExpanded ? TASK_INPUT_EXPANDED_CLASS : TASK_INPUT_COLLAPSED_CLASS}`}
                  type="button"
                  aria-expanded={taskInputExpanded}
                  aria-label={taskInputExpanded ? "Collapse task input" : "Expand task input"}
                  onClick={() => setTaskInputExpanded((value) => !value)}
                >
                  <span className={TASK_INPUT_TEXT_CLASS}>{transcriptSections.taskInput.content}</span>
                  {!taskInputExpanded ? <span className={TASK_INPUT_FADE_CLASS} aria-hidden="true" data-testid="task-input-fade" /> : null}
                </button>
              </section>
            ) : null}
            <section className={WORK_SECTION_CLASS}>
              <div className={WORK_HEADER_CLASS}>
                {hasFinalReport ? (
                  <button
                    className={WORK_TOGGLE_CLASS}
                    type="button"
                    aria-expanded={workExpanded}
                    onClick={() => setWorkExpanded((value) => !value)}
                  >
                    <span>{workedLabel}</span>
                    {workExpanded ? <ChevronDown size={15} strokeWidth={2.2} /> : <ChevronRight size={15} strokeWidth={2.2} />}
                  </button>
                ) : (
                  <div className={WORK_TOGGLE_CLASS}>{workedLabel}</div>
                )}
              </div>
              {workVisible ? (
                <div className={WORK_FLOW_CLASS}>
                  <div className={TRANSCRIPT_FLOW_CLASS} aria-label="SubAgent process" role="region">
                    {transcriptSections.processItems.length > 0 ? transcriptSections.processItems.map((item) => renderTranscriptItem(item)) : (
                      <div className={EMPTY_CLASS}>Process events will appear here.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
            {finalReport ? (
              <section className={FINAL_REPORT_SECTION_CLASS} aria-label="Final output">
                <div className="sr-only">Final output</div>
                <div className={FINAL_REPORT_CONTENT_CLASS}>
                  <MarkdownProse content={finalReport.content} />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function renderTranscriptItem(item: TranscriptItem) {
  if (item.kind === "usage") {
    return (
      <div key={item.id} className={TOOL_LOG_LINE_CLASS}>
        <span className={TOOL_LOG_LINE_TEXT_CLASS}>{item.text}</span>
      </div>
    );
  }

  const { message } = item;
  switch (message.kind) {
    case "thinking":
      return <ThinkingBlock key={message.id} message={message} />;
    case "read":
    case "grep":
    case "glob":
    case "directory_list":
    case "tool":
    case "error":
      return <ToolLogLine key={message.id} message={message} />;
  }
}
