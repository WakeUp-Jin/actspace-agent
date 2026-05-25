import { runProcess, type RunProcessResult } from "./run-process";

export const DEFAULT_RIPGREP_TIMEOUT_MS = 15_000;
export const DEFAULT_RIPGREP_MAX_OUTPUT_CHARS = 128_000;

export interface RunRipgrepOptions {
  args: string[];
  cwd: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}

export interface RipgrepResult extends RunProcessResult {
  notFound: boolean;
}

export async function runRipgrep(options: RunRipgrepOptions): Promise<RipgrepResult> {
  const result = await runProcess({
    command: "rg",
    args: options.args,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs ?? DEFAULT_RIPGREP_TIMEOUT_MS,
    maxOutputChars: options.maxOutputChars ?? DEFAULT_RIPGREP_MAX_OUTPUT_CHARS,
  });

  return {
    ...result,
    notFound: isRipgrepMissing(result),
  };
}

export function getRipgrepFailureMessage(result: RipgrepResult): string {
  if (result.notFound) {
    return "ripgrep (rg) is required for grep/glob tools but was not found.";
  }

  if (result.timedOut) {
    return `ripgrep timed out after ${result.durationMs}ms`;
  }

  return result.stderr.trim() || `ripgrep exited with code ${result.exitCode}`;
}

function isRipgrepMissing(result: RunProcessResult): boolean {
  return typeof result.startError === "string" && result.startError.includes("ENOENT");
}
