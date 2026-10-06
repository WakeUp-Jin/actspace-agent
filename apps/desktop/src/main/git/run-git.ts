import { execFile } from "node:child_process";

export type GitRunOptions = { cwd: string; timeoutMs: number; maxOutputChars: number };

/**
 * 子进程没能正常跑完 git 时的错误：spawn 失败（ENOENT、EACCES）、输出超出 maxBuffer 等。
 * 两项都保留：`code` 用来分类（如 ENOENT），`message` 给人看。
 */
export type GitStartError = { code: string; message: string };

export type GitRunResult = {
  stdout: string;
  stderr: string;
  /** 正常退出时的退出码；被信号终止或没能启动时为 null。 */
  exitCode: number | null;
  timedOut: boolean;
  /** 输出超过 maxOutputChars，或子进程因 maxBuffer 被终止。 */
  truncated: boolean;
  startError?: GitStartError;
};

export type GitRunner = (args: string[], options: GitRunOptions) => Promise<GitRunResult>;

/**
 * 01 S9：main 里 git 子进程的统一入口。
 * 总是带 `-C cwd`，并设置 `GIT_TERMINAL_PROMPT=0`，避免 git 在没有终端时等凭据输入。
 */
export const runGitCommand: GitRunner = (args, options) => new Promise((resolveResult) => {
  let settled = false;
  const settle = (result: GitRunResult) => {
    if (settled) return;
    settled = true;
    resolveResult(result);
  };
  const child = execFile(
    "git",
    ["-C", options.cwd, ...args],
    {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      maxBuffer: options.maxOutputChars,
      windowsHide: true,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    },
    (error, out, err) => {
      const stdout = String(out ?? "");
      const stderr = String(err ?? "");
      const failure = error as (NodeJS.ErrnoException & { code?: string | number | null; killed?: boolean }) | null;
      const truncated = stdout.length > options.maxOutputChars || stderr.length > options.maxOutputChars
        || failure?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
      settle({
        stdout: stdout.slice(0, options.maxOutputChars),
        stderr: stderr.slice(0, options.maxOutputChars),
        exitCode: failure ? (typeof failure.code === "number" ? failure.code : null) : 0,
        // maxBuffer 超限时 Node 也会终止子进程；它不算超时。
        timedOut: failure?.killed === true && failure.code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
        truncated,
        ...(typeof failure?.code === "string" ? { startError: { code: failure.code, message: failure.message } } : {}),
      });
    },
  );
  child.on("error", (error: NodeJS.ErrnoException) => {
    settle({ stdout: "", stderr: "", exitCode: null, timedOut: false, truncated: false, startError: { code: error.code ?? "ERROR", message: error.message } });
  });
});

export function isGitRunSuccess(result: GitRunResult): boolean {
  return result.exitCode === 0 && !result.startError && !result.timedOut;
}
