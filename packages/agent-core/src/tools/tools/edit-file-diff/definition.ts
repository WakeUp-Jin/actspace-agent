import type { ToolDefinitionSpec } from "../../types";

export const editFileDiffDefinition: ToolDefinitionSpec = {
  name: "edit_file_diff",
  description:
    "Generate a unified diff preview for a file edit. " +
    "Finds old_string in the file and shows what the replacement with new_string would look like. " +
    "old_string must uniquely match exactly one location in the file — include enough context lines to ensure uniqueness. " +
    "This tool only previews the diff and does NOT apply changes to the file. " +
    "Prefer this over read_file + write when you only need to change a few lines.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path (absolute or relative to workspace root)",
      },
      old_string: {
        type: "string",
        description: "The exact text to find in the file (must be unique)",
      },
      new_string: {
        type: "string",
        description: "The replacement text",
      },
    },
    required: ["path", "old_string", "new_string"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "file",
};
