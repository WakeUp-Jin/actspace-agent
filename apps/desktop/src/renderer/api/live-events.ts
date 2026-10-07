import type { RuntimeV2DesktopLiveEnvelope } from "@actspace/shared/runtime-v2";
import { eventsApi } from "./events";

type LiveListener = (envelope: RuntimeV2DesktopLiveEnvelope) => void;
type LiveSource = (listener: LiveListener) => () => void;

export interface LiveEventHub {
  /** 收所有 live 事件；签名与 `eventsApi.sessionLive` 相同，可直接交给 DesktopSessionBridge。 */
  subscribe(listener: LiveListener): () => void;
  /** 只收 `event.message` 等于给定值的事件。 */
  onMessage(message: string, listener: LiveListener): () => void;
}

/**
 * 14 S8：`sessionLive` 全局只订阅一次，再分发给各消费者。
 * 第一个消费者挂上时订阅，最后一个退订时释放，下次再有消费者时重新订阅（测试会在用例之间替换 bridge）。
 * 某个消费者抛错不影响其他消费者，错误照常打到控制台。
 */
export function createLiveEventHub(source: LiveSource): LiveEventHub {
  const listeners = new Set<LiveListener>();
  let release: (() => void) | null = null;
  const dispatch: LiveListener = (envelope) => {
    for (const listener of [...listeners]) {
      try { listener(envelope); } catch (error) { console.error("Live event listener failed", error); }
    }
  };
  const subscribe = (listener: LiveListener) => {
    // 同一个函数挂两次也各算一个消费者。
    const entry: LiveListener = (envelope) => listener(envelope);
    listeners.add(entry);
    if (!release) release = source(dispatch);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(entry);
      if (listeners.size === 0 && release) {
        const done = release;
        release = null;
        done();
      }
    };
  };
  return {
    subscribe,
    onMessage: (message, listener) => subscribe((envelope) => { if (envelope.event.message === message) listener(envelope); }),
  };
}

export const liveEvents = createLiveEventHub((listener) => eventsApi.sessionLive(listener));
