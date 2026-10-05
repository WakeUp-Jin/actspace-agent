import { join } from "node:path";
import { SessionError } from "@actspace/session-journal";
export type SessionFileLayout = {
  readonly root: string;
  readonly sessionDir: string;
  readonly journalPath: string;
  readonly artifactsDir: string;
  readonly recoveryDir: string;
};

export function sessionFileLayout(dataRoot: string, sessionId: string): SessionFileLayout {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sessionId) || sessionId === "." || sessionId === "..") {
    throw new SessionError("INVALID_HEADER", "Session id is not path-safe.");
  }
  const root = join(dataRoot, "sessions-v2");
  const sessionDir = join(root, sessionId);
  return Object.freeze({ root, sessionDir, journalPath: join(sessionDir, "journal.jsonl"), artifactsDir: join(sessionDir, "artifacts"), recoveryDir: join(sessionDir, "recovery") });
}
