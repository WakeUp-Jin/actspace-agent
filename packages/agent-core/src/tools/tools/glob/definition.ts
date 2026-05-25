import type { ToolDefinitionSpec } from "../../types";

export const globDefinition: ToolDefinitionSpec = {
  name: "glob",
  description:
    "Find files by name pattern in the workspace. " +
    "Returns matching file paths sorted by modification time (most recent first). " +
    "Use for locating files by extension, name, or directory structure. " +
    "Do NOT use this for searching file contents — use grep instead.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern to match file names (e.g. '**/*.ts', 'src/components/**', '*.json')",
      },
      path: {
        type: "string",
        description: "Directory to search in (relative to workspace root). Defaults to workspace root.",
      },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "search",
  previewKind: "search",
};
