import type { ToolResult } from "../../../internal-tools";
import { analyzeMediaWithKimi } from "../../../llm/kimi-assistants";
import type { ToolExecutorFn } from "../../types";

export const analyzeMediaExecutor: ToolExecutorFn = async (args): Promise<ToolResult> => {
  const source = typeof args.source === "string" ? args.source.trim() : "";
  const mimeType = typeof args.mimeType === "string" ? args.mimeType.trim() : undefined;
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : undefined;

  if (!source) {
    return { success: false, error: "source is required" };
  }

  const result = await analyzeMediaWithKimi({ source, mimeType, prompt });

  return {
    success: true,
    data: [
      `Analyzed at: ${result.analyzedAt}`,
      "",
      result.summary,
    ].join("\n"),
  };
};
