import type { ComposerSendOptions } from "../components/Composer";

/** 运行中发送的消息；只在渲染进程内存中，与草稿一样不跨重启。 */
export type QueuedComposerMessage = {
  /** 同时用作插入时的 inbox messageId。 */
  id: string;
  kind: "message" | "compact";
  text: string;
  options: ComposerSendOptions;
};

export type SessionMessageQueue = {
  items: readonly QueuedComposerMessage[];
  /** 已插入当前回合、还没被 loop 读到的消息。 */
  steering: readonly QueuedComposerMessage[];
  /** 停止 / 失败后暂停，不自动发出，直到用户继续或手动发送。 */
  paused: boolean;
};

export const EMPTY_MESSAGE_QUEUE: SessionMessageQueue = { items: [], steering: [], paused: false };

export function createQueuedMessage(text: string, options: ComposerSendOptions): QueuedComposerMessage {
  return {
    id: `queued-${crypto.randomUUID()}`,
    kind: text.trim() === "/compact" ? "compact" : "message",
    text,
    options,
  };
}

export function isQueueEmpty(queue: SessionMessageQueue): boolean {
  return queue.items.length === 0 && queue.steering.length === 0;
}

export function enqueueMessage(queue: SessionMessageQueue, item: QueuedComposerMessage): SessionMessageQueue {
  return { ...queue, items: [...queue.items, item] };
}

export function removeQueuedMessage(queue: SessionMessageQueue, id: string): SessionMessageQueue {
  return { ...queue, items: queue.items.filter((item) => item.id !== id) };
}

export function moveQueuedMessageUp(queue: SessionMessageQueue, id: string): SessionMessageQueue {
  const index = queue.items.findIndex((item) => item.id === id);
  if (index <= 0) return queue;
  const items = [...queue.items];
  [items[index - 1], items[index]] = [items[index]!, items[index - 1]!];
  return { ...queue, items };
}

/** 从排队移到「已插入」；`/compact` 不能插入。 */
export function markSteering(queue: SessionMessageQueue, id: string): SessionMessageQueue {
  const item = queue.items.find((candidate) => candidate.id === id);
  if (!item || item.kind !== "message") return queue;
  return { ...queue, items: queue.items.filter((candidate) => candidate !== item), steering: [...queue.steering, item] };
}

export function takeSteering(queue: SessionMessageQueue, id: string): { queue: SessionMessageQueue; item?: QueuedComposerMessage } {
  const item = queue.steering.find((candidate) => candidate.id === id);
  if (!item) return { queue };
  return { queue: { ...queue, steering: queue.steering.filter((candidate) => candidate !== item) }, item };
}

/** 没被读到的插入回到队首，保持原先的插入顺序。 */
export function returnToFront(queue: SessionMessageQueue, returned: readonly QueuedComposerMessage[]): SessionMessageQueue {
  if (returned.length === 0) return queue;
  const ids = new Set(returned.map((item) => item.id));
  return { ...queue, items: [...returned, ...queue.items.filter((item) => !ids.has(item.id))] };
}
