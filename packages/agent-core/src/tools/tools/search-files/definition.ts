import type { ToolDefinitionSpec } from "../../types";

export const searchFilesDefinition: ToolDefinitionSpec = {
  name: "search_files",
  description:
    "Search for text content across files in the workspace using a query string. " +
    "Returns matching file paths and line previews. " +
    "Use for finding code patterns, function definitions, or specific strings. " +
    "Do NOT use this for listing directory contents — use list_directory instead.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Text pattern to search for",
      },
      glob: {
        type: "string",
        description: "File glob pattern to filter search scope (e.g. '*.ts', 'src/**/*.tsx')",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "search",
  previewKind: "search",
};
