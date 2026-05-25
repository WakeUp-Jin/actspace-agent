import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMessageBlocks, getLatestContextSnapshot } from "@actspace/shared";
import type {
  AbortTurnInput,
  AgentTurnResult,
  BashStatus,
  BootstrapState,
  ContextUsageSnapshot,
  MessageBlock,
  RunTurnInput,
  RuntimeStreamEvent,
  SessionListItem,
  SessionRecord,
  ToolUiPreview,
} from "@actspace/shared";
import { WorkbenchLayout } from "./components/WorkbenchLayout";
import type { ComposerSendOptions } from "./components/Composer";
import {
  mockBootstrapState,
  mockContextSnapshot,
  mockMessages,
  mockSessionRecord,
  mockSessions,
  mockTurnResult,
} from "./fixtures/workbenchFixture";

const MIN_TOOL_RUNNING_MS = 300;

function hasActspaceBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace);
}

function getSessionTitle(sessionRecord: SessionRecord | null, sessions: SessionListItem[]): string {
  const rawTitle = sessionRecord?.meta.title ?? sessions[0]?.title ?? "Learning documentation plan";
  const normalized = rawTitle.replace(/^Session\s+/i, "").replace(/^session-/i, "");
  if (normalized === rawTitle) {
    return rawTitle;
  }

  return normalized
    .split("-")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

type StreamingState = {
  thinkingText: string;
  assistantText: string;
  activeTools: Map<string, {
    toolName: string;
    preview?: ToolUiPreview;
    isError?: boolean;
    finished?: boolean;
    startedAt: number;
  }>;
};

function createEmptyStreamingState(): StreamingState {
  return { thinkingText: "", assistantText: "", activeTools: new Map() };
}

function createMockEmptySession(): SessionRecord {
  const now = new Date().toISOString();
  const id = `mock-session-${Date.now()}`;
  return {
    meta: {
      id,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      turnCount: 0,
    },
    events: [],
    messageBlocks: [],
    contextSnapshot: null,
  };
}

function isDemoSession(sessionId: string | null): boolean {
  return sessionId === "session-learning-doc-plan";
}

function getStreamingBashStatus(tool: { isError?: boolean; finished?: boolean }): BashStatus {
  if (!tool.finished) {
    return "running";
  }

  return tool.isError ? "failed" : "success";
}

function getStreamingReadText(preview: Extract<ToolUiPreview, { kind: "read" }>): string {
  return `Read ${preview.filePath}${preview.range ? ` ${preview.range}` : ""}`;
}

function getStreamingSearchText(preview: Extract<ToolUiPreview, { kind: "search" }>): string {
  const scope = preview.scope ? `${preview.scope} ` : "";
  return `Searched files ${scope}for ${preview.query}`;
}

function getStreamingGrepText(preview: Extract<ToolUiPreview, { kind: "grep" }>): string {
  return `Grep ${preview.pattern}${preview.scope ? ` in ${preview.scope}` : ""}`;
}

function getStreamingGlobText(preview: Extract<ToolUiPreview, { kind: "glob" }>): string {
  return `Glob ${preview.pattern}${preview.scope ? ` in ${preview.scope}` : ""}`;
}

function getStreamingWebSearchText(preview: Extract<ToolUiPreview, { kind: "web_search" }>): string {
  return preview.displayText;
}

function getStreamingDirectoryText(
  preview: Extract<ToolUiPreview, { kind: "directory_list" }>,
  finished?: boolean,
): string {
  if (finished && preview.entryCount !== undefined) {
    return `Listed ${preview.path} (${preview.entryCount} entries)`;
  }

  return `Listed ${preview.path}`;
}

function streamingStateToBlocks(state: StreamingState): MessageBlock[] {
  const now = new Date().toISOString();
  const blocks: MessageBlock[] = [];

  if (state.thinkingText) {
    blocks.push({
      kind: "thinking",
      id: "streaming-thinking",
      title: "Thinking...",
      content: state.thinkingText,
      createdAt: now,
      collapsedByDefault: false,
    });
  }

  for (const [toolCallId, tool] of state.activeTools) {
    if (tool.preview?.kind === "bash") {
      blocks.push({
        kind: "bash",
        id: `streaming-tool-${toolCallId}`,
        status: getStreamingBashStatus(tool),
        title: tool.preview.title,
        command: tool.preview.command || "Waiting for Bash result...",
        commandPreview: tool.preview.commandPreview || "bash",
        cwd: tool.preview.cwd,
        stdout: tool.finished ? tool.preview.stdout : undefined,
        stderr: tool.isError ? "Tool execution failed" : undefined,
        createdAt: now,
      });
      continue;
    }

    if (tool.preview?.kind === "read") {
      blocks.push({
        kind: "read",
        id: `streaming-tool-${toolCallId}`,
        filePath: tool.preview.filePath,
        range: tool.preview.range,
        displayText: getStreamingReadText(tool.preview),
        createdAt: now,
        status: tool.finished ? "completed" : "running",
      });
      continue;
    }

    if (tool.preview?.kind === "search") {
      blocks.push({
        kind: "search",
        id: `streaming-tool-${toolCallId}`,
        query: tool.preview.query,
        scope: tool.preview.scope,
        resultCount: tool.finished ? tool.preview.resultCount : undefined,
        displayText: getStreamingSearchText(tool.preview),
        createdAt: now,
        status: tool.finished ? "completed" : "running",
      });
      continue;
    }

    if (tool.preview?.kind === "grep") {
      blocks.push({
        kind: "grep",
        id: `streaming-tool-${toolCallId}`,
        pattern: tool.preview.pattern,
        scope: tool.preview.scope,
        resultCount: tool.finished ? tool.preview.resultCount : undefined,
        displayText: getStreamingGrepText(tool.preview),
        createdAt: now,
        status: tool.finished ? "completed" : "running",
      });
      continue;
    }

    if (tool.preview?.kind === "glob") {
      blocks.push({
        kind: "glob",
        id: `streaming-tool-${toolCallId}`,
        pattern: tool.preview.pattern,
        scope: tool.preview.scope,
        resultCount: tool.finished ? tool.preview.resultCount : undefined,
        displayText: getStreamingGlobText(tool.preview),
        createdAt: now,
        status: tool.finished ? "completed" : "running",
      });
      continue;
    }

    if (tool.preview?.kind === "web_search") {
      blocks.push({
        kind: "web_search",
        id: `streaming-tool-${toolCallId}`,
        mode: tool.preview.mode,
        query: tool.preview.query,
        url: tool.preview.url,
        displayText: getStreamingWebSearchText(tool.preview),
        createdAt: now,
        status: tool.finished ? "completed" : "running",
      });
      continue;
    }

    if (tool.preview?.kind === "directory_list") {
      blocks.push({
        kind: "directory_list",
        id: `streaming-tool-${toolCallId}`,
        path: tool.preview.path,
        entryCount: tool.finished ? tool.preview.entryCount : undefined,
        displayText: getStreamingDirectoryText(tool.preview, tool.finished),
        createdAt: now,
        status: tool.finished ? "completed" : "running",
      });
      continue;
    }

    blocks.push({
      kind: "tool",
      id: `streaming-tool-${toolCallId}`,
      title: tool.preview?.kind === "generic"
        ? tool.preview.title
        : tool.finished ? `${tool.toolName}` : `Running ${tool.toolName}...`,
      content: tool.preview?.kind === "generic"
        ? tool.preview.content
        : tool.finished
          ? tool.isError ? "Tool execution failed" : "Completed"
          : "Executing...",
      createdAt: now,
      isError: tool.isError,
    });
  }

  if (state.assistantText) {
    blocks.push({
      kind: "assistant",
      id: "streaming-assistant",
      content: state.assistantText,
      createdAt: now,
    });
  }

  return blocks;
}

let turnCounter = 0;
function nextTurnId(): string {
  return `turn-${Date.now()}-${++turnCounter}`;
}

function createStoppedBlock(turnId: string): MessageBlock {
  return {
    kind: "status",
    id: `stopped-${turnId}`,
    content: "Stopped",
    createdAt: new Date().toISOString(),
    tone: "muted",
  };
}

export function App() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState | null>(
    hasActspaceBridge() ? null : mockBootstrapState,
  );
  const [sessions, setSessions] = useState<SessionListItem[]>(hasActspaceBridge() ? [] : mockSessions);
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(
    hasActspaceBridge() ? null : mockSessionRecord,
  );
  const [mockSessionRecords, setMockSessionRecords] = useState<Record<string, SessionRecord>>(
    hasActspaceBridge() ? {} : { [mockSessionRecord.meta.id]: mockSessionRecord },
  );
  const [turnResult, setTurnResult] = useState<AgentTurnResult | null>(
    hasActspaceBridge() ? null : mockTurnResult,
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [streamingBlocks, setStreamingBlocks] = useState<MessageBlock[]>([]);
  const [sendScrollRequestId, setSendScrollRequestId] = useState(0);
  const streamStateRef = useRef<StreamingState>(createEmptyStreamingState());
  const streamingUserBlockRef = useRef<MessageBlock | null>(null);
  const toolFinishTimersRef = useRef<Map<string, number>>(new Map());
  const activeSessionIdRef = useRef<string>("session-default");

  const refreshStreamingBlocks = useCallback((userBlock?: MessageBlock | null) => {
    const newStreamBlocks = streamingStateToBlocks(streamStateRef.current);
    const currentUserBlock = userBlock ?? streamingUserBlockRef.current;
    setStreamingBlocks(currentUserBlock ? [currentUserBlock, ...newStreamBlocks] : newStreamBlocks);
  }, []);

  const clearToolFinishTimers = useCallback(() => {
    for (const timerId of toolFinishTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    toolFinishTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!hasActspaceBridge()) return;

    window.actspace
      .getBootstrapState()
      .then(setBootstrapState)
      .catch((error: unknown) => {
        console.error("Failed to load bootstrap state", error);
        setBootstrapState(mockBootstrapState);
      });
  }, []);

  useEffect(() => {
    if (!hasActspaceBridge()) return;

    async function bootstrapSession() {
      const listedSessions = await window.actspace.listSessions();
      setSessions(listedSessions);

      const existing = listedSessions[0];
      if (existing) {
        activeSessionIdRef.current = existing.id;
        const restored = await window.actspace.getSession({ sessionId: existing.id });
        setSessionRecord(restored);
        return;
      }

      const input: RunTurnInput = {
        sessionId: "session-learning-doc-plan",
        turnId: "turn-0001",
        userInput: "Review the repository, reason about context, and prepare the first runtime slice.",
      };
      activeSessionIdRef.current = input.sessionId;

      const result = await window.actspace.runTurn(input);
      setTurnResult(result);
      const refreshed = await window.actspace.listSessions();
      setSessions(refreshed);
      const restored = await window.actspace.getSession({ sessionId: input.sessionId });
      setSessionRecord(restored);
    }

    bootstrapSession().catch((error: unknown) => {
      console.error("Failed to bootstrap session", error);
      setSessions(mockSessions);
      setSessionRecord(mockSessionRecord);
      setTurnResult(mockTurnResult);
    });
  }, []);

  const handleStreamEvent = useCallback((event: RuntimeStreamEvent) => {
    const state = streamStateRef.current;

    switch (event.type) {
      case "turn_started":
        break;

      case "assistant_thinking_delta":
        state.thinkingText += event.delta;
        break;

      case "assistant_text_delta":
        state.assistantText += event.delta;
        break;

      case "tool_started":
        state.activeTools.set(event.toolCallId, {
          toolName: event.toolName,
          preview: event.preview,
          startedAt: Date.now(),
        });
        break;

      case "tool_finished": {
        const tool = state.activeTools.get(event.toolCallId);
        if (tool) {
          const finishTool = () => {
            const latest = streamStateRef.current.activeTools.get(event.toolCallId);
            if (!latest) return;
            latest.finished = true;
            latest.isError = event.isError;
            toolFinishTimersRef.current.delete(event.toolCallId);
            refreshStreamingBlocks();
          };
          const elapsedMs = Date.now() - tool.startedAt;
          const remainingMs = Math.max(0, MIN_TOOL_RUNNING_MS - elapsedMs);
          const existingTimer = toolFinishTimersRef.current.get(event.toolCallId);
          if (existingTimer !== undefined) {
            window.clearTimeout(existingTimer);
          }
          if (remainingMs > 0) {
            const timerId = window.setTimeout(finishTool, remainingMs);
            toolFinishTimersRef.current.set(event.toolCallId, timerId);
          } else {
            finishTool();
          }
        }
        break;
      }

      case "turn_finished":
      case "turn_failed":
        return;
    }

    refreshStreamingBlocks();
  }, [refreshStreamingBlocks]);

  const handleSend = useCallback(async (
    text: string,
    options: ComposerSendOptions,
  ) => {
    if (isStreaming || !text.trim()) return;

    const sessionId = activeSessionIdRef.current;
    const turnId = nextTurnId();

    setIsStreaming(true);
    setIsAborting(false);
    setActiveTurnId(turnId);
    clearToolFinishTimers();
    streamStateRef.current = createEmptyStreamingState();

    const userBlock: MessageBlock = {
      kind: "user",
      id: `user-${turnId}`,
      content: text,
      createdAt: new Date().toISOString(),
    };
    streamingUserBlockRef.current = userBlock;
    setStreamingBlocks([userBlock]);
    setSendScrollRequestId((value) => value + 1);

    let unsubscribe: (() => void) | undefined;
    if (hasActspaceBridge()) {
      unsubscribe = window.actspace.onAgentStream((event) => {
        handleStreamEvent(event);
      });
    }

    let runWasAborted = false;

    try {
      if (hasActspaceBridge()) {
        const input: RunTurnInput = {
          sessionId,
          turnId,
          userInput: text,
          model: options.model,
          thinkingEnabled: options.thinkingEnabled,
        };
        const result = await window.actspace.runTurn(input);

        if (result.status === "aborted") {
          runWasAborted = true;
          setStreamingBlocks((current) => [...current, createStoppedBlock(turnId)]);
        } else {
          const restored = await window.actspace.getSession({ sessionId });
          setSessionRecord(restored ?? {
            meta: {
              id: result.sessionId,
              title: "New chat",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              turnCount: 1,
            },
            events: result.events,
            contextSnapshot: result.contextSnapshot,
          });
        }
        setTurnResult(null);
        const refreshed = await window.actspace.listSessions();
        setSessions(refreshed);
      }
    } catch (error) {
      console.error("Failed to run turn", error);
    } finally {
      unsubscribe?.();
      clearToolFinishTimers();
      setIsStreaming(false);
      setIsAborting(false);
      setActiveTurnId(null);
      if (!runWasAborted) {
        setStreamingBlocks([]);
      }
      streamStateRef.current = createEmptyStreamingState();
      streamingUserBlockRef.current = null;
    }
  }, [isStreaming, handleStreamEvent, refreshStreamingBlocks, clearToolFinishTimers]);

  const handleAbort = useCallback(async () => {
    if (!hasActspaceBridge() || !activeTurnId) return;

    const input: AbortTurnInput = {
      sessionId: activeSessionIdRef.current,
      turnId: activeTurnId,
    };

    try {
      setIsAborting(true);
      await window.actspace.abortTurn(input);
    } catch (error) {
      console.error("Failed to abort turn", error);
      setIsAborting(false);
    }
  }, [activeTurnId]);

  const handleCreateSession = useCallback(async () => {
    setTurnResult(null);
    setStreamingBlocks([]);
    clearToolFinishTimers();
    streamStateRef.current = createEmptyStreamingState();
    streamingUserBlockRef.current = null;

    if (!hasActspaceBridge()) {
      const created = createMockEmptySession();
      activeSessionIdRef.current = created.meta.id;
      setSessionRecord(created);
      setMockSessionRecords((current) => ({ ...current, [created.meta.id]: created }));
      setSessions((current) => [
        {
          id: created.meta.id,
          title: created.meta.title,
          updatedAt: created.meta.updatedAt,
          turnCount: created.meta.turnCount,
        },
        ...current,
      ]);
      return;
    }

    try {
      const created = await window.actspace.createSession({ title: "New chat" });
      activeSessionIdRef.current = created.meta.id;
      setSessionRecord(created);
      const refreshed = await window.actspace.listSessions();
      setSessions(refreshed);
    } catch (error) {
      console.error("Failed to create session", error);
    }
  }, [clearToolFinishTimers]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === activeSessionIdRef.current) return;

      setIsStreaming(false);
      setStreamingBlocks([]);
      clearToolFinishTimers();
      streamStateRef.current = createEmptyStreamingState();
      streamingUserBlockRef.current = null;
      setTurnResult(null);
      activeSessionIdRef.current = sessionId;

      if (!hasActspaceBridge()) {
        const selected = mockSessionRecords[sessionId];
        if (selected) {
          setSessionRecord(selected);
          return;
        }

        const listed = sessions.find((session) => session.id === sessionId);
        if (!listed) return;

        const fixture = mockSessions.find((session) => session.id === sessionId);
        if (!fixture) return;

        setSessionRecord({
          ...mockSessionRecord,
          meta: {
            ...mockSessionRecord.meta,
            id: fixture.id,
            title: fixture.title,
            updatedAt: fixture.updatedAt,
            turnCount: fixture.turnCount,
          },
        });
        return;
      }

      try {
        const restored = await window.actspace.getSession({ sessionId });
        setSessionRecord(restored);
      } catch (error) {
        console.error("Failed to select session", error);
      }
    },
    [mockSessionRecords, sessions, clearToolFinishTimers],
  );

  useEffect(() => {
    return () => {
      clearToolFinishTimers();
    };
  }, [clearToolFinishTimers]);

  const persistedEvents = sessionRecord?.events ?? turnResult?.events ?? [];
  const persistedMessages = useMemo<MessageBlock[]>(() => {
    const fromRecord = sessionRecord?.messageBlocks;
    if (fromRecord && fromRecord.length > 0) return fromRecord;

    const fromEvents = createMessageBlocks(persistedEvents);
    if (fromEvents.length > 0) return fromEvents;
    if (hasActspaceBridge() || sessionRecord) return [];
    return mockMessages;
  }, [persistedEvents, sessionRecord?.messageBlocks]);

  const messages = useMemo<MessageBlock[]>(() => {
    if (streamingBlocks.length === 0) return persistedMessages;
    return [...persistedMessages, ...streamingBlocks];
  }, [persistedMessages, streamingBlocks]);

  const contextSnapshot: ContextUsageSnapshot | null =
    sessionRecord?.contextSnapshot ??
    turnResult?.contextSnapshot ??
    getLatestContextSnapshot(persistedEvents) ??
    mockContextSnapshot;

  const activeSessionId =
    sessionRecord?.meta.id ?? turnResult?.sessionId ?? sessions[0]?.id ?? mockSessions[0]?.id ?? null;
  const showDemoAttachments = isDemoSession(activeSessionId);
  const title = getSessionTitle(sessionRecord, sessions);

  return (
    <WorkbenchLayout
      sessions={sessions.length > 0 ? sessions : mockSessions}
      activeSessionId={activeSessionId}
      title={title}
      messages={messages}
      contextSnapshot={contextSnapshot}
      isStreaming={isStreaming}
      isAborting={isAborting}
      sendScrollRequestId={sendScrollRequestId}
      onSend={handleSend}
      onAbort={handleAbort}
      onNewSession={handleCreateSession}
      onSelectSession={handleSelectSession}
      showDemoAttachments={showDemoAttachments}
    />
  );
}
