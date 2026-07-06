/**
 * web_search provider 适配层
 *
 * 每个 provider 是一个薄适配器：query → 结构化结果列表（title/url/snippet/date）。
 * 不做任何 LLM 加工——搜索结果原样交给主模型，需要精读时由模型调用 web_fetch。
 *
 * 双通道设计（见 docs/design-docs/agent-web-tools.md）：
 * - 国内通道：智谱（有 key 就参与，中文内容覆盖）
 * - 国际通道：Tavily → TinyFish → Exa，按优先级取第一个可用的；
 *   命中配额/认证类错误时同一次调用内自动降级到下一家
 * 两通道并行执行，结果合并后按来源分组返回。
 */

import { env } from "../../../env";

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export type WebSearchProviderName = "zhipu" | "tavily" | "tinyfish" | "exa";

export interface WebSearchProvider {
  /** provider 标识，会展示在工具输出头部 */
  name: WebSearchProviderName;
  search(query: string, maxResults: number): Promise<WebSearchResultItem[]>;
}

/** provider → 需要用户配置的 env key 名（错误提示用） */
export const PROVIDER_ENV_KEYS: Record<WebSearchProviderName, string> = {
  zhipu: "ZHIPU_API_KEY",
  tavily: "TAVILY_API_KEY",
  tinyfish: "TINYFISH_API_KEY",
  exa: "EXA_API_KEY",
};

const SEARCH_TIMEOUT_MS = 15_000;
/** 单条结果 snippet 上限，避免搜索结果整体过长 */
const MAX_SNIPPET_CHARS = 800;

/**
 * 配额耗尽 / 认证失败类错误：国际通道据此降级到下一家 provider。
 * Tavily 用 432（plan limit）/ 433（PAYG limit）表示额度耗尽；429 是限速。
 */
export class ProviderUnavailableError extends Error {
  constructor(
    public readonly provider: WebSearchProviderName,
    public readonly reason: "quota" | "auth" | "rate_limit",
    message: string,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

function clampSnippet(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_SNIPPET_CHARS
    ? `${normalized.slice(0, MAX_SNIPPET_CHARS)}…`
    : normalized;
}

function classifyHttpFailure(
  provider: WebSearchProviderName,
  status: number,
  detail: string,
): Error {
  const message = `HTTP ${status}${detail ? `: ${detail}` : ""}`;
  if (status === 401 || status === 403) {
    return new ProviderUnavailableError(provider, "auth", message);
  }
  if (status === 432 || status === 433 || status === 402) {
    return new ProviderUnavailableError(provider, "quota", message);
  }
  if (status === 429) {
    return new ProviderUnavailableError(provider, "rate_limit", message);
  }
  return new Error(message);
}

async function requestJson(
  provider: WebSearchProviderName,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw classifyHttpFailure(provider, response.status, detail);
  }
  return response.json();
}

function postJson(
  provider: WebSearchProviderName,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  return requestJson(provider, url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ─── 智谱（国内通道） ───
// https://docs.bigmodel.cn/cn/guide/tools/web-search
// search_pro：多引擎协作版（¥0.03/次），比 search_std 空结果率低；按次计费不耗 token。

interface ZhipuResponse {
  search_result?: Array<{
    title?: string;
    link?: string;
    content?: string;
    publish_date?: string;
  }>;
}

export function createZhipuProvider(apiKey: string): WebSearchProvider {
  return {
    name: "zhipu",
    async search(query, maxResults) {
      const data = (await postJson(
        "zhipu",
        "https://open.bigmodel.cn/api/paas/v4/web_search",
        { Authorization: `Bearer ${apiKey}` },
        {
          search_engine: "search_pro",
          search_query: query,
          count: maxResults,
        },
      )) as ZhipuResponse;

      return (data.search_result ?? [])
        .filter((r) => typeof r.link === "string" && r.link.length > 0)
        .map((r) => ({
          title: r.title?.trim() || r.link!,
          url: r.link!,
          snippet: clampSnippet(r.content ?? ""),
          publishedDate: r.publish_date || undefined,
        }));
    },
  };
}

// ─── Tavily（国际通道优先级 1） ───
// https://docs.tavily.com/documentation/api-reference/endpoint/search

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    published_date?: string;
  }>;
}

export function createTavilyProvider(apiKey: string): WebSearchProvider {
  return {
    name: "tavily",
    async search(query, maxResults) {
      const data = (await postJson(
        "tavily",
        "https://api.tavily.com/search",
        { Authorization: `Bearer ${apiKey}` },
        {
          query,
          max_results: maxResults,
          search_depth: "basic",
          include_answer: false,
          include_raw_content: false,
        },
      )) as TavilyResponse;

      return (data.results ?? [])
        .filter((r) => typeof r.url === "string" && r.url.length > 0)
        .map((r) => ({
          title: r.title?.trim() || r.url!,
          url: r.url!,
          snippet: clampSnippet(r.content ?? ""),
          publishedDate: r.published_date || undefined,
        }));
    },
  };
}

// ─── TinyFish（国际通道优先级 2；搜索接口目前免费，按套餐限速） ───
// https://docs.tinyfish.ai/search-api

interface TinyFishResponse {
  results?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
  }>;
}

export function createTinyFishProvider(apiKey: string): WebSearchProvider {
  return {
    name: "tinyfish",
    async search(query, maxResults) {
      const url = new URL("https://api.search.tinyfish.ai");
      url.searchParams.set("query", query);
      const data = (await requestJson("tinyfish", url.toString(), {
        method: "GET",
        headers: { "X-API-Key": apiKey },
      })) as TinyFishResponse;

      return (data.results ?? [])
        .filter((r) => typeof r.url === "string" && r.url.length > 0)
        .slice(0, maxResults)
        .map((r) => ({
          title: r.title?.trim() || r.url!,
          url: r.url!,
          snippet: clampSnippet(r.snippet ?? ""),
        }));
    },
  };
}

// ─── Exa（国际通道优先级 3） ───
// https://docs.exa.ai/reference/search

interface ExaResponse {
  results?: Array<{
    title?: string | null;
    url?: string;
    publishedDate?: string | null;
    text?: string;
  }>;
}

export function createExaProvider(apiKey: string): WebSearchProvider {
  return {
    name: "exa",
    async search(query, maxResults) {
      const data = (await postJson(
        "exa",
        "https://api.exa.ai/search",
        { "x-api-key": apiKey },
        {
          query,
          numResults: maxResults,
          type: "auto",
          contents: { text: { maxCharacters: MAX_SNIPPET_CHARS } },
        },
      )) as ExaResponse;

      return (data.results ?? [])
        .filter((r) => typeof r.url === "string" && r.url.length > 0)
        .map((r) => ({
          title: r.title?.trim() || r.url!,
          url: r.url!,
          snippet: clampSnippet(r.text ?? ""),
          publishedDate: r.publishedDate || undefined,
        }));
    },
  };
}

// ─── 通道解析 ───

export interface SearchLanes {
  /** 国内通道：智谱；缺 key 时为 undefined */
  domestic?: WebSearchProvider;
  /** 国际通道候选，按优先级排序（Tavily → TinyFish → Exa）；可为空数组 */
  international: WebSearchProvider[];
}

/** 按 env 中已配置的 key 解析两条搜索通道。 */
export function resolveSearchLanes(): SearchLanes {
  const international: WebSearchProvider[] = [];
  if (env.TAVILY_API_KEY) international.push(createTavilyProvider(env.TAVILY_API_KEY));
  if (env.TINYFISH_API_KEY) international.push(createTinyFishProvider(env.TINYFISH_API_KEY));
  if (env.EXA_API_KEY) international.push(createExaProvider(env.EXA_API_KEY));
  return {
    domestic: env.ZHIPU_API_KEY ? createZhipuProvider(env.ZHIPU_API_KEY) : undefined,
    international,
  };
}
