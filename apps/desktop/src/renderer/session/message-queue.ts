import type { ComposerSendOptions } from "../components/Composer";

/** Host 持久队列的内容投影；执行配置在消费时独立读取。 */
export type QueuedComposerMessage = {
  /** 同时用作插入时的 inbox messageId。 */
  id: string;
  kind: "message" | "compact";
  text: string;
  options: Pick<ComposerSendOptions, "attachments" | "fileReferences" | "responseAnnotations">;
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
    options: { attachments: options.attachments, fileReferences: options.fileReferences, responseAnnotations: options.responseAnnotations },
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

export function projectTaskQueue(snapshot: import("@actspace/shared/runtime-v2").TaskSnapshot): SessionMessageQueue {
  const items: QueuedComposerMessage[] = []; const steering: QueuedComposerMessage[] = [];
  for (const id of snapshot.queue) {
    const task = snapshot.tasks.find(task => task.taskId === id);
    if (!task || task.state !== "pending") continue;
    const envelope = task.content as import("@actspace/shared/runtime-v2").TaskContentEnvelope;
    const original = envelope?.kind === "composer-task" ? envelope.original as unknown as import("@actspace/shared/runtime-v2").SubmitTaskInput : null;
    const text = original?.userInput ?? (typeof task.content === "string" ? task.content : "待执行消息");
    const item: QueuedComposerMessage = { id, text, kind: text.trim() === "/compact" ? "compact" : "message", options: { attachments: original?.attachments, fileReferences: original?.fileReferences, responseAnnotations: original?.responseAnnotations } };
    (task.targetRunId ? steering : items).push(item);
  }
  return { items, steering, paused: snapshot.paused };
}
