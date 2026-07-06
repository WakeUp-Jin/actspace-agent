import type { ToolDefinitionSpec } from "../../types";

export const webSearchDefinition: ToolDefinitionSpec = {
  name: "web_search",
  description:
    "Search the public web by keywords and get a list of results (title, URL, snippet, date). " +
    "Use this to find current information, documentation, news, or pages you do not have a URL for. " +
    "The results are raw search hits — to read the full content of a promising result, " +
    "call web_fetch with its URL. " +
    "Do not use for local workspace files (use read_file/grep/glob instead).",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search keywords. Be specific; include version numbers or dates when relevant.",
      },
      max_results: {
        type: "number",
        description: "Maximum number of results to return (1-10). Defaults to 5.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "search",
  previewKind: "web_search",
  requiresKey: "webSearch",
};
