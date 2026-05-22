import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { normalizeSessionEvents } from "@actspace/shared";
import type { AgentTurnResult, SessionEvent, SessionListItem, SessionMeta, SessionRecord } from "@actspace/shared";

export type SessionStorePaths = {
  root: string;
  metaPath: string;
  sessionPath: string;
  attachmentsDir: string;
};

export function createSessionStorePaths(root: string): SessionStorePaths {
  return {
    root,
    metaPath: join(root, "meta.json"),
    sessionPath: join(root, "session.jsonl"),
    attachmentsDir: join(root, "attachments")
  };
}

export async function ensureSessionStore(root: string): Promise<SessionStorePaths> {
  const paths = createSessionStorePaths(root);
  await mkdir(paths.attachmentsDir, { recursive: true });
  return paths;
}

export async function appendSessionEvent(sessionPath: string, event: unknown): Promise<void> {
  await mkdir(dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, `${JSON.stringify(event)}\n`, { flag: "a" });
}

export async function writeSessionResult(paths: SessionStorePaths, result: AgentTurnResult): Promise<void> {
  await ensureSessionStore(paths.root);
  for (const event of result.events) {
    await appendSessionEvent(paths.sessionPath, event);
  }

  const now = new Date().toISOString();
  await writeFile(
    paths.metaPath,
    JSON.stringify(
      {
        id: result.sessionId,
        title: `Session ${result.sessionId}`,
        updatedAt: now,
        createdAt: now,
        turnCount: result.events.filter(
          (event) => event.type === "assistant_message" || event.type === "assistant_reply"
        ).length
      },
      null,
      2
    )
  );
}

export async function readSessionJsonl(sessionPath: string): Promise<string[]> {
  try {
    const content = await readFile(sessionPath, "utf8");
    return content
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function readSessionRecord(paths: SessionStorePaths): Promise<SessionRecord | null> {
  try {
    const metaRaw = await readFile(paths.metaPath, "utf8");
    const meta = JSON.parse(metaRaw) as SessionMeta;
    const lines = await readSessionJsonl(paths.sessionPath);
    const records = lines.map((line) => JSON.parse(line) as unknown);
    const events = normalizeSessionEvents(records);
    return { meta, events };
  } catch {
    return null;
  }
}

export async function listSessionRecords(sessionRoot: string): Promise<SessionListItem[]> {
  try {
    const entries = await readdir(sessionRoot, { withFileTypes: true });
    const sessions = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const records = await Promise.all(
      sessions.map(async (sessionId) => {
        const paths = createSessionStorePaths(join(sessionRoot, sessionId));
        const record = await readSessionRecord(paths);
        if (!record) {
          return null;
        }
        return {
          id: record.meta.id,
          title: record.meta.title,
          updatedAt: record.meta.updatedAt,
          turnCount: record.meta.turnCount
        } satisfies SessionListItem;
      })
    );
    return records.filter((item): item is SessionListItem => item !== null);
  } catch {
    return [];
  }
}
