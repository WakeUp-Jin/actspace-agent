import type { ComposerAttachment, FileReference, MessageBlock, ResponseAnnotationReference } from "@actspace/shared";
import { isBackgroundWake, type TaskSnapshot } from "@actspace/shared/runtime-v2";
import { taskAttachments } from "../../session/message-queue";
import { isLocalSession } from "../../target/locate-session";

type UserBlock = Extract<MessageBlock, { kind: "user" }>;

/** 编辑器打开时的内容（agent-edit-resend-rewind.md §4）。 */
export type TurnPromptDraft = {
  readonly text: string;
  readonly attachments: readonly ComposerAttachment[];
  readonly fileReferences: readonly FileReference[];
  readonly responseAnnotations: readonly ResponseAnnotationReference[];
};

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const ATTACHED_FILE = /^Attached file: (.+) \(([^()\s]+)\)$/;

/**
 * 本机会话的附件已经存在会话的 artifacts 里：从 prepared 内容读出 artifactId，重发时不依赖原来的本机路径。
 * 图片和 Chat 文件是 artifact 块，Agent 模式的文件是 `Attached file: 名称 (id)` 文本块。
 */
export function preparedAttachments(prepared: unknown): ComposerAttachment[] {
  if (!Array.isArray(prepared)) return [];
  return prepared.flatMap((block): ComposerAttachment[] => {
    if (!isRecord(block)) return [];
    if (block.type === "artifact" && isRecord(block.artifact) && typeof block.artifact.artifactId === "string") {
      const artifactId = block.artifact.artifactId;
      const mimeType = typeof block.artifact.mediaType === "string" ? block.artifact.mediaType : undefined;
      return [{ id: artifactId, artifactId, kind: mimeType?.startsWith("image/") ? "image" : "file", name: typeof block.label === "string" ? block.label : artifactId, ...(mimeType ? { mimeType } : {}) }];
    }
    const match = block.type === "text" && typeof block.text === "string" ? ATTACHED_FILE.exec(block.text) : null;
    return match ? [{ id: match[2]!, artifactId: match[2]!, kind: "file", name: match[1]! }] : [];
  });
}

/** durable 用户块里的附件：`id` 和 `path` 都是 artifactId。 */
function durableAttachments(user: UserBlock): ComposerAttachment[] {
  return (user.attachments ?? []).map(({ previewUrl: _previewUrl, path, ...attachment }) =>
    ({ ...attachment, artifactId: attachment.artifactId ?? path ?? attachment.id }));
}

/** 编辑器的初始内容：优先取任务快照里这一轮的任务，找不到时退回 durable 用户块（很旧的会话）。 */
export function turnPromptDraft(sessionId: string, user: UserBlock, tasks: TaskSnapshot | undefined): TurnPromptDraft {
  const task = user.runId ? tasks?.tasks.find((item) => item.runId === user.runId && !isBackgroundWake(item.content)) : undefined;
  const envelope = task && isRecord(task.content) && task.content.kind === "composer-task" ? task.content : undefined;
  const original = envelope && isRecord(envelope.original) ? envelope.original : undefined;
  if (envelope && original) {
    const attachments = isLocalSession(sessionId)
      ? preparedAttachments(envelope.prepared)
      : taskAttachments(sessionId, envelope as never) ?? [];
    return {
      text: typeof original.userInput === "string" ? original.userInput : user.content,
      attachments,
      fileReferences: Array.isArray(original.fileReferences) ? original.fileReferences as FileReference[] : [],
      responseAnnotations: Array.isArray(original.responseAnnotations) ? original.responseAnnotations as ResponseAnnotationReference[] : [],
    };
  }
  return {
    text: user.content,
    attachments: isLocalSession(sessionId) ? durableAttachments(user) : [],
    fileReferences: user.fileReferences ?? [],
    responseAnnotations: user.responseAnnotations ?? [],
  };
}
