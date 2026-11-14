import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { MessageBlock, SessionRecord } from "@actspace/shared";
import type { LiveRunStore } from "./live-runs/live-run-store";
import { useLiveRunView } from "./live-runs/live-run-store";
import { useSessionLocalState, type SessionLocalStore } from "./session-local-store";
import { selectCompactionFailure, selectRewindFromSeq, useMergedMessages } from "./use-session-transcript";

// 主会话的消息序列：流式输出时每帧都在变，所以不放在 App 的状态里，也不放进 React context 值。
// 它是一个小 store：TranscriptProvider 每帧重算 messages 并写进去，消费者用 selector 订阅——
// 消息区订阅整个序列，WorkbenchLayout 这类外壳只订阅派生出的小值（已编辑的文件路径、附件来源等），
// 派生值没变就不重渲染。

const EMPTY_MESSAGES: MessageBlock[] = [];

export interface TranscriptStore {
  get(): MessageBlock[];
  subscribe(listener: () => void): () => void;
}

export interface MutableTranscriptStore extends TranscriptStore {
  /** 写入新的序列；引用没变不通知。 */
  set(messages: MessageBlock[]): void;
  /** 写入但不通知：Provider 在渲染期间让同一次渲染的子组件读到最新值，通知留到提交后。 */
  setSilently(messages: MessageBlock[]): void;
  notify(): void;
}

export function createTranscriptStore(initial: MessageBlock[] = EMPTY_MESSAGES): MutableTranscriptStore {
  let messages = initial;
  let notified = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => messages,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSilently(next) {
      messages = next;
    },
    notify() {
      if (notified === messages) return;
      notified = messages;
      for (const listener of [...listeners]) listener();
    },
    set(next) {
      messages = next;
      this.notify();
    },
  };
}

const TranscriptContext = createContext<TranscriptStore | null>(null);

/** 直接提供一个现成的 store（测试和没有 live run 的场景）。 */
export function TranscriptStoreProvider({
  store,
  children,
}: {
  readonly store: TranscriptStore;
  readonly children: ReactNode;
}) {
  return <TranscriptContext.Provider value={store}>{children}</TranscriptContext.Provider>;
}

/**
 * 订阅当前会话的 live run、本地压缩失败块，与 durable 记录合并出消息序列，写进 store。
 * 每帧只有这个组件自己重渲染：`children` 是调用方创建的同一个元素，React 不会因此重渲染它们。
 * `sessionRecord` 由 App 提供（引用稳定，chunk 不会让它变）。
 */
export function SessionTranscriptProvider({
  liveRuns,
  localStore,
  sessionId,
  sessionRecord,
  children,
}: {
  readonly liveRuns: LiveRunStore;
  readonly localStore: SessionLocalStore;
  readonly sessionId: string | null;
  readonly sessionRecord: SessionRecord | null;
  readonly children: ReactNode;
}) {
  const storeRef = useRef<MutableTranscriptStore | null>(null);
  if (storeRef.current === null) storeRef.current = createTranscriptStore();
  const store = storeRef.current;
  const live = useLiveRunView(liveRuns, sessionId);
  const compactionFailure = useSessionLocalState(localStore, sessionId, selectCompactionFailure);
  const rewindFromSeq = useSessionLocalState(localStore, sessionId, selectRewindFromSeq);
  const messages = useMergedMessages(sessionRecord, live, compactionFailure, rewindFromSeq);
  store.setSilently(messages);
  useLayoutEffect(() => {
    store.notify();
  });
  return <TranscriptContext.Provider value={store}>{children}</TranscriptContext.Provider>;
}

/**
 * 订阅消息序列的一部分。`selector` 每次序列变化都会重算，结果按 `isEqual` 判等，
 * 相等就沿用上一次的引用，组件只在派生值真的变了才重渲染。没有 Provider 时 selector 收到空序列。
 */
export function useTranscriptSelect<T>(
  selector: (messages: MessageBlock[]) => T,
  isEqual: (left: T, right: T) => boolean = Object.is,
): T {
  const store = useContext(TranscriptContext);
  const cache = useRef<{ messages: MessageBlock[]; selector: typeof selector; value: T } | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => (store ? store.subscribe(onChange) : () => undefined),
    [store],
  );
  const getSnapshot = useCallback((): T => {
    const messages = store ? store.get() : EMPTY_MESSAGES;
    const cached = cache.current;
    if (cached && cached.messages === messages && cached.selector === selector) return cached.value;
    const value = selector(messages);
    const next = cached && isEqual(cached.value, value) ? cached.value : value;
    cache.current = { messages, selector, value: next };
    return next;
  }, [store, selector, isEqual]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const selectAll = (messages: MessageBlock[]) => messages;

/** 完整消息序列；只有消息区这类真正渲染每条消息的组件才该用。 */
export function useTranscriptMessages(): MessageBlock[] {
  return useTranscriptSelect(selectAll);
}

/** 字符串数组按元素判等，给「派生出一组路径」的 selector 用。 */
export function sameStringList<T extends readonly string[]>(left: T, right: T): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
