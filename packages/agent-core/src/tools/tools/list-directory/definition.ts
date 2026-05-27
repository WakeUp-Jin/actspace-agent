import type { ToolDefinitionSpec } from "../../types";

export const listDirectoryDefinition: ToolDefinitionSpec = {
  name: "list_directory",
  description:
    "List files and subdirectories in a workspace directory. " +
    "Returns entries with type indicators ([dir] or [file]). " +
    "Use for lightweight navigation and discovering project structure. " +
    "Do NOT use this for reading file contents — use read_file instead.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path (absolute or relative to workspace root)",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "file",
  previewKind: "directory_list",
  extractPaths: (args) =>
    typeof args.path === "string" && args.path.length > 0 ? [args.path] : [],
};
