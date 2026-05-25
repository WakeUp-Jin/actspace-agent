import type { ToolDefinitionSpec } from "../../types";

export const webSearchDefinition: ToolDefinitionSpec = {
  name: "web_search",
  description:
    "Search the web or read a specific URL using Kimi's built-in web capabilities. " +
    "Supports two modes: (1) keyword search — find current information, docs, news; " +
    "(2) URL reading — fetch and summarize a specific public webpage. " +
    "Use `query` for keyword search, or `url` to read a specific page. " +
    "Do not use for local workspace files.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search keywords. Use this when searching for information by topic.",
      },
      url: {
        type: "string",
        description: "A specific public URL to read and summarize.",
      },
      prompt: {
        type: "string",
        description: "Optional focus or instruction for the search/summary.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "search",
  previewKind: "generic",
  exposeOnlyTo: "deepseek",
};
