import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PathsConfig } from "../config/schema";

export interface SessionDigestItem {
  id: string;
  title: string;
  updatedAt: string;
  turnCount: number;
  unreadTurnsForKairos: number;
  lastUserPreview: string;                           // 最近一条 user_message 的前 80 字符
}

export interface SessionsDigestResult {
  workspaces: Array<{
    rootPath: string;
    sessions: SessionDigestItem[];
  }>;
  generatedAt: string;
}

const PREVIEW_MAX = 80;

interface KairosSessionsState {
  /** sessionId → 最后一次 Kairos 已读到的 turnId */
  lastSeenTurnId: Record<string, string>;
}

export class SessionsDigestBuilder {
  private readonly paths: PathsConfig;
  private readonly stateFile: string;
  private readonly outputFile: string;

  constructor(opts: {
    paths: PathsConfig;
    /** `<kairosRoot>/memory/state.json`，记录 lastSeenTurnId。 */
    stateFile: string;
    /** `<kairosRoot>/observe/sessions-digest.json`。 */
    outputFile: string;
  }) {
    this.paths = opts.paths;
    this.stateFile = opts.stateFile;
    this.outputFile = opts.outputFile;
  }

  async refresh(): Promise<SessionsDigestResult> {
    const state = await this.loadState();
    const workspaces: SessionsDigestResult["workspaces"] = [];

    for (const entry of this.paths.paths) {
      // 不挑食策略：每个 paths.path 都尝试当 sessions root；
      // 子目录不含 session.jsonl 则忽略，不报错。
      const sessions = await this.discoverSessionsUnder(entry.path, state);
      if (sessions.length > 0) {
        workspaces.push({ rootPath: entry.path, sessions });
      }
    }

    const result: SessionsDigestResult = {
      workspaces,
      generatedAt: new Date().toISOString(),
    };

    await this.saveState(state);
    await this.writeOutput(result);

    return result;
  }

  private async discoverSessionsUnder(
    root: string,
    state: KairosSessionsState,
  ): Promise<SessionDigestItem[]> {
    const subdirs = await this.safeListDirs(root);
    const result: SessionDigestItem[] = [];
    for (const subdir of subdirs) {
      const item = await this.readSessionDigest(subdir, state);
      if (item) result.push(item);
    }
    return result;
  }

  private async readSessionDigest(
    sessionRoot: string,
    state: KairosSessionsState,
  ): Promise<SessionDigestItem | null> {
    const jsonlPath = join(sessionRoot, "session.jsonl");
    const metaPath = join(sessionRoot, "meta.json");
    try {
      await stat(jsonlPath);
    } catch {
      return null;
    }

    const sessionId = baseName(sessionRoot);
    let title = sessionId;
    let updatedAt = new Date(0).toISOString();
    let turnCount = 0;
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8")) as {
        id?: string;
        title?: string;
        updatedAt?: string;
        turnCount?: number;
      };
      if (typeof meta.id === "string") title = meta.title ?? meta.id;
      if (typeof meta.title === "string") title = meta.title;
      if (typeof meta.updatedAt === "string") updatedAt = meta.updatedAt;
      if (typeof meta.turnCount === "number") turnCount = meta.turnCount;
    } catch {
      // 没有 meta 也能继续
    }

    const { lastUserPreview, lastTurnId, observedTurns } = await this.scanJsonlTail(jsonlPath);
    const lastSeen = state.lastSeenTurnId[sessionId];
    const unread = lastSeen
      ? observedTurns.indexOf(lastSeen) === -1
        ? observedTurns.length
        : observedTurns.length - observedTurns.indexOf(lastSeen) - 1
      : observedTurns.length;

    if (lastTurnId) state.lastSeenTurnId[sessionId] = lastTurnId;

    return {
      id: sessionId,
      title,
      updatedAt,
      turnCount: turnCount || observedTurns.length,
      unreadTurnsForKairos: unread,
      lastUserPreview,
    };
  }

  private async scanJsonlTail(
    jsonlPath: string,
  ): Promise<{ lastUserPreview: string; lastTurnId: string | null; observedTurns: string[] }> {
    let text = "";
    try {
      text = await readFile(jsonlPath, "utf8");
    } catch {
      return { lastUserPreview: "", lastTurnId: null, observedTurns: [] };
    }
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    let lastUserPreview = "";
    let lastTurnId: string | null = null;
    const turnSet: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as {
          type: string;
          turnId?: string;
          payload?: { content?: string };
        };
        if (typeof obj.turnId === "string" && !seen.has(obj.turnId)) {
          turnSet.push(obj.turnId);
          seen.add(obj.turnId);
          lastTurnId = obj.turnId;
        }
        if (obj.type === "user_message" && typeof obj.payload?.content === "string") {
          lastUserPreview = truncate(obj.payload.content, PREVIEW_MAX);
        }
      } catch {
        // 坏行：忽略
      }
    }
    return { lastUserPreview, lastTurnId, observedTurns: turnSet };
  }

  private async safeListDirs(root: string): Promise<string[]> {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => join(root, e.name));
    } catch {
      return [];
    }
  }

  private async loadState(): Promise<KairosSessionsState> {
    try {
      const raw = await readFile(this.stateFile, "utf8");
      const parsed = JSON.parse(raw) as { lastSeenTurnId?: Record<string, string> };
      return { lastSeenTurnId: parsed.lastSeenTurnId ?? {} };
    } catch {
      return { lastSeenTurnId: {} };
    }
  }

  private async saveState(state: KairosSessionsState): Promise<void> {
    await mkdir(dirName(this.stateFile), { recursive: true });
    const tmp = `${this.stateFile}.tmp`;
    const text = JSON.stringify(state, null, 2);
    await writeFile(tmp, text, "utf8");
    const { rename } = await import("node:fs/promises");
    await rename(tmp, this.stateFile);
  }

  private async writeOutput(result: SessionsDigestResult): Promise<void> {
    await mkdir(dirName(this.outputFile), { recursive: true });
    const tmp = `${this.outputFile}.tmp`;
    await writeFile(tmp, JSON.stringify(result, null, 2), "utf8");
    const { rename } = await import("node:fs/promises");
    await rename(tmp, this.outputFile);
  }
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function baseName(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function dirName(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(0, idx) : ".";
}
