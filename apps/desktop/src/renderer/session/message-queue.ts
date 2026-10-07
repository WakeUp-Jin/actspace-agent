import type { ComposerSendOptions } from "../components/Composer";
import type { ComposerAttachment } from "@actspace/shared";
import type { TaskContentEnvelope } from "@actspace/shared/runtime-v2";
import { isLocalSession } from "../target/locate-session";

/** Reconstruct remote attachments from durable Host facts, including after Reload. */
export function taskAttachments(sessionId: string, envelope: TaskContentEnvelope): ComposerAttachment[] | undefined {
  if (envelope?.kind !== "composer-task") return undefined;
  const original = envelope.original as unknown as { attachments?: ComposerAttachment[]; uploadIds?: string[] };
  // 损坏的 key 按远端处理：不信任本地路径。
  if (isLocalSession(sessionId)) return original.attachments;
  if (!Array.isArray(original.uploadIds) || !Array.isArray(envelope.prepared)) return undefined;
  const prepared = envelope.prepared;
  return original.uploadIds.flatMap(artifactId => {
    const block = prepared.find(value => value && typeof value === "object" && !Array.isArray(value) && value.type === "artifact" && value.artifact && typeof value.artifact === "object" && !Array.isArray(value.artifact) && value.artifact.artifactId === artifactId);
    if (!block || typeof block !== "object" || Array.isArray(block)) return [];
    const artifact = block.artifact as { mediaType?: string };
    return [{ id: artifactId, kind: artifact.mediaType?.startsWith("image/") ? "image" as const : "file" as const,
      name: typeof block.label === "string" ? block.label : artifactId, mimeType: artifact.mediaType,
      remoteArtifact: { sessionId, artifactId } }];
  });
}

/** Host 持久队列的内容投影；执行配置在消费时独立读取。 */
export type QueuedComposerMessage = {
  /** Host Task ID。 */
  id: string;
  kind: "message" | "compact";
  text: string;
  options: Pick<ComposerSendOptions, "attachments" | "fileReferences" | "responseAnnotations">;
};

export type SessionMessageQueue = {
  items: readonly QueuedComposerMessage[];
  /** 已引导进当前回合、还没被 loop 读到的消息。 */
  steering: readonly QueuedComposerMessage[];
  /** 停止 / 失败后暂停，不自动发出，直到用户继续或手动发送。 */
  paused: boolean;
};

export const EMPTY_MESSAGE_QUEUE: SessionMessageQueue = { items: [], steering: [], paused: false };

export function isQueueEmpty(queue: SessionMessageQueue): boolean {
  return queue.items.length === 0 && queue.steering.length === 0;
}

export function takeSteering(queue: SessionMessageQueue, id: string): { queue: SessionMessageQueue; item?: QueuedComposerMessage } {
  const item = queue.steering.find((candidate) => candidate.id === id);
  if (!item) return { queue };
  return { queue: { ...queue, steering: queue.steering.filter((candidate) => candidate !== item) }, item };
}

export function projectTaskQueue(snapshot: import("@actspace/shared/runtime-v2").TaskSnapshot): SessionMessageQueue {
  const items: QueuedComposerMessage[] = []; const steering: QueuedComposerMessage[] = [];
  for (const id of snapshot.queue) {
    const task = snapshot.tasks.find(task => task.taskId === id);
    if (!task || task.state !== "pending") continue;
    const envelope = task.content as import("@actspace/shared/runtime-v2").TaskContentEnvelope;
    const original = envelope?.kind === "composer-task" ? envelope.original as unknown as import("@actspace/shared/runtime-v2").SubmitTaskInput : null;
    const text = original?.userInput ?? (typeof task.content === "string" ? task.content : "待执行消息");
    const item: QueuedComposerMessage = { id, text, kind: text.trim() === "/compact" ? "compact" : "message", options: { attachments: taskAttachments(snapshot.sessionId, envelope), fileReferences: original?.fileReferences, responseAnnotations: original?.responseAnnotations } };
    (task.targetRunId ? steering : items).push(item);
  }
  return { items, steering, paused: snapshot.paused };
}
