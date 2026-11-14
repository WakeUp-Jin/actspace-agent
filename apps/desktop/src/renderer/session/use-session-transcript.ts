import { useMemo } from "react";
import type { MessageBlock, SessionEvent, SessionRecord } from "@actspace/shared";
import type { ClientSessionStore } from "@actspace/client/sessions";
import { useChatSessionRecord } from "./session-store";
import { useLiveRunView, type LiveRunStore, type LiveRunView } from "./live-runs/live-run-store";
import { useSessionLocalState, type SessionLocalState, type SessionLocalStore } from "./session-local-store";
import type { CompactionBlock } from "@actspace/client/live";
import { mergeTranscript } from "./transcript";

const EMPTY_EVENTS: SessionEvent[] = [];
export const selectCompactionFailure = (state: SessionLocalState) => state.compactionFailure ?? null;
export const selectRewindFromSeq = (state: SessionLocalState) => state.rewinding?.fromSeq;

export type SessionTranscript = {
  readonly sessionRecord: SessionRecord | null;
  readonly historyBefore: number | null;
  readonly live: LiveRunView;
  /** durable、live 和本地块合并后的完整消息序列（规则见 transcript.ts）。 */
  readonly messages: MessageBlock[];
  readonly isCompacting: boolean;
};

/** durable 记录、live run 和本地块合并成完整消息序列（规则见 transcript.ts）。引用随输入变化，输入不变则不变。 */
export function useMergedMessages(
  sessionRecord: SessionRecord | null,
  live: LiveRunView,
  compactionFailure: CompactionBlock | null,
  rewindFromSeq?: number,
): MessageBlock[] {
  const persistedEvents = sessionRecord?.events ?? EMPTY_EVENTS;
  const { blocks, runId, recovered, isStreaming } = live;
  return useMemo<MessageBlock[]>(
    () =>
      mergeTranscript(
        { blocks: sessionRecord?.messageBlocks, events: persistedEvents },
        { blocks, runId, recovered },
        { compactionFailure: compactionFailure ?? undefined, isStreaming, rewindFromSeq },
      ),
    [
      sessionRecord?.messageBlocks,
      persistedEvents,
      blocks,
      runId,
      recovered,
      compactionFailure,
      isStreaming,
      rewindFromSeq,
    ],
  );
}

/**
 * 一个会话的消息序列：右栏的侧边对话用它；主会话的 App 把订阅拆开了（见 transcript-context.tsx）。
 * cell 只在 useChatSessionRecord 里读取，不进调用方的作用域（理由见 useChatSessionRecord）。
 */
export function useSessionTranscript(
  stores: {
    readonly sessionStore: ClientSessionStore;
    readonly liveRuns: LiveRunStore;
    readonly localStore: SessionLocalStore;
  },
  sessionId: string | null,
  workspaceRoot: string | undefined,
): SessionTranscript {
  const live = useLiveRunView(stores.liveRuns, sessionId);
  const { sessionRecord, historyBefore } = useChatSessionRecord(stores.sessionStore, sessionId, workspaceRoot);
  const compactionFailure = useSessionLocalState(stores.localStore, sessionId, selectCompactionFailure);
  const rewindFromSeq = useSessionLocalState(stores.localStore, sessionId, selectRewindFromSeq);
  const messages = useMergedMessages(sessionRecord, live, compactionFailure, rewindFromSeq);
  const isCompacting = live.blocks.some((block) => block.kind === "context_compaction" && block.status === "running");
  return { sessionRecord, historyBefore, live, messages, isCompacting };
}
