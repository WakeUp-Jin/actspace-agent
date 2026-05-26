import type { ToolDefinitionSpec } from "../../types";

export const bashDefinition: ToolDefinitionSpec = {
  name: "bash",
  description:
    "Run a non-interactive shell command inside the workspace. " +
    "Use this for development verification commands such as pwd, ls, git status, git diff, pnpm typecheck, pnpm test, and pnpm build. " +
    "Do NOT use Bash to read files; use read_file instead. " +
    "Do NOT use Bash to search file contents; use grep instead. " +
    "Do NOT use Bash to find files by name; use glob instead. " +
    "Do NOT use Bash to edit files; use edit_file or write_file instead. " +
    "Shell state does not persist between calls. Provide cwd when a command must run in a workspace subdirectory. " +
    "Quote paths that contain spaces.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to execute.",
      },
      cwd: {
        type: "string",
        description: "Working directory, absolute or relative to the workspace root. Defaults to workspace root.",
      },
      timeoutMs: {
        type: "number",
        description: "Execution timeout in milliseconds. The runtime clamps this to a safe range.",
      },
      intent: {
        type: "string",
        description:
          "Optional one-line summary (max ~60 chars) describing what this command accomplishes. Prefer writing this value in Simplified Chinese so end users can read it easily. It is shown as a comment above the command in the approval card and history views.",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "system",
  previewKind: "bash",
};
