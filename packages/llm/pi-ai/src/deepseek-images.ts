import type { LlmMessage } from "@actspace/llm-service";

export function validateDeepSeekImageMessages(messages: readonly LlmMessage[], supportsImages: boolean): void {
  let count = 0;
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    for (const block of message.content) {
      if (block.type !== "image") continue;
      if (!supportsImages) throw new Error("当前 DeepSeek 模型不支持图片，请选择 V4.1 Flash。");
      if (message.role !== "user") throw new Error("DeepSeek Chat Completions 图片只能出现在 user 消息中。");
      count += 1;
    }
  }
  if (count > 600) throw new Error("DeepSeek 单次请求最多支持 600 张图片。");
}

/** Validate actual file signatures rather than trusting an extension or declared MIME type. */
export function validateDeepSeekImage(data: Uint8Array): string {
  if (data.byteLength > 32 * 1024 * 1024) throw new Error("DeepSeek 内联图片不能超过 32 MiB。");
  const bytes = Buffer.from(data);
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  throw new Error("DeepSeek 图片仅支持 JPEG、PNG、GIF、WebP。");
}

export function validateDeepSeekPayload(payload: unknown): void {
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 48 * 1024 * 1024) {
    throw new Error("DeepSeek 请求体超过 48 MiB，请减少图片数量或压缩图片。");
  }
}
