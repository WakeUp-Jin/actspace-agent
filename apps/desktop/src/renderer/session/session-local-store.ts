import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from "react";
import type { ComposerAttachment, ComposerMode, ModelSelectionId, ResponseAnnotationReference } from "@actspace/shared";
import type { ComposerDraftRestore, ComposerSendOptions } from "../components/Composer";
import { revokeAttachmentPreviews } from "../components/composer/attachment-preview";
import type { CompactionBlock } from "./live-runs/stream-blocks";
import { EMPTY_MESSAGE_QUEUE, type SessionMessageQueue } from "./message-queue";

// 按会话的本地状态（02 §3.1）：只存在于本窗口、没有 durable 事实源的那部分。
// 归档 / 删除会话、移除 Host 时用 evict 释放（连同草稿附件的预览 URL）；没有条目的会话读到 DEFAULT_SESSION_LOCAL_STATE。

export type ComposerSessionState = { mode: ComposerMode; selectedSkills: string[] };

export type SessionLocalState = {
  /** 输入框里正在编辑的正文和回复批注（WorkbenchLayout 切换会话时读回）。 */
  composerText?: string;
  annotationDraft?: ResponseAnnotationReference[];
  /** 输入框里还没发送的附件（16 T14，00 J4）。图片预览的 blob URL 在 evict 时释放。 */
  attachments?: ComposerAttachment[];
  /** 发送失败后由 App 恢复到输入框的草稿（带错误和附件问题）。 */
  draft?: ComposerDraftRestore;
  composer?: ComposerSessionState;
  compactionFailure?: CompactionBlock;
  lastSendOptions?: ComposerSendOptions;
  /** 侧边对话输入框选的模型；没选过时用主会话的。 */
  selectedModelId?: ModelSelectionId;
  approvalPending: boolean;
  failed: boolean;
  /** 不在当前会话时跑完了一轮，还没打开看过；只在本窗口内存里，侧栏显示绿点。 */
  unread: boolean;
  messageQueue: SessionMessageQueue;
  /** 页请求 / 审批请求的版本号：响应回来时与它比较，旧响应丢弃。 */
  pageVersion: number;
  approvalVersion: number;
};

export const DEFAULT_SESSION_LOCAL_STATE: SessionLocalState = Object.freeze({
  approvalPending: false,
  failed: false,
  unread: false,
  messageQueue: EMPTY_MESSAGE_QUEUE,
  pageVersion: 0,
  approvalVersion: 0,
});

export interface SessionLocalStore {
  get(sessionId: string): SessionLocalState;
  /** `fn` 返回同一个对象时视为没有变化，不通知订阅者。 */
  update(sessionId: string, fn: (state: SessionLocalState) => SessionLocalState): void;
  subscribe(listener: () => void): () => void;
  evict(sessionId: string): void;
  evictWhere(predicate: (sessionId: string) => boolean): void;
  /** 当前持有条目的会话 id；供测试和内存检查用。 */
  ids(): string[];
}

/** 输入框里的附件和发送失败后待恢复的附件可能共用同一个预览 URL，重复释放无害。 */
function releaseAttachmentPreviews(state: SessionLocalState | undefined): void {
  revokeAttachmentPreviews(state?.attachments);
  revokeAttachmentPreviews(state?.draft?.attachments);
}

export function createSessionLocalStore(): SessionLocalStore {
  const states = new Map<string, SessionLocalState>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  const get = (sessionId: string) => states.get(sessionId) ?? DEFAULT_SESSION_LOCAL_STATE;
  return {
    get,
    update(sessionId, fn) {
      const current = get(sessionId);
      const next = fn(current);
      if (next === current) return;
      states.set(sessionId, next);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    evict(sessionId) {
      releaseAttachmentPreviews(states.get(sessionId));
      if (states.delete(sessionId)) notify();
    },
    evictWhere(predicate) {
      let changed = false;
      for (const sessionId of [...states.keys()]) {
        if (!predicate(sessionId)) continue;
        releaseAttachmentPreviews(states.get(sessionId));
        states.delete(sessionId);
        changed = true;
      }
      if (changed) notify();
    },
    ids: () => [...states.keys()],
  };
}

export const SessionLocalStoreContext = createContext<SessionLocalStore | null>(null);

/**
 * 订阅一个会话的本地状态。selector 的结果按 `Object.is` 比较，不变就不重渲染，
 * 所以 selector 只能返回 state 里已有的引用或原始值，不要在里面新建对象。
 */
export function useSessionLocalState<T>(store: SessionLocalStore, sessionId: string | null, selector: (state: SessionLocalState) => T): T {
  const getSnapshot = useCallback(
    () => selector(sessionId === null ? DEFAULT_SESSION_LOCAL_STATE : store.get(sessionId)),
    [store, sessionId, selector],
  );
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * 跨会话的成员集合（例如「等待审批的会话」）。成员不变时返回同一个 Set，下游 memo 不会白算。
 */
export function useSessionLocalIds(store: SessionLocalStore, predicate: (state: SessionLocalState) => boolean): ReadonlySet<string> {
  const cache = useRef(EMPTY_IDS);
  const getSnapshot = useCallback(() => {
    const ids = store.ids().filter((id) => predicate(store.get(id)));
    const previous = cache.current;
    if (ids.length === previous.size && ids.every((id) => previous.has(id))) return previous;
    cache.current = new Set(ids);
    return cache.current;
  }, [store, predicate]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useSessionLocal<T>(sessionId: string | null, selector: (state: SessionLocalState) => T): T {
  const store = useContext(SessionLocalStoreContext);
  if (!store) throw new Error("useSessionLocal 需要 SessionLocalStoreContext");
  return useSessionLocalState(store, sessionId, selector);
}
