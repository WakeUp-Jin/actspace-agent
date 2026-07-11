import type { ToolDefinitionSpec } from "../../types";

export const readFileDefinition: ToolDefinitionSpec = {
  name: "read_file",
  description:
    "Read a targeted line range from a file in the workspace or a user-explicitly provided local path, such as an attached file path, and return its content with line numbers. " +
    "For supported image files, read_file returns native image input to image-capable models instead of raw binary text. " +
    "Prefer segmented reads: inspect small relevant ranges, then page with offset/limit instead of reading broad file chunks. " +
    "By default reads up to 200 lines from offset 1. Set offset and limit for each range you need. " +
    "Repeated reads of an unchanged exact range may return a short unchanged notice; pass force=true only when you need the text repeated after context loss. " +
    "Only read paths that are relevant to the user's request or provided by the app context.",
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
        description: "Number of lines to read. Omit to read the default 200-line range.",
      },
      force: {
        type: "boolean",
        description: "Set true to repeat an unchanged range when the earlier read text is no longer available in context.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "file",
  previewKind: "read",
  extractPaths: (args) =>
    typeof args.path === "string" && args.path.length > 0 ? [args.path] : [],
};
