import type { ToolResult } from "../../../internal-tools";
import { searchWithKimi } from "../../../llm/kimi-assistants";
import type { ToolExecutorFn } from "../../types";

export const webSearchExecutor: ToolExecutorFn = async (args): Promise<ToolResult> => {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    return { success: false, error: "query is required" };
  }

  const result = await searchWithKimi(query);

  return {
    success: true,
    data: [
      `Query: ${result.query}`,
      `Searched at: ${result.searchedAt}`,
      "",
      result.answer,
    ].join("\n"),
  };
};
