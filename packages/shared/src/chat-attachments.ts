/** Expected attachment admission failures; safe to send across the Desktop IPC boundary. */
export type ChatAttachmentIssue = {
  code: "unsupported_format" | "not_file" | "unreadable" | "invalid_utf8" | "binary_content" | "text_too_large" | "image_too_large" | "total_text_too_large";
  fileName?: string;
  attachmentId?: string;
  limit?: number;
  /** Decoded lengths keyed by composer attachment id, for recomputing a total error after removal. */
  textCharacterCounts?: Record<string, number>;
};

export function formatChatAttachmentIssue(issue: ChatAttachmentIssue): string {
  const file = issue.fileName ? `“${issue.fileName}”` : "附件";
  switch (issue.code) {
    case "unsupported_format": return `${file}的格式暂不支持。请使用 PNG、JPEG、WebP、GIF、TXT、Markdown、JSON 或 CSV；文档可转换为 TXT 或 Markdown 后添加。`;
    case "not_file": return `${file}不是普通文件，请选择文件后重新添加。`;
    case "unreadable": return `无法读取${file}，请重新选择该文件。`;
    case "invalid_utf8": return `${file}不是 UTF-8 文本，请另存为 UTF-8 后重新添加。`;
    case "binary_content": return `${file}包含非文本内容，无法作为文本附件发送。`;
    case "text_too_large": return `${file}超过 1 MiB，请缩小文件后重试。`;
    case "image_too_large": return `${file}超过 20 MiB，请压缩图片后重试。`;
    case "total_text_too_large": return `本次文本附件合计超过 ${(issue.limit ?? 256_000).toLocaleString("en-US")} 个字符，请减少附件或拆分发送。`;
  }
}

/** No turn has been enqueued. The renderer must restore the entire draft. */
export type RunAgentPreparationFailure = {
  status: "rejected";
  sessionId: string;
  agentRunId: string;
  error: ChatAttachmentIssue;
};
