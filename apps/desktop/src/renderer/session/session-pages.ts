import type { ClientSessionStore } from "@actspace/client/sessions";
import type { RuntimeV2DesktopSessionProjection, RuntimeV2SessionProjectionInput } from "@actspace/shared/runtime-v2";
import { sessionsApi } from "../api/sessions";

// 早期历史分页（14 S4）：按 cell 当前窗口的 beforeSeq 取上一页，交给 ClientSessionStore 合并。
// 合并规则在 applyEnvelope 里（相邻窗口按 seq 并入，较旧的页不覆盖已有消息），这里不再手工拼事件。

type GetPage = (input: RuntimeV2SessionProjectionInput) => Promise<RuntimeV2DesktopSessionProjection>;

const pending = new WeakMap<ClientSessionStore, Map<string, Promise<boolean>>>();

/**
 * 加载一个会话的上一页历史。返回 true 表示已并入 store；没有更早的历史、或页回来时
 * cell 已被 evict / 窗口已被替换（页不再与窗口相邻），返回 false 并丢弃该页。
 * 同一会话同时只有一个请求，重复调用拿到同一个 Promise。读取失败时抛出，由调用方显示错误。
 */
export function loadEarlier(store: ClientSessionStore, sessionId: string, getPage: GetPage = sessionsApi.getPage): Promise<boolean> {
  const loads = pending.get(store) ?? new Map<string, Promise<boolean>>();
  pending.set(store, loads);
  const inFlight = loads.get(sessionId);
  if (inFlight) return inFlight;
  const beforeSeq = store.peek(sessionId)?.window?.beforeSeq;
  if (beforeSeq == null) return Promise.resolve(false);
  const job = (async () => {
    const page = await getPage({ sessionId, beforeSeq });
    if (page.sessionId !== sessionId) throw new Error("Session projection identity mismatch.");
    if (store.peek(sessionId)?.window?.beforeSeq !== beforeSeq) return false;
    return store.applyEnvelope(page);
  })().finally(() => loads.delete(sessionId));
  loads.set(sessionId, job);
  return job;
}

