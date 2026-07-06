import type { ToolDefinitionSpec } from "../../types";

export const webFetchDefinition: ToolDefinitionSpec = {
  name: "web_fetch",
  description:
    "Fetch a public web page by URL and return its content converted to Markdown. " +
    "This is a deterministic local HTTP fetch (no search engine involved): use it to read documentation, " +
    "articles, README files, or any specific page you already know the URL of. " +
    "HTML is cleaned (navigation/ads/scripts removed) and converted to Markdown; " +
    "plain text / JSON / Markdown responses are returned as-is. " +
    "Content longer than the limit is truncated with a notice. " +
    "For finding pages by topic use web_search first, then read promising results with this tool. " +
    "Do not use for local workspace files (use read_file instead).",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The http(s) URL of the page to fetch.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "web",
  // 复用 web_search 的 UI preview 通道（mode: "url"）；bridge 按 toolName 生成
  // "Read Web Page <url>" 的 displayText。见 agent-tool-preview-design-guidelines.md。
  previewKind: "web_search",
};
