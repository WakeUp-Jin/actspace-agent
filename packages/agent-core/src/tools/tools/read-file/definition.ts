import type { ToolDefinitionSpec } from "../../types";

export const readFileDefinition: ToolDefinitionSpec = {
  name: "read_file",
  description:
    "Read a file from the workspace and return its content with line numbers. " +
    "Supports optional offset and limit parameters for reading specific line ranges. " +
    "Use offset/limit for large files instead of reading the entire file. " +
    "Do NOT use this tool for files outside the workspace boundary.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path (absolute or relative to workspace root)",
      },
      offset: {
        type: "number",
        description: "Starting line number (1-based). Omit to read from the beginning.",
      },
      limit: {
        type: "number",
        description: "Number of lines to read. Omit to read all remaining lines.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "file",
};
