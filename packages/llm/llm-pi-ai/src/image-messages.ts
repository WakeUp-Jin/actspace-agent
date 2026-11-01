import type { LlmContentBlock, LlmMessage } from "@actspace/llm-service";

/** Keep storage references intact; only adapt message roles at the wire boundary. */
export function prepareImageMessages(messages: readonly LlmMessage[], supportsImages: boolean, toolImagesInResult: boolean): readonly LlmMessage[] {
  const output: LlmMessage[] = [];
  let observations: LlmContentBlock[] = [];
  const flush = () => {
    if (observations.length) output.push({ role: "user", content: observations });
    observations = [];
  };
  for (const message of messages) {
    // All results for a parallel tool-call batch must precede the visual observation.
    if (message.role !== "tool") flush();
    if (typeof message.content === "string") { output.push(message); continue; }
    const content: LlmContentBlock[] = [];
    for (const block of message.content) {
      if (block.type !== "image") { content.push(block); continue; }
      if (!supportsImages) {
        content.push({ type: "text", text: `[Image ${block.artifactId} (${block.mimeType}); this model cannot see it. Use inspect_image if available or select an image-capable model.]` });
      } else if (message.role === "tool" && !toolImagesInResult) {
        content.push({ type: "text", text: `[Image ${block.artifactId}; visual observation follows the tool results.]` });
        observations.push({ type: "text", text: `Visual result of tool call ${message.callId ?? "unknown"}:` }, block);
      } else content.push(block);
    }
    output.push({ ...message, content });
  }
  flush();
  return output;
}
