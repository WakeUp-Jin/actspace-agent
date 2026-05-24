import type { ToolDefinitionSpec } from "../../types";

export const webSearchDefinition: ToolDefinitionSpec = {
  name: "web_search",
  description:
    "Search the public web for current or external information and return a concise summary with source context. " +
    "Use this when the answer may depend on recent facts, external documentation, prices, schedules, laws, or a specific public source. " +
    "Do not use it for local workspace files; use file tools for repository content.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query in the user's language when possible.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "search",
  exposeOnlyTo: "deepseek",
};
