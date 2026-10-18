import type { HostEvent } from "@actspace/shared/host-protocol";

type Listener = (value: unknown, event: HostEvent) => void;

/**
 * 按 subscriptionId 把 host.event 分给订阅方。observe 的回复和第一条事件之间订阅方还没挂上，
 * 这段时间的事件先暂存，挂上后按顺序补发。
 */
export class HostEventRouter {
  readonly #listeners = new Map<string, Set<Listener>>();
  readonly #pending = new Map<string, HostEvent[]>();
  static readonly PENDING_LIMIT = 512;

  accept = (event: HostEvent): void => {
    const listeners = this.#listeners.get(event.subscriptionId);
    if (listeners?.size) {
      for (const listener of [...listeners]) listener(event.value, event);
      return;
    }
    const pending = this.#pending.get(event.subscriptionId) ?? [];
    if (pending.length < HostEventRouter.PENDING_LIMIT) pending.push(event);
    this.#pending.set(event.subscriptionId, pending);
  };

  on(subscriptionId: string, listener: Listener): () => void {
    const listeners = this.#listeners.get(subscriptionId) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(subscriptionId, listeners);
    const pending = this.#pending.get(subscriptionId);
    this.#pending.delete(subscriptionId);
    for (const event of pending ?? []) listener(event.value, event);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.#listeners.delete(subscriptionId);
    };
  }

  /** unobserve 之后丢掉残留的暂存事件。 */
  forget(subscriptionId: string): void {
    this.#pending.delete(subscriptionId);
    this.#listeners.delete(subscriptionId);
  }
}
