import type { ToolDefinitionSpec } from "../../types";

export const grepDefinition: ToolDefinitionSpec = {
  name: "grep",
  description:
    "Search for text or regex patterns within file contents in the workspace. " +
    "Returns matching lines with file paths and line numbers. " +
    "Use for finding code patterns, function definitions, variable references, or specific strings. " +
    "Do NOT use this for finding files by name — use glob instead.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Regular expression pattern to search for in file contents",
      },
      path: {
        type: "string",
        description: "Directory or file path to search in (relative to workspace root). Defaults to workspace root.",
      },
      glob: {
        type: "string",
        description: "File name glob pattern to filter search scope (e.g. '*.ts', 'src/**/*.tsx')",
      },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "search",
  previewKind: "grep",
};
