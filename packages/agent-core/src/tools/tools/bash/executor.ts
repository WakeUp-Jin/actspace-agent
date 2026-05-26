import { runProcess } from "../../subprocess/run-process";
import type { ToolResult } from "../../../internal-tools";
import type { ToolExecutorFn } from "../../types";
import { DEFAULT_BASH_TIMEOUT_MS } from "./permissions";

export interface BashResult {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  permissionStatus: "allowed";
  riskReason?: string;
  truncated: boolean;
}

const MAX_OUTPUT_CHARS = 64_000;

export const bashExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const command = typeof args.command === "string" ? args.command : "";
  const cwd = typeof args.cwd === "string" ? args.cwd : workspaceRoot;
  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : DEFAULT_BASH_TIMEOUT_MS;

  if (!command) {
    return { success: false, error: "command is required" };
  }

  const proc = await runProcess({
    command: "bash",
    args: ["-lc", command],
    cwd,
    timeoutMs,
    maxOutputChars: MAX_OUTPUT_CHARS,
  });

  if (proc.startError) {
    return { success: false, error: `Failed to start Bash command: ${proc.startError}` };
  }

  const result: BashResult = {
    command,
    cwd,
    stdout: proc.stdout,
    stderr: proc.stderr,
    exitCode: proc.exitCode,
    durationMs: proc.durationMs,
    timedOut: proc.timedOut,
    permissionStatus: "allowed",
    truncated: proc.truncated,
  };

  if (proc.timedOut) {
    return { success: false, data: result, error: `Bash command timed out after ${timeoutMs}ms` };
  }

  if (proc.exitCode !== 0) {
    return { success: false, data: result, error: `Bash command exited with code ${proc.exitCode}` };
  }

  return { success: true, data: result };
};
