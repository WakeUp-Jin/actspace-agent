import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
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

const selectCell = (cell: ClientSessionCell | null) => cell;

/**
 * 当前会话的 durable 记录（从 cell 投影）与早期历史游标（14 T10）。
 * 依赖只列 selectChatSession 读取的字段：live 事件只推进 lastLiveSeq 时 cell 引用会变，但不必重新投影。
 * cell 必须留在这个 hook 里，不能成为 App 的局部变量：同一函数里的闭包共用一个作用域，App 的 useCallback
 * 会让旧渲染的作用域一直存活，cell 在里面就会连同原始事件（系统提示词、技能列表）把已归档会话一起留住。
 */
export function useChatSessionRecord(store: ClientSessionStore, sessionId: string | null, workspaceRoot: string | undefined, recovered = false): { sessionRecord: SessionRecord | null; historyBefore: number | null } {
  const cell = useSessionCell(store, sessionId, selectCell);
  // 普通 live run 不投影片段，保留历史块引用；重载恢复的 run 从 Journal 重建已收正文，
  // 因而必须消费后续 chunk，不能走普通流式输出的投影复用路径。
  const projected = useRef<{ cell: ClientSessionCell; workspaceRoot: string | undefined; recovered: boolean; record: SessionRecord | null } | null>(null);
  const sessionRecord = useMemo(() => {
    if (!cell) { projected.current = null; return null; }
    const previous = projected.current;
    if (!recovered && previous && previous.recovered === recovered && previous.workspaceRoot === workspaceRoot && onlyStreamChunksSince(previous.cell, cell)) {
      projected.current = { ...previous, cell };
      return previous.record;
    }
    const record = selectChatSession(cell, workspaceRoot, { includePendingChunks: recovered });
    projected.current = { cell, workspaceRoot, recovered, record };
    return record;
  }, [cell?.sessionId, cell?.snapshot, cell?.window, cell?.projectionValues, cell?.deferredToolCalls, workspaceRoot, recovered]);
  return { sessionRecord, historyBefore: cell?.window?.beforeSeq ?? null };
}

/** snapshot 里随每条 journal 事件变化、但不进聊天投影的字段。 */
const CHUNK_VOLATILE_SNAPSHOT_KEYS: ReadonlySet<string> = new Set(["throughJournalSeq", "updatedAt"]);

/**
 * `next` 相对 `previous` 是否只在窗口末尾多了 `assistant/chunk`（其余投影输入全是同一引用）。
 * 是的话聊天投影结果不变（只差 updatedAt 与 contextSnapshot 的 throughJournalSeq），可以沿用。
 */
export function onlyStreamChunksSince(previous: ClientSessionCell, next: ClientSessionCell): boolean {
  if (previous === next) return true;
  if (previous.sessionId !== next.sessionId || previous.deferredToolCalls !== next.deferredToolCalls) return false;
  const before = previous.window;
  const after = next.window;
  if (!before || !after || !previous.snapshot || !next.snapshot) return false;
  if (after.fromSeq !== before.fromSeq || after.beforeSeq !== before.beforeSeq || after.turnOffset !== before.turnOffset || after.requestOffset !== before.requestOffset) return false;
  const kept = before.events.length;
  if (after.events.length < kept || (kept > 0 && after.events[kept - 1] !== before.events[kept - 1])) return false;
  for (let index = kept; index < after.events.length; index++) if (after.events[index]!.type !== "assistant/chunk") return false;
  if (!shallowEqual(previous.projectionValues, next.projectionValues)) return false;
  return shallowEqual(previous.snapshot, next.snapshot, CHUNK_VOLATILE_SNAPSHOT_KEYS);
}

function shallowEqual(left: object, right: object, ignored?: ReadonlySet<string>): boolean {
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!ignored?.has(key) && a[key] !== b[key]) return false;
  return true;
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
