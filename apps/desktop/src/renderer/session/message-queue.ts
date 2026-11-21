import type { ComposerSendOptions } from "../components/Composer";
import type { ComposerAttachment, ResponseAnnotationReference } from "@actspace/shared";
import { isBackgroundWake, type TaskContentEnvelope } from "@actspace/shared/runtime-v2";
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

/** `starting`：空闲发送时正在开始的那条任务，它已作为乐观消息显示在消息流里，不进托盘。 */
export function projectTaskQueue(snapshot: import("@actspace/shared/runtime-v2").TaskSnapshot, starting?: (task: import("@actspace/shared/runtime-v2").TaskRecord) => boolean): SessionMessageQueue {
  const items: QueuedComposerMessage[] = []; const steering: QueuedComposerMessage[] = [];
  for (const id of snapshot.queue) {
    const task = snapshot.tasks.find(task => task.taskId === id);
    // 后台任务唤醒不是用户消息，不进排队列表。
    if (task?.state !== "pending" || isBackgroundWake(task.content) || starting?.(task)) continue;
    (task.targetRunId ? steering : items).push(queuedMessageFromTask(snapshot.sessionId, task));
  }
  return { items, steering, paused: snapshot.paused };
}

/** 一条用户任务提交时的正文、附件、引用和批注；排队托盘和「取消后放回输入框」共用。 */
export function queuedMessageFromTask(sessionId: string, task: import("@actspace/shared/runtime-v2").TaskRecord): QueuedComposerMessage {
  const envelope = task.content as import("@actspace/shared/runtime-v2").TaskContentEnvelope;
  const original = envelope?.kind === "composer-task" ? envelope.original as unknown as import("@actspace/shared/runtime-v2").SubmitTaskInput : null;
  const text = original?.userInput ?? (typeof task.content === "string" ? task.content : "待执行消息");
  return { id: task.taskId, text, kind: text.trim() === "/compact" ? "compact" : "message", options: { attachments: taskAttachments(sessionId, envelope), fileReferences: original?.fileReferences, responseAnnotations: original?.responseAnnotations } };
}

/**
 * 停止一条还没开始执行的消息（误触发送、马上停止）：把它原样放回输入框，像编辑排队消息一样。
 * 输入框里已经又打了字、加了附件或批注时不覆盖：被取消的消息在前，新内容接在后面。
 */
export function cancelledMessageDraft(
  item: QueuedComposerMessage,
  current: { readonly text?: string; readonly attachments?: readonly ComposerAttachment[]; readonly annotations?: readonly ResponseAnnotationReference[] },
): Pick<ComposerSendOptions, "attachments" | "fileReferences" | "responseAnnotations"> & { text: string } {
  const typed = current.text?.trim() ? current.text : "";
  const attachments = mergeById([...(item.options.attachments ?? []), ...(current.attachments ?? [])], attachment => attachment.id);
  const responseAnnotations = mergeById([...(item.options.responseAnnotations ?? []), ...(current.annotations ?? [])], annotation => annotation.annotationId);
  return {
    text: typed ? `${item.text}\n\n${typed}` : item.text,
    ...(attachments.length ? { attachments } : {}),
    ...(item.options.fileReferences?.length ? { fileReferences: item.options.fileReferences } : {}),
    ...(responseAnnotations.length ? { responseAnnotations } : {}),
  };
}

function mergeById<T>(items: readonly T[], id: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => !seen.has(id(item)) && Boolean(seen.add(id(item))));
}
