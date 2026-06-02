import type { ToolDefinitionSpec } from "../../types";

export const deleteFileDefinition: ToolDefinitionSpec = {
  name: "delete_file",
  description:
    "Delete a regular file from the current workspace. " +
    "Use this instead of Bash rm when the user asks you to remove a file. " +
    "Only files are supported; directories, recursive deletion, glob deletion, and batch deletion are not supported. " +
    "Paths are resolved inside the current workspace root.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path, absolute or relative to workspace root.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "file",
  previewKind: "delete",
  extractPaths: (args) =>
    typeof args.path === "string" && args.path.length > 0 ? [args.path] : [],
};
