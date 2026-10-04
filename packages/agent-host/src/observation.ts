import { randomUUID } from "node:crypto";
import { HostError, type HostEvent } from "@actspace/shared/host-protocol";
import type { HostRequestContext } from "./server.js";

type Subscription = { connectionId: string; topic: string; send: (event: HostEvent) => void; close: () => void; ready: boolean; buffer: HostEvent[]; bytes: number };
/** Snapshot reads retry if their domain changes. Registering happens before the first read. */
export class HostObservations {
  #cursor = 0;
  readonly #revisions = new Map<string, number>();
  readonly #subscriptions = new Map<string, Subscription>();
  constructor(private readonly epoch: string) {}
  publish(topic: string, value: unknown): void {
    const cursor = ++this.#cursor; this.#revisions.set(topic, cursor);
    for (const [subscriptionId, subscription] of this.#subscriptions) {
      if (subscription.topic !== topic) continue;
      const event = { subscriptionId, epoch: this.epoch, cursor, value };
      if (subscription.ready) subscription.send(event);
      else {
        subscription.bytes += Buffer.byteLength(JSON.stringify(event));
        if (subscription.bytes > 8 * 1024 * 1024) { this.#subscriptions.delete(subscriptionId); subscription.close(); continue; }
        subscription.buffer.push(event);
      }
    }
  }
  async observe<T>(topic: string, read: () => Promise<T>, context: HostRequestContext): Promise<{ subscriptionId: string; epoch: string; cursor: number; snapshot: T }> {
    const subscriptionId = randomUUID();
    const subscription: Subscription = { close: () => context.close?.(), topic, connectionId: context.connectionId, send: event => context.notify("host.event", event), ready: false, buffer: [], bytes: 0 };
    this.#subscriptions.set(subscriptionId, subscription);
    context.onClose(() => { this.#subscriptions.delete(subscriptionId); });
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const before = this.#revisions.get(topic) ?? 0;
        const snapshot = await read();
        if (!this.#subscriptions.has(subscriptionId)) throw new HostError("LIMIT_EXCEEDED", "Observation buffer exceeded or connection closed", true);
        if (before !== (this.#revisions.get(topic) ?? 0)) continue;
        const cursor = this.#cursor;
        subscription.buffer = []; subscription.bytes = 0;
        context.afterReply(() => {
          if (!this.#subscriptions.has(subscriptionId)) return;
          subscription.ready = true;
          for (const event of subscription.buffer) subscription.send(event);
          subscription.buffer = []; subscription.bytes = 0;
        });
        return { subscriptionId, epoch: this.epoch, cursor, snapshot };
      }
      throw new HostError("CONFLICT", "Session changed during snapshot; retry", true);
    } catch (error) { this.#subscriptions.delete(subscriptionId); throw error; }
  }
  unobserve(id: string, connectionId: string): void {
    const subscription = this.#subscriptions.get(id);
    if (subscription && subscription.connectionId !== connectionId) throw new HostError("FORBIDDEN", "Subscription belongs to another connection");
    this.#subscriptions.delete(id);
  }
  dispose(): void { this.#subscriptions.clear(); }
}
