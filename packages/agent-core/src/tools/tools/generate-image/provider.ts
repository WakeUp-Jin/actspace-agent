import type { ImageGenerationRuntimeConfig } from "../../types";

const REQUEST_TIMEOUT_MS = 180_000;
const MAX_RESPONSE_CHARS = 140 * 1024 * 1024;

export type GeneratedImagePayload =
  | { kind: "url"; value: string }
  | { kind: "base64"; value: string };

export class ImageGenerationProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "rate_limit" | "invalid_request" | "server" | "timeout" | "network" | "invalid_response" | "aborted",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ImageGenerationProviderError";
  }
}

export async function requestImageGeneration(
  config: ImageGenerationRuntimeConfig,
  input: { prompt: string; size: string; n: number },
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<GeneratedImagePayload[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const { signal, cleanup } = combinedAbortSignal(options.signal, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        prompt: input.prompt,
        size: input.size,
        n: input.n,
      }),
      signal,
    });

    if (!response.ok) throw providerHttpError(response.status);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_CHARS) {
      throw new ImageGenerationProviderError("图片服务返回内容过大。", "invalid_response");
    }
    const text = await readResponseText(response, MAX_RESPONSE_CHARS);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ImageGenerationProviderError("图片服务返回了无法解析的响应。", "invalid_response");
    }
    return parseImagePayloads(parsed);
  } catch (error) {
    if (error instanceof ImageGenerationProviderError) throw error;
    if (options.signal?.aborted) {
      throw new ImageGenerationProviderError("图片生成已取消。", "aborted");
    }
    if (signal.aborted) {
      throw new ImageGenerationProviderError("图片生成请求超时。", "timeout");
    }
    throw new ImageGenerationProviderError("无法连接图片生成服务。", "network");
  } finally {
    cleanup();
  }
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ImageGenerationProviderError("图片服务返回内容过大。", "invalid_response");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function providerHttpError(status: number): ImageGenerationProviderError {
  if (status === 401 || status === 403) return new ImageGenerationProviderError("图片生成服务认证失败。", "auth", status);
  if (status === 429) return new ImageGenerationProviderError("图片生成服务请求过于频繁。", "rate_limit", status);
  if (status >= 400 && status < 500) return new ImageGenerationProviderError("图片生成参数被服务拒绝。", "invalid_request", status);
  return new ImageGenerationProviderError("图片生成服务暂时不可用。", "server", status);
}

function parseImagePayloads(value: unknown): GeneratedImagePayload[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new ImageGenerationProviderError("图片服务响应缺少 data 数组。", "invalid_response");
  }
  const payloads: GeneratedImagePayload[] = [];
  for (const item of value.data) {
    if (!isRecord(item)) continue;
    if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
      payloads.push({ kind: "base64", value: item.b64_json });
    } else if (typeof item.url === "string" && item.url.length > 0) {
      payloads.push({ kind: "url", value: item.url });
    }
  }
  if (payloads.length === 0) {
    throw new ImageGenerationProviderError("图片服务没有返回可用图片。", "invalid_response");
  }
  return payloads;
}

function combinedAbortSignal(external: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  external?.addEventListener("abort", onAbort, { once: true });
  if (external?.aborted) controller.abort();
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
