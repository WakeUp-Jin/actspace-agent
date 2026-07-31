import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SECRET_KEY_PATTERN = /(api.?key|token|secret|password|private.?key|authorization|credential)/i;
const INTERNAL_KEY_PATTERN = /^(ACTSPACE_|ELECTRON_|VITE_|NODE_OPTIONS$)/i;

export type ShellEnvironment = {
  shell: string;
  shellName: string;
  args: string[];
  env: Record<string, string>;
};

export type ShellEnvironmentServiceOptions = {
  sourceEnv?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  runLoginEnv?: (shell: string, env: Record<string, string>) => Promise<string>;
};

function sanitizeEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string" || SECRET_KEY_PATTERN.test(key) || INTERNAL_KEY_PATTERN.test(key)) continue;
    result[key] = value;
  }
  return result;
}

function parseNullSeparatedEnvironment(output: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const item of output.split("\0")) {
    const separator = item.indexOf("=");
    if (separator <= 0) continue;
    const key = item.slice(0, separator).trim();
    if (!key || SECRET_KEY_PATTERN.test(key) || INTERNAL_KEY_PATTERN.test(key)) continue;
    parsed[key] = item.slice(separator + 1);
  }
  return parsed;
}

export class ShellEnvironmentService {
  private cached?: Promise<ShellEnvironment>;

  constructor(private readonly options: ShellEnvironmentServiceOptions = {}) {}

  resolve(): Promise<ShellEnvironment> {
    this.cached ??= this.resolveUncached();
    return this.cached;
  }

  private async resolveUncached(): Promise<ShellEnvironment> {
    const platform = this.options.platform ?? process.platform;
    const source = this.options.sourceEnv ?? process.env;
    const shell = platform === "win32"
      ? source.COMSPEC || "C:\\Windows\\System32\\cmd.exe"
      : source.SHELL || (platform === "darwin" ? "/bin/zsh" : "/bin/bash");

    try {
      await access(shell, constants.X_OK);
    } catch {
      throw new Error(`shell_not_found:${shell}`);
    }

    const baseEnv = sanitizeEnvironment(source);
    let env = baseEnv;
    if (platform !== "win32") {
      const runLoginEnv = this.options.runLoginEnv ?? (async (targetShell, inputEnv) => {
        const result = await execFileAsync(targetShell, ["-ilc", "/usr/bin/env -0"], {
          env: inputEnv,
          encoding: "utf8",
          timeout: 10_000,
          maxBuffer: 2 * 1024 * 1024,
        });
        return result.stdout;
      });
      try {
        env = { ...baseEnv, ...parseNullSeparatedEnvironment(await runLoginEnv(shell, baseEnv)) };
      } catch (error) {
        throw new Error("shell_environment_failed:unable to resolve the login shell environment");
      }
    }

    env.TERM = "xterm-256color";
    env.COLORTERM = "truecolor";
    env.TERM_PROGRAM = "Actspace";
    return {
      shell,
      shellName: basename(shell),
      args: platform === "win32" ? [] : ["-l"],
      env,
    };
  }
}
