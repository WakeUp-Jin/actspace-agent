import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMessageBlocks, getLatestContextSnapshot } from "@actspace/shared";
import type {
  AgentTurnResult,
  BashStatus,
  BootstrapState,
  ContextUsageSnapshot,
  MessageBlock,
  RunTurnInput,
  RuntimeStreamEvent,
  SessionListItem,
  SessionRecord,
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
  activeTools: Map<string, { toolName: string; isError?: boolean; finished?: boolean; startedAt: number }>;
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

function getStreamingBashTitle(tool: { isError?: boolean; finished?: boolean }): string {
  if (!tool.finished) {
    return "Bash command";
  }

  return tool.isError ? "Bash command failed" : "Bash command";
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
    if (tool.toolName === "bash") {
      blocks.push({
        kind: "bash",
        id: `streaming-tool-${toolCallId}`,
        status: getStreamingBashStatus(tool),
        title: getStreamingBashTitle(tool),
        command: "Waiting for Bash result...",
        commandPreview: "bash",
        stdout: tool.finished ? "Completed" : "Executing...",
        stderr: tool.isError ? "Tool execution failed" : undefined,
        createdAt: now,
      });
      continue;
    }

    blocks.push({
      kind: "tool",
      id: `streaming-tool-${toolCallId}`,
      title: tool.finished ? `${tool.toolName}` : `Running ${tool.toolName}...`,
      content: tool.finished
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
  const [streamingBlocks, setStreamingBlocks] = useState<MessageBlock[]>([]);
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
        state.activeTools.set(event.toolCallId, { toolName: event.toolName, startedAt: Date.now() });
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

    setStreamingBlocks(streamingStateToBlocks(state));
  }, [refreshStreamingBlocks]);

  const handleSend = useCallback(async (
    text: string,
    options: ComposerSendOptions,
  ) => {
    if (isStreaming || !text.trim()) return;

    const sessionId = activeSessionIdRef.current;
    const turnId = nextTurnId();

    setIsStreaming(true);
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

    let unsubscribe: (() => void) | undefined;
    if (hasActspaceBridge()) {
      unsubscribe = window.actspace.onAgentStream((event) => {
        handleStreamEvent(event);
      });
    }

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
      setStreamingBlocks([]);
      streamStateRef.current = createEmptyStreamingState();
      streamingUserBlockRef.current = null;
    }
  }, [isStreaming, handleStreamEvent, refreshStreamingBlocks, clearToolFinishTimers]);

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
      onSend={handleSend}
      onNewSession={handleCreateSession}
      onSelectSession={handleSelectSession}
      showDemoAttachments={showDemoAttachments}
    />
  );
}
