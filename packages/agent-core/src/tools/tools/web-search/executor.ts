/**
 * web_search — 关键词搜索（外部搜索 API，双通道并行）
 *
 * 一次调用并行打两条通道：国内（智谱）+ 国际（Tavily → TinyFish → Exa failover）。
 * 结果按来源分组合并、URL 去重；单通道失败不影响另一通道（部分成功也返回）。
 * 输出以国际通道为主参考（排前、去重优先保留），智谱作为补充——中文独有内容
 * 靠它兜底，但重复内容以英文来源为准。
 * 不经过任何 LLM 中间层；精读单个页面用 web_fetch。
 * 设计事实来源：docs/design-docs/agent-web-tools.md
 */

import type { ToolResult } from "../../../internal-tools";
import type { ToolExecutorFn } from "../../types";
import {
  PROVIDER_ENV_KEYS,
  ProviderUnavailableError,
  resolveSearchLanes,
  type WebSearchProvider,
  type WebSearchProviderName,
  type WebSearchResultItem,
} from "./providers";

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 10;

/**
 * 缺搜索 key 的兜底错误。正常情况下 exposure 门控（hasWebSearchKey）已保证
 * 没有 key 时工具不会注册，这里防御性兜底（例如手动构造 ToolManager 时漏传门控）。
 */
const MISSING_SEARCH_KEY_ERROR = [
  "Web search is unavailable: no search provider API key is configured.",
  "Web search in actspace uses external search APIs. Tell the user to configure at least one search provider key in Settings (Zhipu / Tavily / TinyFish / Exa) or set ZHIPU_API_KEY / TAVILY_API_KEY / TINYFISH_API_KEY / EXA_API_KEY in the environment, then restart the app.",
  "Do not call web_search again in this turn. Answer from your existing knowledge and clearly state which parts you could not verify online.",
].join("\n");

interface LaneOutcome {
  provider?: WebSearchProvider["name"];
  results: WebSearchResultItem[];
  /** 通道整体失败时的原因（所有候选都失败/超时） */
  failure?: string;
}

/**
 * 国际通道：按优先级依次尝试候选 provider。
 * 配额耗尽 / 认证失败 / 限速 → 降级下一家；其余错误（网络/超时）也降级，
 * 但保留首个错误信息用于整体失败时的报错。
 */
async function runInternationalLane(
  candidates: WebSearchProvider[],
  query: string,
  maxResults: number,
): Promise<LaneOutcome> {
  const failures: string[] = [];
  for (const provider of candidates) {
    try {
      const results = await provider.search(query, maxResults);
      return { provider: provider.name, results };
    } catch (err) {
      failures.push(describeProviderError(provider.name, err));
    }
  }
  return { results: [], failure: failures.join("; ") || undefined };
}

async function runDomesticLane(
  provider: WebSearchProvider,
  query: string,
  maxResults: number,
): Promise<LaneOutcome> {
  try {
    const results = await provider.search(query, maxResults);
    return { provider: provider.name, results };
  } catch (err) {
    return { results: [], failure: describeProviderError(provider.name, err) };
  }
}

function describeProviderError(name: WebSearchProvider["name"], err: unknown): string {
  if (err instanceof ProviderUnavailableError) {
    const hint =
      err.reason === "auth"
        ? ` (the configured ${PROVIDER_ENV_KEYS[name]} may be invalid or expired)`
        : err.reason === "quota"
          ? " (quota exhausted)"
          : " (rate limited)";
    return `${name}: ${err.message}${hint}`;
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return `${name}: timed out`;
  }
  return `${name}: ${err instanceof Error ? err.message : String(err)}`;
}

/** 各 provider 的渠道特性说明，随分组标题输出，帮助模型判断参考程度。 */
const PROVIDER_TRAITS: Record<WebSearchProviderName, string> = {
  tavily: "LLM-optimized search, high-quality international sources",
  tinyfish: "general web search, international sources",
  exa: "semantic search, strong for conceptual queries, weak Chinese coverage",
  zhipu: "best Chinese-content coverage; verify source authority before citing",
};

/**
 * 合并两通道结果，输出按来源分组。
 *
 * 国际通道为主参考：排在最前，跨通道 URL 去重时优先保留国际线的条目
 * （lanes 数组顺序即遍历顺序，调用方保证国际线在前）。
 * 两通道都有结果时额外标注 primary / supplementary，单通道时不标，避免误导。
 */
function formatMergedResults(
  query: string,
  lanes: Array<{ label: string; outcome: LaneOutcome }>,
): string {
  const seenUrls = new Set<string>();
  const sections: string[] = [];
  const providerNames: string[] = [];
  const bothLanesHaveResults = lanes.every(
    ({ outcome }) => outcome.provider && outcome.results.length > 0,
  );

  for (const { label, outcome } of lanes) {
    if (!outcome.provider || outcome.results.length === 0) continue;
    providerNames.push(outcome.provider);

    const items = outcome.results.filter((item) => {
      const key = item.url.replace(/\/+$/, "");
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });
    if (items.length === 0) continue;

    const body = items.map((item, index) => {
      const lines = [`${index + 1}. ${item.title}`, `   URL: ${item.url}`];
      if (item.publishedDate) lines.push(`   Published: ${item.publishedDate}`);
      if (item.snippet) lines.push(`   ${item.snippet}`);
      return lines.join("\n");
    });
    const role = bothLanesHaveResults
      ? label === "international"
        ? " — primary"
        : " — supplementary"
      : "";
    const header = `## ${outcome.provider} (${label}${role}; ${PROVIDER_TRAITS[outcome.provider]})`;
    sections.push([header, ...body].join("\n"));
  }

  const notes = lanes
    .filter(({ outcome }) => outcome.failure)
    .map(({ label, outcome }) => `Note: ${label} lane failed — ${outcome.failure}`);

  const header = [
    `Query: ${query}`,
    `Providers: ${providerNames.join(", ")}`,
    `Searched at: ${new Date().toISOString()}`,
  ];
  const footer = "Tip: call web_fetch with a result URL to read the full page content.";
  return [...header, "", ...sections, ...(notes.length ? ["", ...notes] : []), "", footer].join("\n");
}

export const webSearchExecutor: ToolExecutorFn = async (args): Promise<ToolResult> => {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    return { success: false, error: "query is required" };
  }

  const rawMax = typeof args.max_results === "number" ? Math.floor(args.max_results) : DEFAULT_MAX_RESULTS;
  const maxResults = Math.min(Math.max(rawMax, 1), MAX_RESULTS_LIMIT);

  const { domestic, international } = resolveSearchLanes();
  if (!domestic && international.length === 0) {
    return { success: false, error: MISSING_SEARCH_KEY_ERROR };
  }

  // 两条通道并行；单通道内部消化自己的失败（LaneOutcome.failure），不 reject
  const [domesticOutcome, internationalOutcome] = await Promise.all([
    domestic
      ? runDomesticLane(domestic, query, maxResults)
      : Promise.resolve<LaneOutcome>({ results: [] }),
    international.length > 0
      ? runInternationalLane(international, query, maxResults)
      : Promise.resolve<LaneOutcome>({ results: [] }),
  ]);

  // 国际线在前：分组排序与去重优先级都以国际结果为主参考
  const lanes = [
    { label: "international", outcome: internationalOutcome },
    { label: "domestic", outcome: domesticOutcome },
  ];

  const totalResults = domesticOutcome.results.length + internationalOutcome.results.length;
  if (totalResults === 0) {
    const failures = lanes
      .filter(({ outcome }) => outcome.failure)
      .map(({ label, outcome }) => `${label}: ${outcome.failure}`);
    if (failures.length > 0) {
      return { success: false, error: `Web search failed. ${failures.join(" | ")}` };
    }
    return {
      success: false,
      error: `Web search returned no results for "${query}". Try different or broader keywords.`,
    };
  }

  return { success: true, data: formatMergedResults(query, lanes) };
};
