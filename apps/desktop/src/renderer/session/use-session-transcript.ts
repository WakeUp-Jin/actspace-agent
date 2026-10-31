import { useMemo } from "react";
import type { MessageBlock, SessionEvent, SessionRecord } from "@actspace/shared";
import type { ClientSessionStore } from "@actspace/client/sessions";
import { useChatSessionRecord } from "./session-store";
import { useLiveRunView, type LiveRunStore, type LiveRunView } from "./live-runs/live-run-store";
import { useSessionLocalState, type SessionLocalState, type SessionLocalStore } from "./session-local-store";
import { mergeTranscript } from "./transcript";

const EMPTY_EVENTS: SessionEvent[] = [];
const selectBashUpdates = (state: SessionLocalState) => state.bashUpdates;
const selectCompactionFailure = (state: SessionLocalState) => state.compactionFailure ?? null;

export type SessionTranscript = {
  readonly sessionRecord: SessionRecord | null;
  readonly historyBefore: number | null;
  readonly live: LiveRunView;
  /** durable、live 和本地块合并后的完整消息序列（规则见 transcript.ts）。 */
  readonly messages: MessageBlock[];
  readonly isCompacting: boolean;
};

/**
 * 一个会话的消息序列：主会话和右栏的侧边对话共用。
 * cell 只在 useChatSessionRecord 里读取，不进调用方的作用域（理由见 useChatSessionRecord）。
 */
export function useSessionTranscript(
  stores: { readonly sessionStore: ClientSessionStore; readonly liveRuns: LiveRunStore; readonly localStore: SessionLocalStore },
  sessionId: string | null,
  workspaceRoot: string | undefined,
): SessionTranscript {
  const live = useLiveRunView(stores.liveRuns, sessionId);
  const { sessionRecord, historyBefore } = useChatSessionRecord(stores.sessionStore, sessionId, workspaceRoot);
  const bashUpdates = useSessionLocalState(stores.localStore, sessionId, selectBashUpdates);
  const compactionFailure = useSessionLocalState(stores.localStore, sessionId, selectCompactionFailure);
  const persistedEvents = sessionRecord?.events ?? EMPTY_EVENTS;
  const { blocks, runId, recovered, isStreaming } = live;
  const messages = useMemo<MessageBlock[]>(() => mergeTranscript(
    { blocks: sessionRecord?.messageBlocks, events: persistedEvents },
    { blocks, runId, recovered },
    { compactionFailure, isStreaming, bashUpdates },
  ), [sessionRecord?.messageBlocks, persistedEvents, blocks, runId, recovered, compactionFailure, isStreaming, bashUpdates]);
  const isCompacting = blocks.some((block) => block.kind === "context_compaction" && block.status === "running");
  return { sessionRecord, historyBefore, live, messages, isCompacting };
}
