import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const TRANSCRIPT_FILE_NAME = "transcript.md";

/** Same rule as the JSONL layout: one path-safe directory per Session. */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function sessionsRoot(dataRoot: string): string {
  return join(dataRoot, "sessions-v2");
}

export function transcriptPath(dataRoot: string, sessionId: string): string {
  if (!SESSION_ID.test(sessionId) || sessionId === "." || sessionId === "..") throw new Error("Session id is not path-safe.");
  return join(sessionsRoot(dataRoot), sessionId, TRANSCRIPT_FILE_NAME);
}

/**
 * True only for a Session's `transcript.md`, which the agent may read without a
 * workspace-scope approval. The sessions root is not included: a search there
 * would also reach Journals, so it keeps the normal approval.
 */
export function isSessionTranscriptReadPath(dataRoot: string, canonicalPath: string): boolean {
  const root = canonical(sessionsRoot(dataRoot));
  const candidate = resolve(canonicalPath);
  if (basename(candidate) !== TRANSCRIPT_FILE_NAME) return false;
  const sessionDir = dirname(candidate);
  return dirname(sessionDir) === root && SESSION_ID.test(basename(sessionDir));
}

/** Background Bash logs: `sessions-v2/<id>/bash-log/bash_<uuid>.log`, the id `node-ports.ts` assigns. */
const BASH_LOG_FILE = /^bash_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.log$/;
export const BASH_LOG_DIRECTORY_NAME = "bash-log";

/**
 * True only for one Bash log file of one Session, which the agent may read
 * without a workspace-scope approval. The `bash-log` directory itself, other
 * file names and the Journal next to it keep the normal approval.
 */
export function isBashLogReadPath(dataRoot: string, canonicalPath: string): boolean {
  const root = canonical(sessionsRoot(dataRoot));
  const candidate = resolve(canonicalPath);
  if (!BASH_LOG_FILE.test(basename(candidate))) return false;
  const logDir = dirname(candidate);
  if (basename(logDir) !== BASH_LOG_DIRECTORY_NAME) return false;
  const sessionDir = dirname(logDir);
  return dirname(sessionDir) === root && SESSION_ID.test(basename(sessionDir));
}

function canonical(path: string): string {
  try { return existsSync(path) ? realpathSync(path) : resolve(path); } catch { return resolve(path); }
}
