/**
 * web_fetch — 本地确定性网页抓取
 *
 * 纯 HTTP fetch → charset 探测 → HTML 清洗 → Markdown，不经过任何 LLM 中间层。
 * 实现参考 claudecode（getURLMarkdownContent）、opencode（webfetch）与
 * firecrawl 的 fetch 引擎（charset 探测 / 非正文清洗）。
 *
 * 设计事实来源：docs/design-docs/agent-web-tools.md
 */

import type { ToolResult } from "../../../internal-tools";
import type { ToolExecutorFn } from "../../types";
import { extractHtmlTitle, htmlToMarkdown } from "./html-to-markdown";

const MAX_URL_LENGTH = 2000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT_MS = 30_000;
/** 返回给模型的 Markdown 上限；超出走 head 截断 + 提示 */
const MAX_MARKDOWN_CHARS = 50_000;

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 32;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const HONEST_UA = "actspace-agent";

const ACCEPT_HEADER =
  "text/markdown;q=1.0, text/html;q=0.9, text/plain;q=0.8, application/json;q=0.7, */*;q=0.1";

type CacheEntry = { expiresAt: number; data: string };
const responseCache = new Map<string, CacheEntry>();

/** 测试用：清空 web_fetch 缓存 */
export function clearWebFetchCache(): void {
  responseCache.clear();
}

function cacheGet(url: string): string | undefined {
  const entry = responseCache.get(url);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(url);
    return undefined;
  }
  return entry.data;
}

function cacheSet(url: string, data: string): void {
  if (responseCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) responseCache.delete(oldestKey);
  }
  responseCache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, data });
}

function validateUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  if (raw.length > MAX_URL_LENGTH) {
    return { ok: false, error: `URL is too long (max ${MAX_URL_LENGTH} characters)` };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: `Invalid URL: ${raw}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "URL must start with http:// or https://" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "URLs with embedded credentials are not allowed" };
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    return { ok: false, error: `Hostname "${parsed.hostname}" is not publicly resolvable` };
  }
  return { ok: true, url: parsed };
}

/**
 * charset 探测：Content-Type header → HTML <meta charset> → utf-8。
 * 对中文老站点（GBK/GB2312）尤其重要，参考 firecrawl fetch 引擎。
 */
function decodeBody(buf: Buffer, contentType: string): string {
  const utf8Text = buf.toString("utf8");
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1]?.trim();
  const metaCharset = utf8Text.match(/<meta\b[^>]*charset\s*=\s*["']?([^"'\s/>]+)/i)?.[1]?.trim();

  for (const charset of [headerCharset, metaCharset]) {
    if (!charset || /^utf-?8$/i.test(charset)) continue;
    try {
      return new TextDecoder(charset).decode(buf);
    } catch {
      // 未知/不支持的编码：尝试下一个来源
    }
  }
  return utf8Text;
}

function isTextLikeContentType(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime === ""
  );
}

async function fetchWithLimits(url: string, userAgent: string): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
    headers: {
      "User-Agent": userAgent,
      Accept: ACCEPT_HEADER,
      "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });
}

/**
 * 抓取策略：
 * 1. http URL 先升级为 https 尝试；网络层失败再回退原 http（参考 claudecode 的升级策略）
 * 2. 被 Cloudflare 403 challenge 拦截时换诚实 UA 重试一次（参考 opencode：
 *    TLS 指纹与浏览器 UA 不匹配时，伪装反而更容易被拦）
 */
async function fetchUrl(original: URL): Promise<Response> {
  const candidates: string[] = [];
  if (original.protocol === "http:") {
    const upgraded = new URL(original.toString());
    upgraded.protocol = "https:";
    candidates.push(upgraded.toString());
  }
  candidates.push(original.toString());

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const response = await fetchWithLimits(candidate, BROWSER_UA);
      if (response.status === 403 && response.headers.get("cf-mitigated") === "challenge") {
        return await fetchWithLimits(candidate, HONEST_UA);
      }
      return response;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export const webFetchExecutor: ToolExecutorFn = async (args): Promise<ToolResult> => {
  const rawUrl = typeof args.url === "string" ? args.url.trim() : "";
  if (!rawUrl) {
    return { success: false, error: "url is required" };
  }

  const validated = validateUrl(rawUrl);
  if ("error" in validated) {
    return { success: false, error: validated.error };
  }

  const cached = cacheGet(rawUrl);
  if (cached !== undefined) {
    return { success: true, data: cached };
  }

  let response: Response;
  try {
    response = await fetchUrl(validated.url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      success: false,
      error: timedOut
        ? `Fetching ${rawUrl} timed out after ${FETCH_TIMEOUT_MS / 1000}s. The site may be slow or unreachable.`
        : `Failed to fetch ${rawUrl}: ${msg}`,
    };
  }

  if (!response.ok) {
    return {
      success: false,
      error: `Fetching ${rawUrl} returned HTTP ${response.status} ${response.statusText}. The page may not exist, require authentication, or block automated access.`,
    };
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    return {
      success: false,
      error: `Response too large (${declaredLength} bytes, limit ${MAX_RESPONSE_BYTES}).`,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_RESPONSE_BYTES) {
    return {
      success: false,
      error: `Response too large (${arrayBuffer.byteLength} bytes, limit ${MAX_RESPONSE_BYTES}).`,
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const mime = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (!isTextLikeContentType(mime)) {
    return {
      success: false,
      error: `Unsupported content type "${mime || "unknown"}" for ${rawUrl}. web_fetch only handles text-based content (HTML, Markdown, plain text, JSON, XML).`,
    };
  }

  const body = decodeBody(Buffer.from(arrayBuffer), contentType);

  let content: string;
  let title: string | undefined;
  if (mime.includes("html")) {
    title = extractHtmlTitle(body);
    try {
      content = htmlToMarkdown(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to convert HTML to Markdown for ${rawUrl}: ${msg}` };
    }
  } else {
    content = body.trim();
  }

  if (!content) {
    return {
      success: false,
      error: `Fetched ${rawUrl} but the page has no readable text content (it may be rendered entirely by JavaScript).`,
    };
  }

  let truncationNote = "";
  if (content.length > MAX_MARKDOWN_CHARS) {
    truncationNote = `\n\n[Content truncated: showing first ${MAX_MARKDOWN_CHARS} of ${content.length} characters]`;
    content = content.slice(0, MAX_MARKDOWN_CHARS);
  }

  const header = [
    `URL: ${response.url || rawUrl}`,
    title ? `Title: ${title}` : undefined,
    `Content-Type: ${mime || "unknown"}`,
    `Fetched at: ${new Date().toISOString()}`,
  ].filter(Boolean);

  const data = [...header, "", content].join("\n") + truncationNote;
  cacheSet(rawUrl, data);
  return { success: true, data, structured: { resultUrls: [rawUrl] } };
};
