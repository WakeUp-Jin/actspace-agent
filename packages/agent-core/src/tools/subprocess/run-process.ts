import { spawn, type SpawnOptions } from "node:child_process";

export interface RunProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputChars: number;
  env?: NodeJS.ProcessEnv;
}

export interface RunProcessResult {
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  startError?: string;
}

export async function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  const startedAt = Date.now();
  const resultBase = {
    command: options.command,
    args: [...options.args],
    cwd: options.cwd,
  };

  return new Promise<RunProcessResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let truncated = false;

    const spawnOptions: SpawnOptions = {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    };

    const child = spawn(options.command, options.args, spawnOptions);

    const finish = (result: Omit<RunProcessResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        durationMs: Date.now() - startedAt,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    const append = (current: string, next: Buffer): string => {
      if (current.length >= options.maxOutputChars) {
        truncated = true;
        return current;
      }

      const text = next.toString("utf8");
      const available = options.maxOutputChars - current.length;
      if (text.length > available) {
        truncated = true;
      }
      return current + text.slice(0, available);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    child.on("error", (err) => {
      finish({
        ...resultBase,
        stdout,
        stderr,
        exitCode: null,
        signal: null,
        timedOut,
        truncated,
        startError: err.message,
      });
    });

    child.on("close", (exitCode, signal) => {
      finish({
        ...resultBase,
        stdout,
        stderr,
        exitCode,
        signal,
        timedOut,
        truncated,
      });
    });
  });
}
