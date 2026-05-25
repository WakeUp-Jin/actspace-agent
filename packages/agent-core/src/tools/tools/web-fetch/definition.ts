import type { ToolDefinitionSpec } from "../../types";

export const webFetchDefinition: ToolDefinitionSpec = {
  name: "web_fetch",
  description:
    "Read a public URL and return a concise, faithful summary of the page content. " +
    "Use this when the user provides a URL or asks for details from a specific public webpage. " +
    "Do not use it for local files or URLs with credentials.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Public http or https URL to read.",
      },
      prompt: {
        type: "string",
        description: "Optional focus for the summary.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "search",
  previewKind: "generic",
  exposeOnlyTo: "deepseek",
};
