import type { ModelApi } from "./model-config";

// shared 只带 ES2022 lib；URL 在 Node 和浏览器里都是全局对象，这里只声明用到的字段。
declare const URL: new (input: string) => {
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  readonly origin: string;
  readonly pathname: string;
};

export type CustomConnectionAddressResult =
  | {
      readonly ok: true;
      readonly baseUrl: string;
      readonly requestUrl: string;
      readonly strippedSuffixes: readonly string[];
      /** 地址末尾带了能说明协议的接口路径时给出；和传入协议相同也会给出。 */
      readonly inferredProtocol: ModelApi | null;
    }
  | { readonly ok: false; readonly reason: "empty" | "scheme" | "invalid" | "credentials" };

// 用户常把完整接口地址粘进来；按顺序剥掉最后一段接口路径，并据此推断协议。
const ENDPOINT_SUFFIXES: readonly { readonly suffix: string; readonly protocol: ModelApi }[] = [
  { suffix: "/chat/completions", protocol: "openai-completions" },
  { suffix: "/responses", protocol: "openai-responses" },
  { suffix: "/v1/messages", protocol: "anthropic-messages" },
];

/**
 * 渲染层预览和主进程保存共用的地址规范化。
 * Anthropic 协议保存站点根地址（请求时再拼 /v1/messages）；OpenAI 协议保存到 /v1 这一层。
 */
export function normalizeCustomConnectionAddress(raw: string, protocol: ModelApi): CustomConnectionAddressResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  let parsed: InstanceType<typeof URL>;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (parsed.username || parsed.password) return { ok: false, reason: "credentials" };

  let path = parsed.pathname.replace(/\/+$/, "");
  const strippedSuffixes: string[] = [];
  let inferredProtocol: ModelApi | null = null;
  const endpoint = ENDPOINT_SUFFIXES.find(({ suffix }) => path.toLowerCase().endsWith(suffix));
  if (endpoint) {
    path = path.slice(0, -endpoint.suffix.length).replace(/\/+$/, "");
    strippedSuffixes.push(endpoint.suffix);
    inferredProtocol = endpoint.protocol;
  }
  const effectiveProtocol = inferredProtocol ?? protocol;
  if (effectiveProtocol === "anthropic-messages" && path.toLowerCase().endsWith("/v1")) {
    path = path.slice(0, -"/v1".length).replace(/\/+$/, "");
    strippedSuffixes.push("/v1");
  }
  const baseUrl = `${parsed.origin}${path}`;
  return { ok: true, baseUrl, requestUrl: customConnectionRequestUrl(baseUrl, effectiveProtocol), strippedSuffixes, inferredProtocol };
}

/** 连接测试和模型调用实际请求的接口地址。 */
export function customConnectionRequestUrl(baseUrl: string, protocol: ModelApi): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (protocol === "anthropic-messages") return `${base}/v1/messages`;
  return protocol === "openai-responses" ? `${base}/responses` : `${base}/chat/completions`;
}
