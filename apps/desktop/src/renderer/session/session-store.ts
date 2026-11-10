import { useCallback, useRef, useSyncExternalStore } from "react";
import type { SessionRecord } from "@actspace/shared";
import { selectChatSession, type ClientSessionCell, type ClientSessionStore } from "@actspace/client/sessions";

// ClientSessionStore 的 React 读取与 cell 保留策略（14 S4）。
// cell 是 durable 历史在本窗口里的唯一缓存：活动会话、运行中的会话常驻，
// 其余只保留最近查看的 SESSION_CELL_RETAIN_LIMIT 个，再早的 evict，下次打开时重新读页。

export const SESSION_CELL_RETAIN_LIMIT = 5;

/**
 * 订阅一个会话的 cell。selector 只在 cell 引用变化时重算（cell 每次变更都会换成新的冻结对象），
 * 所以 selector 可以返回派生的新对象，例如投影出的 SessionRecord；没有 cell 时传入 null。
 */
export function useSessionCell<T>(store: ClientSessionStore, sessionId: string | null, selector: (cell: ClientSessionCell | null) => T): T {
  const cache = useRef<{ cell: ClientSessionCell | null; selector: typeof selector; value: T } | null>(null);
  const subscribe = useCallback((onChange: () => void) => store.subscribe(onChange), [store]);
  const getSnapshot = useCallback(() => {
    const cell = sessionId === null ? null : store.peek(sessionId);
    const cached = cache.current;
    if (cached && cached.cell === cell && cached.selector === selector) return cached.value;
    const value = selector(cell);
    cache.current = { cell, selector, value };
    return value;
  }, [store, sessionId, selector]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type ChatSessionRecordState = { readonly sessionRecord: SessionRecord | null; readonly historyBefore: number | null };

const NO_CHAT_RECORD: ChatSessionRecordState = Object.freeze({ sessionRecord: null, historyBefore: null });

/**
 * 当前会话的 durable 记录（从 cell 投影）与早期历史游标（14 T10）。
 * 返回值是稳定快照：cell 每次变更都会换引用（例如 live 事件只推进 lastLiveSeq），但投影输入没变时快照对象也不变，
 * 调用方（App）不会因此重渲染。流式正文只走实时通道，不经过这里。
 * cell 必须留在这个 hook 里，不能成为 App 的局部变量：同一函数里的闭包共用一个作用域，App 的 useCallback
 * 会让旧渲染的作用域一直存活，cell 在里面就会连同原始事件（系统提示词、技能列表）把已归档会话一起留住。
 */
export function useChatSessionRecord(store: ClientSessionStore, sessionId: string | null, workspaceRoot: string | undefined): ChatSessionRecordState {
  const cache = useRef<{ cell: ClientSessionCell; workspaceRoot: string | undefined; state: ChatSessionRecordState } | null>(null);
  const subscribe = useCallback((onChange: () => void) => store.subscribe(onChange), [store]);
  const getSnapshot = useCallback((): ChatSessionRecordState => {
    const cell = sessionId === null ? null : store.peek(sessionId);
    if (!cell) { cache.current = null; return NO_CHAT_RECORD; }
    const previous = cache.current;
    if (previous && previous.cell === cell && previous.workspaceRoot === workspaceRoot) return previous.state;
    // 投影只读这几个字段：live 事件只推进 lastLiveSeq 时 cell 引用会变，但不必重新投影。
    const sameInputs = previous !== null && previous.workspaceRoot === workspaceRoot
      && previous.cell.sessionId === cell.sessionId && previous.cell.snapshot === cell.snapshot && previous.cell.window === cell.window
      && previous.cell.projectionValues === cell.projectionValues && previous.cell.deferredToolCalls === cell.deferredToolCalls;
    const sessionRecord = sameInputs ? previous.state.sessionRecord : selectChatSession(cell, workspaceRoot);
    const historyBefore = cell.window?.beforeSeq ?? null;
    const state = previous !== null && previous.state.sessionRecord === sessionRecord && previous.state.historyBefore === historyBefore
      ? previous.state
      : { sessionRecord, historyBefore };
    cache.current = { cell, workspaceRoot, state };
    return state;
  }, [store, sessionId, workspaceRoot]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface SessionCellRetention {
  /** 记一次查看：该会话成为最近查看的那个，然后按当前常驻集合清理。 */
  viewed(sessionId: string): void;
  /** 常驻集合（活动会话 + 运行中的会话）变化时调用；常驻的不占 limit 名额。 */
  retain(pinned: ReadonlySet<string>): void;
  /** 归档 / 删除时直接释放；返回 store 是否真的删掉了 cell。 */
  forget(sessionId: string): boolean;
  /** 按查看先后排列的非常驻会话 id；供测试和内存检查用。 */
  order(): string[];
}

export function createSessionCellRetention(store: ClientSessionStore, limit = SESSION_CELL_RETAIN_LIMIT): SessionCellRetention {
  // 查看过的会话，从旧到新；Set 的插入顺序就是查看顺序。
  const recent = new Set<string>();
  let pinned: ReadonlySet<string> = new Set();
  const others = () => {
    const held = store.cellIds().filter((id) => !pinned.has(id));
    // 有 cell 却没被查看过的会话（例如后台 run 读过页）排在最前，先被淘汰。
    return [...held.filter((id) => !recent.has(id)), ...[...recent].filter((id) => !pinned.has(id) && store.peek(id) !== null)];
  };
  const sweep = () => {
    const ordered = others();
    for (const id of ordered.slice(0, Math.max(0, ordered.length - limit))) {
      if (store.evict(id)) recent.delete(id);
    }
  };
  return {
    viewed(sessionId) {
      recent.delete(sessionId);
      recent.add(sessionId);
      sweep();
    },
    retain(next) {
      pinned = next;
      sweep();
    },
    forget(sessionId) {
      const evicted = store.evict(sessionId);
      if (evicted) recent.delete(sessionId);
      return evicted;
    },
    order: others,
  };
}
