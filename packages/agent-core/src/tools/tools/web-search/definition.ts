import type { ToolDefinitionSpec } from "../../types";

export const webSearchDefinition: ToolDefinitionSpec = {
  name: "web_search",
  description:
    "Access the public web. " +
    "Supports two modes: (1) keyword search — find current information, docs, news; " +
    "(2) URL reading — fetch and summarize a specific public webpage. " +
    "Use `query` for keyword search, or `url` to read a specific page. " +
    "Implementation note: the main reasoning model (DeepSeek) routes this call to Kimi's built-in web tools as a sub-capability; " +
    "you do not need to know about that — just call `web_search` like any other tool. " +
    "Do not use for local workspace files (use read_file/grep/glob instead).",
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
  previewKind: "web_search",
  exposeOnlyTo: "deepseek",
};
