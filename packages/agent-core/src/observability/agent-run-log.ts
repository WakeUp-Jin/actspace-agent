import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type AgentRunLogEvent = {
  type: string;
  timestamp?: string;
  payload?: unknown;
};

export type AgentRunLogger = {
  filePath: string;
  write: (event: AgentRunLogEvent) => Promise<void>;
};

export type AgentRunLoggerInput = {
  logRoot: string;
  sessionId: string;
  turnId: string;
  now?: Date;
};

export async function cleanupOldAgentRunLogs(
  logRoot: string,
  retentionMs = ONE_DAY_MS,
  now = Date.now(),
): Promise<void> {
  const dir = getAgentRunLogDir(logRoot);
  await mkdir(dir, { recursive: true });

  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map(async (entry) => {
        const createdAt = parseTimestampFromFileName(entry.name);
        if (createdAt === undefined || now - createdAt <= retentionMs) return;
        await rm(join(dir, entry.name), { force: true });
      }),
  );
}

export async function createAgentRunLogger(input: AgentRunLoggerInput): Promise<AgentRunLogger> {
  const dir = getAgentRunLogDir(input.logRoot);
  await mkdir(dir, { recursive: true });

  const createdAt = input.now ?? new Date();
  const filePath = join(
    dir,
    `${formatDateForFileName(createdAt)}-${sanitizePart(input.sessionId)}-${sanitizePart(input.turnId)}.jsonl`,
  );

  const write: AgentRunLogger["write"] = async (event) => {
    const line = JSON.stringify({
      timestamp: event.timestamp ?? new Date().toISOString(),
      type: event.type,
      payload: event.payload ?? {},
    });
    await writeFile(filePath, `${line}\n`, { flag: "a" });
  };

  return { filePath, write };
}

function getAgentRunLogDir(logRoot: string): string {
  return join(logRoot, "agent-runs");
}

function sanitizePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "unknown";
}

function formatDateForFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function parseTimestampFromFileName(fileName: string): number | undefined {
  const match = /^(\d{8})-(\d{6})-/.exec(fileName);
  if (!match) return undefined;

  const [, date, time] = match;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6)) - 1;
  const day = Number(date.slice(6, 8));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2, 4));
  const second = Number(time.slice(4, 6));
  const parsed = new Date(year, month, day, hour, minute, second).getTime();

  return Number.isNaN(parsed) ? undefined : parsed;
}
