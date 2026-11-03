import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Per-Session cap of `bash-log/`: older finished logs are deleted past it. */
export const SESSION_BASH_LOG_CAP_BYTES = 50 * 1024 * 1024;
export const BASH_LOG_DIRECTORY_NAME = "bash-log";

/** Same rule as the JSONL layout and `@actspace/session-transcript` `paths.ts`: one path-safe directory per Session. */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** `bash_<lowercase uuid>.log`; `isBashLogReadPath` in `@actspace/session-transcript` lets reads of exactly these through. */
const LOG_FILE = /^(bash_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.log$/;

export type BashLog = { readonly id: string; readonly path: string };

/** `<dataRoot>/sessions-v2/<sessionId>/bash-log/`. */
export function bashLogDirectory(dataRoot: string, sessionId: string): string {
  if (!SESSION_ID.test(sessionId) || sessionId === "." || sessionId === "..") throw new Error("Session id is not path-safe.");
  return join(dataRoot, "sessions-v2", sessionId, BASH_LOG_DIRECTORY_NAME);
}

/**
 * Bash logs in the Session directory. A foreground log is deleted by its caller once the result exists; a background
 * log stays with the Session until the Session is deleted or the cap removes it.
 */
export class SessionBashLogs {
  /** One pass at a time per Session, so two passes never count the same files. */
  readonly #passes = new Map<string, Promise<void>>();
  constructor(private readonly dataRoot: string, private readonly capBytes = SESSION_BASH_LOG_CAP_BYTES) {}

  async create(sessionId: string): Promise<BashLog> {
    const directory = bashLogDirectory(this.dataRoot, sessionId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const id = `bash_${randomUUID()}`;
    const path = join(directory, `${id}.log`);
    await writeFile(path, "", { encoding: "utf8", mode: 0o600 });
    return { id, path };
  }

  /**
   * Keeps `bash-log/` at or under the cap: deletes logs oldest first by mtime, skipping `running` paths, and reports
   * each deleted id. Foreground leftovers (killed when the app quit) are ordered with finished background logs.
   */
  prune(sessionId: string, running: ReadonlySet<string>, onPruned: (taskId: string) => Promise<void>): Promise<void> {
    const previous = this.#passes.get(sessionId) ?? Promise.resolve();
    const pass = previous.then(() => this.#prune(sessionId, running, onPruned));
    const settled = pass.catch(() => undefined);
    this.#passes.set(sessionId, settled);
    void settled.then(() => { if (this.#passes.get(sessionId) === settled) this.#passes.delete(sessionId); });
    return pass;
  }

  async #prune(sessionId: string, running: ReadonlySet<string>, onPruned: (taskId: string) => Promise<void>): Promise<void> {
    const directory = bashLogDirectory(this.dataRoot, sessionId);
    const names = await readdir(directory).catch(() => [] as string[]);
    const logs = (await Promise.all(names.map(async name => {
      const id = LOG_FILE.exec(name)?.[1];
      if (id === undefined) return undefined;
      const path = join(directory, name);
      const info = await stat(path).catch(() => undefined);
      return info?.isFile() ? { id, path, size: info.size, mtimeMs: info.mtimeMs } : undefined;
    }))).filter(log => log !== undefined);
    let total = logs.reduce((sum, log) => sum + log.size, 0);
    if (total <= this.capBytes) return;
    for (const log of logs.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      if (total <= this.capBytes) break;
      if (running.has(log.path)) continue;
      await rm(log.path, { force: true });
      total -= log.size;
      await onPruned(log.id);
    }
  }
}

/** Process scratch directories under `<tmpRoot>/bash-v2/` left by a crash: older than `maxAgeMs` and not `keep`. */
export async function sweepStaleScratchDirectories(bashRoot: string, keep: string, options: { readonly now?: number; readonly maxAgeMs?: number } = {}): Promise<readonly string[]> {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const removed: string[] = [];
  for (const entry of await readdir(bashRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const path = join(bashRoot, entry.name);
    if (path === keep) continue;
    const info = await stat(path).catch(() => undefined);
    if (info === undefined || now - info.mtimeMs <= maxAgeMs) continue;
    await rm(path, { recursive: true, force: true });
    removed.push(path);
  }
  return removed;
}
