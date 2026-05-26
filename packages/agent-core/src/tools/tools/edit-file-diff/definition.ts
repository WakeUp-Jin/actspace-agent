import type { ToolDefinitionSpec } from "../../types";

export const editFileDiffDefinition: ToolDefinitionSpec = {
  name: "edit_file",
  description:
    "Performs exact string replacement in a file. " +
    "Finds old_string in the file and replaces it with new_string, then writes the result back. " +
    "old_string must uniquely match exactly one location — include enough context lines to ensure uniqueness. " +
    "Use replace_all to replace every occurrence (e.g. renaming a variable). " +
    "Always read the file first before editing to verify current content. " +
    "Prefer this over write_file when you only need to change a few lines. " +
    "Edit/Read file path can be absolute or relative to workspace root.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path (absolute or relative to workspace root)",
      },
      old_string: {
        type: "string",
        description: "The exact text to find in the file (must be unique unless replace_all is true)",
      },
      new_string: {
        type: "string",
        description: "The replacement text",
      },
      replace_all: {
        type: "boolean",
        description: "Replace all occurrences (default false). Useful for renaming.",
      },
    },
    required: ["path", "old_string", "new_string"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "file",
  previewKind: "edit_diff",
};
