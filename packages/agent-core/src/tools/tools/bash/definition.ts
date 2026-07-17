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
    "Quote paths that contain spaces. " +
    "The permission layer rejects commands containing pipes, redirection, command substitution, or subshells " +
    "(| < > ` $() {}). Write plain single commands (chaining with && or ; is fine); " +
    "to filter or slice output, read the returned output file with read_file or grep instead of piping. " +
    "Large output handling: when a command produces more output than the inline limit, only the head is returned along with the absolute path of a file containing the full output. " +
    "Read that file with read_file (offset/limit) or search it with grep instead of re-running the command with | head or | tail. " +
    "Long-running commands: set blockMs to how long you are willing to wait. When blockMs elapses the command is NOT killed; " +
    "it keeps running in the background and you get a taskId plus an output file path. You will receive a task_notification when it finishes, " +
    "so do NOT poll with sleep loops or repeated bash_output calls. Background tasks are limited to 30 minutes total runtime and 8 running tasks per session. " +
    "Starting the same normalized cwd + command while it is already running reuses the existing taskId instead of spawning another process. " +
    "For dev servers and watchers that never exit, set blockMs to 0 to background immediately and use notifyOnOutput to subscribe to key log events " +
    "(e.g. pattern 'ready|error' for a dev server); you will be notified when a line matches, so never poll with sleep loops. " +
    "Never append '&' to commands. " +
    "Sandbox: by default commands run inside a sandbox that restricts writes to the workspace and temp directories " +
    "and denies reads of sensitive paths (~/.ssh, ~/.aws, etc.); network is currently unrestricted. " +
    "Use $TMPDIR for temp files instead of hardcoding /tmp. " +
    "Irreversible operations always require user approval even in the sandbox: rm/rmdir, find -delete, dd/shred/truncate, " +
    "git reset --hard, git clean, git restore, git checkout with pathspec, git stash drop/clear, git push --force. " +
    "When running one of these, explain why in `intent`. Prefer non-destructive alternatives when possible " +
    "(e.g. move files aside instead of rm, git stash instead of git reset --hard). " +
    "If a command fails ONLY because of sandbox restrictions — evidence in the output such as 'Operation not permitted', EPERM, " +
    "'Read-only file system', or an explicit [sandbox] annotation — you may retry once with requiredPermissions: [\"no_sandbox\"], " +
    "which asks the user for approval to run in the real environment. " +
    "Most failures (wrong path, missing dependency, compile error) are NOT sandbox-related: never escalate without evidence, " +
    "and evaluate each command independently instead of carrying requiredPermissions over by habit. " +
    "Beware that a failed sandboxed run may have already applied partial side effects inside the workspace before hitting the restriction.",
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
      blockMs: {
        type: "number",
        description:
          "How long to wait in the foreground (milliseconds) before the command is moved to the background. " +
          "Default 30000, clamped to [1000, 600000]. Set 0 to background immediately (dev servers, watchers). " +
          "The process is not killed when blockMs elapses; once backgrounded, the global 30-minute maximum runtime applies.",
      },
      intent: {
        type: "string",
        description:
          "Optional one-line summary (max ~60 chars) describing what this command accomplishes. Prefer writing this value in Simplified Chinese so end users can read it easily. It is shown as a comment above the command in the approval card and history views.",
      },
      notifyOnOutput: {
        type: "object",
        description:
          "Optional output subscription for backgrounded commands (most useful with blockMs 0). " +
          "When any output line matches `pattern` (a regex), you receive a task_notification. " +
          "`reason` is a short phrase (5 words or less) shown to the user describing what you are waiting for. " +
          "`debounceMs` throttles notifications (minimum and default 5000). " +
          "Ignored if the command finishes in the foreground.",
      },
      requiredPermissions: {
        type: "array",
        items: { type: "string", enum: ["no_sandbox"] },
        description:
          "Escalation request: run in the real environment instead of the sandbox. " +
          "Always triggers user approval. Only use after a sandboxed run failed with clear sandbox evidence " +
          "(EPERM / 'Operation not permitted' / [sandbox] annotation), and put the evidence in `intent` " +
          "so the user can see why escalation is needed.",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "system",
  previewKind: "bash",
};
