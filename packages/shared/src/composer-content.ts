/**
 * Composer 结构化引用：`@` 工作区文件引用与助手回复批注。
 *
 * 两者作为用户消息 surface content 里的独立内容块持久化（`file-reference` /
 * `response-excerpt`），不新增 journal 事件或 payload 字段。本文件是这份契约的唯一真源：
 * 类型、上限、校验、块读写和发给模型的文本都在这里。
 * 设计：docs/design-docs/frontend/front-composer-file-mentions-and-response-annotations.md
 */

export const COMPOSER_REFERENCE_LIMITS = {
  maxFileReferences: 20,
  maxRelativePathLength: 1024,
  maxDisplayNameLength: 255,
  maxResponseAnnotations: 20,
  maxSelectedTextCodePoints: 8000,
  /** prefixContext / suffixContext 各自的 UTF-16 码元上限。 */
  maxContextCodeUnits: 64,
  maxCommentCodePoints: 2000,
  maxIdLength: 200,
} as const;

export type FileReference = {
  /** POSIX 分隔符，相对 session workspace，不以 / 开头，不含 `..`。 */
  relativePath: string;
  /** 仅用于 UI 展示，不是身份。 */
  displayName: string;
};

export type ResponseAnnotationReference = {
  annotationId: string;
  /** 目标回复的 MessageBlock.id（形如 `v2-<seq>`）。 */
  assistantMessageId: string;
  selectedText: string;
  /** 回复「可批注可见文本」中的 UTF-16 偏移，start < end。 */
  startOffset: number;
  endOffset: number;
  prefixContext: string;
  suffixContext: string;
  comment?: string;
};

export type FileReferenceContentBlock = { type: "file-reference" } & FileReference;
export type ResponseExcerptContentBlock = { type: "response-excerpt" } & ResponseAnnotationReference;

export type ComposerReferenceIssue = {
  code:
    | "invalid_reference"
    | "too_many_references"
    | "file_references_not_allowed"
    | "file_not_found"
    | "file_outside_workspace"
    | "not_a_file"
    | "annotation_source_missing"
    | "annotation_text_too_long"
    | "annotation_comment_too_long";
  kind: "file" | "annotation";
  index?: number;
  relativePath?: string;
  limit?: number;
};

export type ComposerReferenceValidation<T> =
  | { ok: true; value: T[] }
  | { ok: false; issue: ComposerReferenceIssue };

export function normalizeWorkspaceRelativePath(path: string): string | null {
  if (typeof path !== "string" || path.includes("\0")) return null;
  let normalized = path.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(normalized)) return null;
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  normalized = normalized.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (!normalized || normalized.length > COMPOSER_REFERENCE_LIMITS.maxRelativePathLength) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === ".")) return null;
  return normalized;
}

export function validateFileReferences(input: unknown): ComposerReferenceValidation<FileReference> {
  if (input === undefined) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, issue: { code: "invalid_reference", kind: "file" } };
  const value: FileReference[] = [];
  const seen = new Set<string>();
  for (const [index, item] of input.entries()) {
    if (!isRecord(item) || typeof item.relativePath !== "string" || typeof item.displayName !== "string") {
      return { ok: false, issue: { code: "invalid_reference", kind: "file", index } };
    }
    const relativePath = normalizeWorkspaceRelativePath(item.relativePath);
    if (!relativePath) return { ok: false, issue: { code: "invalid_reference", kind: "file", index, relativePath: item.relativePath.slice(0, 200) } };
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    const displayName = item.displayName.trim().slice(0, COMPOSER_REFERENCE_LIMITS.maxDisplayNameLength) || basename(relativePath);
    value.push({ relativePath, displayName });
  }
  if (value.length > COMPOSER_REFERENCE_LIMITS.maxFileReferences) {
    return { ok: false, issue: { code: "too_many_references", kind: "file", limit: COMPOSER_REFERENCE_LIMITS.maxFileReferences } };
  }
  return { ok: true, value };
}

export function validateResponseAnnotations(input: unknown): ComposerReferenceValidation<ResponseAnnotationReference> {
  if (input === undefined) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, issue: { code: "invalid_reference", kind: "annotation" } };
  const limits = COMPOSER_REFERENCE_LIMITS;
  const value: ResponseAnnotationReference[] = [];
  const seen = new Set<string>();
  for (const [index, item] of input.entries()) {
    const invalid = { ok: false as const, issue: { code: "invalid_reference" as const, kind: "annotation" as const, index } };
    if (!isRecord(item)) return invalid;
    const { annotationId, assistantMessageId, selectedText, startOffset, endOffset, prefixContext, suffixContext, comment } = item;
    if (!isBoundedId(annotationId) || !isBoundedId(assistantMessageId)) return invalid;
    if (typeof selectedText !== "string" || !selectedText.trim()) return invalid;
    if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset)) return invalid;
    if ((startOffset as number) < 0 || (startOffset as number) >= (endOffset as number)) return invalid;
    if (typeof prefixContext !== "string" || typeof suffixContext !== "string") return invalid;
    if (prefixContext.length > limits.maxContextCodeUnits || suffixContext.length > limits.maxContextCodeUnits) return invalid;
    if (comment !== undefined && typeof comment !== "string") return invalid;
    if (codePointLength(selectedText) > limits.maxSelectedTextCodePoints) {
      return { ok: false, issue: { code: "annotation_text_too_long", kind: "annotation", index, limit: limits.maxSelectedTextCodePoints } };
    }
    if (comment !== undefined && codePointLength(comment) > limits.maxCommentCodePoints) {
      return { ok: false, issue: { code: "annotation_comment_too_long", kind: "annotation", index, limit: limits.maxCommentCodePoints } };
    }
    const key = responseAnnotationKey({ assistantMessageId, startOffset, endOffset } as ResponseAnnotationReference);
    if (seen.has(key)) continue;
    seen.add(key);
    const trimmedComment = comment?.trim();
    value.push({
      annotationId: annotationId as string,
      assistantMessageId: assistantMessageId as string,
      selectedText,
      startOffset: startOffset as number,
      endOffset: endOffset as number,
      prefixContext,
      suffixContext,
      ...(trimmedComment ? { comment: trimmedComment } : {}),
    });
  }
  if (value.length > limits.maxResponseAnnotations) {
    return { ok: false, issue: { code: "too_many_references", kind: "annotation", limit: limits.maxResponseAnnotations } };
  }
  return { ok: true, value };
}

/** 同一条回复的同一段范围视为同一条引用。 */
export function responseAnnotationKey(annotation: Pick<ResponseAnnotationReference, "assistantMessageId" | "startOffset" | "endOffset">): string {
  return `${annotation.assistantMessageId}:${annotation.startOffset}:${annotation.endOffset}`;
}

export function fileReferenceBlocks(references: readonly FileReference[]): FileReferenceContentBlock[] {
  return references.map((reference) => ({ type: "file-reference", relativePath: reference.relativePath, displayName: reference.displayName }));
}

export function responseExcerptBlocks(annotations: readonly ResponseAnnotationReference[]): ResponseExcerptContentBlock[] {
  return annotations.map((annotation) => ({ type: "response-excerpt", ...annotation }));
}

/** 从 surface content 宽松读取；结构不合法的块直接跳过，保证旧数据与脏数据都不会让投影崩溃。 */
export function readFileReferenceBlocks(content: unknown): FileReference[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block): FileReference[] => {
    if (!isRecord(block) || block.type !== "file-reference") return [];
    if (typeof block.relativePath !== "string" || typeof block.displayName !== "string") return [];
    return [{ relativePath: block.relativePath, displayName: block.displayName }];
  });
}

export function readResponseExcerptBlocks(content: unknown): ResponseAnnotationReference[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block): ResponseAnnotationReference[] => {
    if (!isRecord(block) || block.type !== "response-excerpt") return [];
    const { annotationId, assistantMessageId, selectedText, startOffset, endOffset, prefixContext, suffixContext, comment } = block;
    if (typeof annotationId !== "string" || typeof assistantMessageId !== "string" || typeof selectedText !== "string") return [];
    if (typeof startOffset !== "number" || typeof endOffset !== "number") return [];
    return [{
      annotationId,
      assistantMessageId,
      selectedText,
      startOffset,
      endOffset,
      prefixContext: typeof prefixContext === "string" ? prefixContext : "",
      suffixContext: typeof suffixContext === "string" ? suffixContext : "",
      ...(typeof comment === "string" && comment ? { comment } : {}),
    }];
  });
}

const FILE_REFERENCE_MODEL_NOTE =
  "The user referenced the workspace file(s) above. They have not been read; use read tools if their content is needed.";

/** 模型只看到路径和一句说明；不读文件、不带 UI 文案。 */
export function renderFileReferencesForModel(references: readonly Pick<FileReference, "relativePath">[]): string {
  if (references.length === 0) return "";
  const tags = references.map((reference) => `<workspace_file_reference path=${JSON.stringify(reference.relativePath)} />`);
  return [...tags, FILE_REFERENCE_MODEL_NOTE].join("\n");
}

/** 模型只看到选中原文和用户评论；不暴露 message id、编号或偏移。 */
export function renderResponseExcerptForModel(annotation: Pick<ResponseAnnotationReference, "selectedText" | "comment">): string {
  const lines = [`<quoted_assistant_excerpt>\n${annotation.selectedText}\n</quoted_assistant_excerpt>`];
  if (annotation.comment) lines.push(`<user_comment>${annotation.comment}</user_comment>`);
  return lines.join("\n");
}

export function formatComposerReferenceIssue(issue: ComposerReferenceIssue): string {
  const file = issue.relativePath ? `“${issue.relativePath}”` : "引用的文件";
  switch (issue.code) {
    case "invalid_reference": return issue.kind === "file" ? `${file}不是有效的工作区路径。` : "回复引用的数据无效，请移除后重新添加。";
    case "too_many_references": return issue.kind === "file"
      ? `一次最多引用 ${issue.limit ?? COMPOSER_REFERENCE_LIMITS.maxFileReferences} 个文件。`
      : `一次最多引用 ${issue.limit ?? COMPOSER_REFERENCE_LIMITS.maxResponseAnnotations} 段回复。`;
    case "file_references_not_allowed": return "Chat 会话不能引用工作区文件。";
    case "file_not_found": return `文件${file}不存在或已被移动，请移除后重试。`;
    case "file_outside_workspace": return `${file}不在当前工作区内。`;
    case "not_a_file": return `${file}不是普通文件。`;
    case "annotation_source_missing": return "引用的回复已不在当前会话中，请移除该引用后重试。";
    case "annotation_text_too_long": return `引用的回复片段超过 ${(issue.limit ?? COMPOSER_REFERENCE_LIMITS.maxSelectedTextCodePoints).toLocaleString("en-US")} 个字符。`;
    case "annotation_comment_too_long": return `引用评论超过 ${(issue.limit ?? COMPOSER_REFERENCE_LIMITS.maxCommentCodePoints).toLocaleString("en-US")} 个字符。`;
  }
}

export function codePointLength(value: string): number {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

function basename(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}

function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= COMPOSER_REFERENCE_LIMITS.maxIdLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
