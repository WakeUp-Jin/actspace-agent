import { spawn } from "node:child_process";
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

  const startedAt = Date.now();

  return new Promise<ToolResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let truncated = false;

    const child = spawn("bash", ["-lc", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    const append = (target: "stdout" | "stderr", chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (target === "stdout") {
        stdout = appendLimited(stdout, text);
      } else {
        stderr = appendLimited(stderr, text);
      }
      if (stdout.length >= MAX_OUTPUT_CHARS || stderr.length >= MAX_OUTPUT_CHARS) {
        truncated = true;
      }
    };

    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: false,
        error: `Failed to start Bash command: ${err.message}`,
      });
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const result: BashResult = {
        command,
        cwd,
        stdout,
        stderr,
        exitCode,
        durationMs: Date.now() - startedAt,
        timedOut,
        permissionStatus: "allowed",
        truncated,
      };

      if (timedOut) {
        return resolve({
          success: false,
          data: result,
          error: `Bash command timed out after ${timeoutMs}ms`,
        });
      }

      if (exitCode !== 0) {
        return resolve({
          success: false,
          data: result,
          error: `Bash command exited with code ${exitCode}`,
        });
      }

      return resolve({
        success: true,
        data: result,
      });
    });
  });
};

function appendLimited(current: string, next: string): string {
  if (current.length >= MAX_OUTPUT_CHARS) {
    return current;
  }

  const available = MAX_OUTPUT_CHARS - current.length;
  return current + next.slice(0, available);
}
