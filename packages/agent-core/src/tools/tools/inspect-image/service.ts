import { MessagePriority, getTextContent, type Context } from "../../../messages";
import type { ImageInspectionRuntimeConfig } from "../../types";
import type { InspectedImageInput } from "./image-input";
import { IMAGE_INSPECTION_SYSTEM_PROMPT } from "./prompt";

const IMAGE_INSPECTION_TIMEOUT_MS = 90_000;
const IMAGE_INSPECTION_MAX_TOKENS = 12_000;

export class ImageInspectionServiceError extends Error {
  constructor(
    public readonly code: "aborted" | "timeout" | "provider_error" | "empty_response",
    message: string,
  ) {
    super(message);
    this.name = "ImageInspectionServiceError";
  }
}

export async function inspectImageWithModel(
  image: InspectedImageInput,
  question: string,
  runtime: ImageInspectionRuntimeConfig,
  signal?: AbortSignal,
): Promise<{ text: string; stoppedAtLimit: boolean }> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort("timeout"), IMAGE_INSPECTION_TIMEOUT_MS);
  const onAbort = () => timeoutController.abort("turn_aborted");
  signal?.addEventListener("abort", onAbort, { once: true });

  const context: Context = {
    systemPrompt: IMAGE_INSPECTION_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `Source file: ${image.sourceName}\n\nQuestion: ${question}` },
        { type: "image", data: image.data, mimeType: image.mimeType },
      ],
      timestamp: Date.now(),
      source: "tool:inspect_image",
      priority: MessagePriority.HIGH,
    }],
  };

  try {
    const response = await runtime.llm.complete(context, {
      signal: timeoutController.signal,
      maxTokens: IMAGE_INSPECTION_MAX_TOKENS,
      thinkingEnabled: true,
      ...(runtime.provider === "openrouter" && { reasoningEffort: "medium" as const }),
    });
    if (response.stopReason === "aborted") {
      const code = signal?.aborted ? "aborted" : "timeout";
      throw new ImageInspectionServiceError(code, code === "aborted" ? "图片分析已取消。" : "图片分析超时。");
    }
    if (response.stopReason === "error") {
      throw new ImageInspectionServiceError("provider_error", providerErrorMessage(response.errorKind));
    }
    const text = getTextContent(response).trim();
    if (!text) throw new ImageInspectionServiceError("empty_response", "视觉模型没有返回可用的文字结果。");
    return { text, stoppedAtLimit: response.stopReason === "length" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function providerErrorMessage(kind?: string): string {
  if (kind === "auth") return "图片分析服务认证失败，请检查所选 Provider 凭据。";
  if (kind === "rate_limit") return "图片分析服务请求过于频繁，请稍后再试。";
  if (kind === "insufficient_balance") return "图片分析服务余额不足。";
  if (kind === "invalid_request") return "图片分析服务拒绝了当前图片或请求参数。";
  return "图片分析服务调用失败，请稍后再试。";
}
