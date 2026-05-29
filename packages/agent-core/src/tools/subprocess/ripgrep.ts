import { runProcess, type RunProcessResult } from "./run-process";
import { resolveRipgrepCommand, type RipgrepSource } from "./ripgrep-path";

export const DEFAULT_RIPGREP_TIMEOUT_MS = 15_000;
export const DEFAULT_RIPGREP_MAX_OUTPUT_CHARS = 128_000;

export interface RunRipgrepOptions {
  args: string[];
  cwd: string;
  timeoutMs?: number;
  maxOutputChars?: number;
  env?: NodeJS.ProcessEnv;
}

export interface RipgrepResult extends RunProcessResult {
  notFound: boolean;
  source?: RipgrepSource;
}

export async function runRipgrep(options: RunRipgrepOptions): Promise<RipgrepResult> {
  const command = await resolveRipgrepCommand({
    cwd: options.cwd,
    env: options.env,
  });

  if (!command) {
    return createRipgrepMissingResult(options);
  }

  const result = await runProcess({
    command: command.command,
    args: [...command.argsPrefix, ...options.args],
    cwd: options.cwd,
    timeoutMs: options.timeoutMs ?? DEFAULT_RIPGREP_TIMEOUT_MS,
    maxOutputChars: options.maxOutputChars ?? DEFAULT_RIPGREP_MAX_OUTPUT_CHARS,
    env: options.env,
  });

  return {
    ...result,
    notFound: isRipgrepMissing(result),
    source: command.source,
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

function createRipgrepMissingResult(options: RunRipgrepOptions): RipgrepResult {
  return {
    command: "rg",
    args: [...options.args],
    cwd: options.cwd,
    stdout: "",
    stderr: "",
    exitCode: null,
    signal: null,
    durationMs: 0,
    timedOut: false,
    truncated: false,
    startError: "ENOENT",
    headBuffer: "",
    totalBytes: 0,
    notFound: true,
  };
}
