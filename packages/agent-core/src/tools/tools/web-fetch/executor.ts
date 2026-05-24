import type { ToolResult } from "../../../internal-tools";
import { fetchAndSummarizeWithKimi } from "../../../llm/kimi-assistants/client";
import type { ToolExecutorFn } from "../../types";

export const webFetchExecutor: ToolExecutorFn = async (args): Promise<ToolResult> => {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : undefined;

  if (!url) {
    return { success: false, error: "url is required" };
  }

  const result = await fetchAndSummarizeWithKimi(url, prompt);

  return {
    success: true,
    data: [
      `URL: ${result.url}`,
      result.title ? `Title: ${result.title}` : "",
      `Fetched at: ${result.fetchedAt}`,
      "",
      result.summary,
    ].filter(Boolean).join("\n"),
  };
};
