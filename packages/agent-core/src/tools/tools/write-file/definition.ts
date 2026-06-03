import type { ToolDefinitionSpec } from "../../types";

export const writeFileDefinition: ToolDefinitionSpec = {
  name: "write_file",
  description:
    "Write content to a file. Creates the file if it does not exist, or overwrites it if it does. " +
    "Parent directories are created automatically. " +
    "Paths are resolved inside the current workspace root unless runtime instructions give an explicit writable absolute path; if the user gives only a filename, create it in the workspace root. " +
    "For modifying existing files, prefer edit_file to change specific sections " +
    "rather than overwriting the entire file. " +
    "When overwriting an existing file, you must read it first.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path, absolute or relative to workspace root. Runtime instructions may provide explicit writable absolute paths. A bare filename is created in the workspace root.",
      },
      content: {
        type: "string",
        description: "The complete file content to write",
      },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "file",
  previewKind: "write",
  extractPaths: (args) =>
    typeof args.path === "string" && args.path.length > 0 ? [args.path] : [],
};
