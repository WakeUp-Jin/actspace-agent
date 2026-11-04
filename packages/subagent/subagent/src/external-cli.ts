import { execFile } from "node:child_process";

/** How long the login shell may take to answer `command -v`. */
export const COMMAND_LOOKUP_TIMEOUT_MS = 5_000;

const cache = new Map<string, Promise<string | undefined>>();

/**
 * Find a CLI the way the user's terminal would (design 04 §1): an Electron app started from the Dock
 * does not get the terminal's PATH, so ask the login shell. The answer is cached until the plugin reloads
 * (`clearCommandCache` on dispose). Resolves to the absolute path, or undefined when it is not installed.
 */
export function resolveCommand(name: string, options: { readonly shell?: string; readonly timeoutMs?: number } = {}): Promise<string | undefined> {
  const shell = options.shell ?? process.env.SHELL ?? "/bin/sh";
  const key = `${shell}\0${name}`;
  let found = cache.get(key);
  if (!found) {
    found = lookup(shell, name, options.timeoutMs ?? COMMAND_LOOKUP_TIMEOUT_MS);
    cache.set(key, found);
  }
  return found;
}

export function clearCommandCache(name?: string): void {
  if (name === undefined) { cache.clear(); return; }
  for (const key of [...cache.keys()]) if (key.endsWith(`\0${name}`)) cache.delete(key);
}

function lookup(shell: string, name: string, timeoutMs: number): Promise<string | undefined> {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return Promise.resolve(undefined);
  return new Promise(resolve => {
    execFile(shell, ["-lc", `command -v ${name}`], { timeout: timeoutMs, encoding: "utf8" }, (error, stdout) => {
      if (error) { resolve(undefined); return; }
      // Login scripts may print banners; the path is the last line that looks like one.
      const path = stdout.split("\n").map(line => line.trim()).filter(line => line.startsWith("/")).at(-1);
      resolve(path);
    });
  });
}

/** How long a stopped CLI gets to exit before it is killed (design 04 §3.1, §3.2). */
export const EXTERNAL_STOP_GRACE_MS = 2_000;

/** `SIGTERM`, then `SIGKILL` after the grace period; resolves once the process has exited. */
export function terminate(child: import("node:child_process").ChildProcess, graceMs = EXTERNAL_STOP_GRACE_MS): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, graceMs);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

/** Keeps the last bytes a CLI wrote to stderr, for the error line of a failed run. */
const ERROR_LINE = /^(?:[A-Za-z]*Error|error|fatal)\b\s*:/;

export class OutputTail {
  #text = "";
  constructor(private readonly limit = 8_192) {}
  push(chunk: string | Buffer): void { this.#text = (this.#text + chunk.toString()).slice(-this.limit); }
  /**
   * Why the CLI exited: the last line that reads like an error (`Error: …`, `TypeError: …`, `error: …`,
   * `fatal: …`), else the last non-empty line. A Node launcher prints `Error: spawn … ENOENT` followed by
   * a stack and an object dump, whose last line is just `}`.
   */
  lastLine(): string | undefined {
    const lines = this.#text.split("\n").map(line => line.trim()).filter(Boolean);
    return [...lines].reverse().find(line => ERROR_LINE.test(line)) ?? lines.at(-1);
  }
}
