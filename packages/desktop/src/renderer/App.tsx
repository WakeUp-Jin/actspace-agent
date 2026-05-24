import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMessageBlocks, getLatestContextSnapshot } from "@actspace/shared";
import type {
  AgentTurnResult,
  BootstrapState,
  ContextUsageSnapshot,
  MessageBlock,
  RunTurnInput,
  RuntimeStreamEvent,
  SessionListItem,
  SessionRecord,
} from "@actspace/shared";
import { WorkbenchLayout } from "./components/WorkbenchLayout";
import {
  mockBootstrapState,
  mockContextSnapshot,
  mockMessages,
  mockSessionRecord,
  mockSessions,
  mockTurnResult,
} from "./fixtures/workbenchFixture";

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
  activeTools: Map<string, { toolName: string; isError?: boolean; finished?: boolean }>;
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
  const activeSessionIdRef = useRef<string>("session-default");

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
        state.activeTools.set(event.toolCallId, { toolName: event.toolName });
        break;

      case "tool_finished": {
        const tool = state.activeTools.get(event.toolCallId);
        if (tool) {
          tool.finished = true;
          tool.isError = event.isError;
        }
        break;
      }

      case "turn_finished":
      case "turn_failed":
        return;
    }

    setStreamingBlocks(streamingStateToBlocks(state));
  }, []);

  const handleSend = useCallback(async (text: string) => {
    if (isStreaming || !text.trim()) return;

    const sessionId = activeSessionIdRef.current;
    const turnId = nextTurnId();

    setIsStreaming(true);
    streamStateRef.current = createEmptyStreamingState();

    const userBlock: MessageBlock = {
      kind: "user",
      id: `user-${turnId}`,
      content: text,
      createdAt: new Date().toISOString(),
    };
    setStreamingBlocks([userBlock]);

    let unsubscribe: (() => void) | undefined;
    if (hasActspaceBridge()) {
      unsubscribe = window.actspace.onAgentStream((event) => {
        handleStreamEvent(event);
        setStreamingBlocks((prev) => {
          const newStreamBlocks = streamingStateToBlocks(streamStateRef.current);
          return [userBlock, ...newStreamBlocks];
        });
      });
    }

    try {
      if (hasActspaceBridge()) {
        const input: RunTurnInput = { sessionId, turnId, userInput: text };
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
      setIsStreaming(false);
      setStreamingBlocks([]);
      streamStateRef.current = createEmptyStreamingState();
    }
  }, [isStreaming, handleStreamEvent]);

  const handleCreateSession = useCallback(async () => {
    setTurnResult(null);
    setStreamingBlocks([]);
    streamStateRef.current = createEmptyStreamingState();

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
  }, []);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === activeSessionIdRef.current) return;

      setIsStreaming(false);
      setStreamingBlocks([]);
      streamStateRef.current = createEmptyStreamingState();
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
    [mockSessionRecords, sessions],
  );

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
