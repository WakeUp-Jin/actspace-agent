import type { ToolResult } from "../../../internal-tools";
import { searchWithKimi } from "../../../llm/kimi-assistants";
import type { ToolExecutorFn } from "../../types";

export const webSearchExecutor: ToolExecutorFn = async (args): Promise<ToolResult> => {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const url = typeof args.url === "string" ? args.url.trim() : "";
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";

  if (!query && !url) {
    return { success: false, error: "Either query or url is required" };
  }

  // 构造搜索内容：url 模式 → 让 Kimi 读取页面；query 模式 → 直接搜索
  let searchContent: string;
  if (url) {
    searchContent = prompt
      ? `请读取以下网页内容并${prompt}：${url}`
      : `请读取以下网页的内容并总结要点：${url}`;
  } else {
    searchContent = prompt ? `${query}\n\n${prompt}` : query;
  }

  try {
    const result = await searchWithKimi(searchContent);

    if (!result.answer || result.answer.startsWith("No search results found")) {
      return {
        success: false,
        error: url
          ? `Failed to read content from ${url}. The page may require authentication or be unavailable.`
          : `Web search returned no results for "${query}". The search service may be temporarily unavailable.`,
      };
    }

    const header = url
      ? `URL: ${url}\nFetched at: ${result.searchedAt}`
      : `Query: ${result.query}\nSearched at: ${result.searchedAt}`;

    return {
      success: true,
      data: [header, "", result.answer].join("\n"),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Web search failed: ${msg}` };
  }
};
