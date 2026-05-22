import { useEffect, useMemo, useState } from "react";
import { createMessageBlocks, getLatestContextSnapshot } from "@actspace/shared";
import type {
  AgentTurnResult,
  BootstrapState,
  MessageBlock,
  RunTurnInput,
  SessionListItem,
  SessionRecord
} from "@actspace/shared";
import { WorkbenchLayout } from "./components/WorkbenchLayout";
import {
  mockBootstrapState,
  mockContextSnapshot,
  mockMessages,
  mockSessionRecord,
  mockSessions,
  mockTurnResult
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

export function App() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState | null>(
    hasActspaceBridge() ? null : mockBootstrapState
  );
  const [sessions, setSessions] = useState<SessionListItem[]>(hasActspaceBridge() ? [] : mockSessions);
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(
    hasActspaceBridge() ? null : mockSessionRecord
  );
  const [turnResult, setTurnResult] = useState<AgentTurnResult | null>(hasActspaceBridge() ? null : mockTurnResult);

  useEffect(() => {
    if (!hasActspaceBridge()) {
      return;
    }

    window.actspace
      .getBootstrapState()
      .then(setBootstrapState)
      .catch((error: unknown) => {
        console.error("Failed to load bootstrap state", error);
        setBootstrapState(mockBootstrapState);
      });
  }, []);

  useEffect(() => {
    if (!hasActspaceBridge()) {
      return;
    }

    async function bootstrapSession() {
      const listedSessions = await window.actspace.listSessions();
      setSessions(listedSessions);

      const existing = listedSessions[0];
      if (existing) {
        const restored = await window.actspace.getSession({ sessionId: existing.id });
        setSessionRecord(restored);
        return;
      }

      const input: RunTurnInput = {
        sessionId: "session-learning-doc-plan",
        turnId: "turn-0001",
        userInput: "Review the repository, reason about context, and prepare the first runtime slice."
      };

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

  const events = turnResult?.events ?? sessionRecord?.events ?? [];
  const messages = useMemo<MessageBlock[]>(() => {
    const fromRecord = sessionRecord?.messageBlocks;
    if (fromRecord && fromRecord.length > 0) {
      return fromRecord;
    }

    const fromEvents = createMessageBlocks(events);
    return fromEvents.length > 0 ? fromEvents : mockMessages;
  }, [events, sessionRecord?.messageBlocks]);

  const contextSnapshot =
    turnResult?.contextSnapshot ?? sessionRecord?.contextSnapshot ?? getLatestContextSnapshot(events) ?? mockContextSnapshot;

  const activeSessionId = turnResult?.sessionId ?? sessionRecord?.meta.id ?? sessions[0]?.id ?? mockSessions[0]?.id ?? null;
  const title = getSessionTitle(sessionRecord, sessions);

  return (
    <WorkbenchLayout
      sessions={sessions.length > 0 ? sessions : mockSessions}
      activeSessionId={activeSessionId}
      title={title}
      messages={messages}
      contextSnapshot={contextSnapshot}
    />
  );
}
