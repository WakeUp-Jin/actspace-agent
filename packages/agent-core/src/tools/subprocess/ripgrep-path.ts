import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { runProcess } from "./run-process";

export type RipgrepSource = "env" | "system" | "bundled";

export interface RipgrepCommand {
  command: string;
  argsPrefix: string[];
  source: RipgrepSource;
}

interface RipgrepPathOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

const RIPGREP_ENV_PATH = "ACTSPACE_RG_PATH";
const RIPGREP_VERSION_TIMEOUT_MS = 2_000;

let cachedCommand: RipgrepCommand | null = null;

export function clearRipgrepCommandCache(): void {
  cachedCommand = null;
}

export async function resolveRipgrepCommand(options: RipgrepPathOptions): Promise<RipgrepCommand | null> {
  const explicitPath = options.env?.[RIPGREP_ENV_PATH] ?? process.env[RIPGREP_ENV_PATH];
  if (explicitPath) {
    return isExecutableCandidate(explicitPath) && await canRunRipgrep(explicitPath, options.cwd, options.env)
      ? { command: explicitPath, argsPrefix: [], source: "env" }
      : null;
  }

  if (cachedCommand) {
    return cachedCommand;
  }

  if (await canRunRipgrep("rg", options.cwd, options.env)) {
    cachedCommand = { command: "rg", argsPrefix: [], source: "system" };
    return cachedCommand;
  }

  const bundledPath = getBundledRipgrepPath();
  if (bundledPath && await canRunRipgrep(bundledPath, options.cwd, options.env)) {
    cachedCommand = { command: bundledPath, argsPrefix: [], source: "bundled" };
    return cachedCommand;
  }

  return null;
}

function getBundledRipgrepPath(): string | null {
  try {
    const ripgrep = require("@vscode/ripgrep") as { rgPath?: unknown };
    return typeof ripgrep.rgPath === "string" ? ripgrep.rgPath : null;
  } catch {
    return null;
  }
}

async function canRunRipgrep(command: string, cwd: string, env?: NodeJS.ProcessEnv): Promise<boolean> {
  const result = await runProcess({
    command,
    args: ["--version"],
    cwd,
    timeoutMs: RIPGREP_VERSION_TIMEOUT_MS,
    maxOutputChars: 2_000,
    env,
  });

  return result.exitCode === 0 && !result.timedOut;
}

function isExecutableCandidate(path: string): boolean {
  return isAbsolute(path) && existsSync(path);
}
