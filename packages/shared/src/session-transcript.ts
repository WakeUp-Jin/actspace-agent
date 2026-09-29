import type { MessageBlock } from "./session";

function formatAttachments(message: Extract<MessageBlock, { kind: "user" }>): string | null {
  const names = message.attachments
    ?.map((attachment) => attachment.name.trim())
    .filter(Boolean);
  if (!names?.length) return null;

  return ["Attachments:", ...names.map((name) => `- ${name}`)].join("\n");
}

function formatReferences(message: Extract<MessageBlock, { kind: "user" }>): string | null {
  const lines: string[] = [];
  if (message.fileReferences?.length) {
    lines.push("Referenced files:", ...message.fileReferences.map((reference) => `- ${reference.relativePath}`));
  }
  // 只写数量：选中原文来自助手回复，transcript 里已有，不重复。
  if (message.responseAnnotations?.length) lines.push(`Quoted replies: ${message.responseAnnotations.length}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * 生成适合粘贴到 issue、文档或新会话的精简 Markdown transcript。
 * Thinking、工具输出和 diff 有体积/隐私风险，因此只保留用户与助手正文。
 */
export function formatSessionTranscript(title: string, messages: MessageBlock[]): string {
  const sections = [`# ${title.trim() || "Untitled session"}`];

  for (const message of messages) {
    if (message.kind === "user") {
      const content = message.content.trim();
      const attachments = formatAttachments(message);
      const references = formatReferences(message);
      if (!content && !attachments && !references) continue;
      sections.push("## User", [content, attachments, references].filter(Boolean).join("\n\n"));
      continue;
    }

    if (message.kind === "assistant") {
      const content = message.content.trim();
      if (!content) continue;
      sections.push("## Assistant", content);
    }
  }

  return `${sections.join("\n\n")}\n`;
}
