import type { ToolDefinitionSpec } from "../../types";

export const writeFileDefinition: ToolDefinitionSpec = {
  name: "write_file",
  description:
    "Write content to a file. Creates the file if it does not exist, or overwrites it if it does. " +
    "Parent directories are created automatically. " +
    "For modifying existing files, prefer edit_file to change specific sections " +
    "rather than overwriting the entire file. " +
    "When overwriting an existing file, you must read it first.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path (absolute or relative to workspace root)",
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
};
