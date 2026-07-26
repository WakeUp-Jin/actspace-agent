import type { MessageBlock } from "./session";

function formatAttachments(message: Extract<MessageBlock, { kind: "user" }>): string | null {
  const names = message.attachments
    ?.map((attachment) => attachment.name.trim())
    .filter(Boolean);
  if (!names?.length) return null;

  return ["Attachments:", ...names.map((name) => `- ${name}`)].join("\n");
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
      if (!content && !attachments) continue;
      sections.push("## User", [content, attachments].filter(Boolean).join("\n\n"));
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
