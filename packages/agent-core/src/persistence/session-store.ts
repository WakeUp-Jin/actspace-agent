/**
 * SessionStore — 会话存储操作集合
 *
 * 整合路径管理、事件写入、meta 更新、session 列表。
 * 所有写入操作返回 WriteResult，错误不抛出。
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentTurnResult,
  ContextState,
  SessionCreateInput,
  SessionListInput,
  SessionListItem,
  SessionRecord,
} from "@actspace/shared";
import type { SessionStorePaths, WriteResult } from "./types";
import { appendEvents } from "./jsonl";
import { createMeta, incrementTurnCount, readMeta, updateMeta } from "./meta";
import { recoverSession } from "./recovery";

/** 构造 session 目录路径 */
export function createSessionStorePaths(root: string): SessionStorePaths {
  return {
    root,
    metaPath: join(root, "meta.json"),
    sessionPath: join(root, "session.jsonl"),
    contextStatePath: join(root, "context-state.json"),
    attachmentsDir: join(root, "attachments"),
  };
}

/** 确保 session 目录存在 */
export async function ensureSessionStore(root: string): Promise<SessionStorePaths> {
  const paths = createSessionStorePaths(root);
  await mkdir(paths.attachmentsDir, { recursive: true });
  return paths;
}

/** 创建一个空 session，并立即写入 meta.json */
export async function createSessionRecord(
  sessionRoot: string,
  input: SessionCreateInput = {},
): Promise<SessionRecord> {
  const sessionId = createSessionId();
  const paths = await ensureSessionStore(join(sessionRoot, sessionId));
  const title = input.title?.trim() || "New chat";
  const result = await createMeta(paths.metaPath, sessionId, title, {
    workspaceRoot: input.workspaceRoot,
  });
  if (!result.ok) {
    throw new Error(result.error ?? "Failed to create session");
  }
  await writeFile(paths.sessionPath, "", { flag: "a" });

  const record = await readSessionRecord(paths);
  if (!record) {
    throw new Error(`Failed to read created session: ${sessionId}`);
  }
  return record;
}

/** 更新 session 的 pinned 状态 */
export async function setSessionPinned(
  sessionRoot: string,
  sessionId: string,
  pinned: boolean,
): Promise<WriteResult> {
  const paths = createSessionStorePaths(join(sessionRoot, sessionId));
  return updateMeta(paths.metaPath, { pinned });
}

/** 更新 session 的 archived 状态 */
export async function setSessionArchived(
  sessionRoot: string,
  sessionId: string,
  archived: boolean,
): Promise<WriteResult> {
  const paths = createSessionStorePaths(join(sessionRoot, sessionId));
  return updateMeta(paths.metaPath, { archived });
}

/** 更新 session 归属的 workspace 根目录 */
export async function setSessionWorkspace(
  sessionRoot: string,
  sessionId: string,
  workspaceRoot: string,
): Promise<WriteResult> {
  const trimmed = workspaceRoot.trim();
  if (!trimmed) {
    return { ok: false, error: "workspaceRoot is required" };
  }

  const paths = createSessionStorePaths(join(sessionRoot, sessionId));
  return updateMeta(paths.metaPath, { workspaceRoot: trimmed });
}

/** 写入一轮完整的 turn 结果（events + meta 更新） */
export async function writeSessionResult(
  paths: SessionStorePaths,
  result: AgentTurnResult,
): Promise<WriteResult> {
  await ensureSessionStore(paths.root);

  // 写入事件
  const writeResult = await appendEvents(paths.sessionPath, result.events);
  if (!writeResult.ok) return writeResult;

  // 确保 meta 存在
  const existingMeta = await readMeta(paths.metaPath);
  if (!existingMeta) {
    const createResult = await createMeta(paths.metaPath, result.sessionId);
    if (!createResult.ok) return createResult;
  }

  // 增量更新 meta
  const model = result.finalReply?.model;
  const metaResult = await incrementTurnCount(paths.metaPath, model);
  if (!metaResult.ok) return metaResult;

  if (result.contextState) {
    return writeContextState(paths, result.contextState);
  }

  return metaResult;
}

export async function writeContextState(
  paths: SessionStorePaths,
  state: ContextState,
): Promise<WriteResult> {
  try {
    await ensureSessionStore(paths.root);
    await writeFile(paths.contextStatePath, JSON.stringify(state, null, 2));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to write context-state.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function readContextState(
  paths: SessionStorePaths,
): Promise<ContextState | null> {
  try {
    const raw = await readFile(paths.contextStatePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ContextState;
  } catch {
    return null;
  }
}

/** 读取完整 session record（meta + events） */
export async function readSessionRecord(
  paths: SessionStorePaths,
): Promise<SessionRecord | null> {
  const recovery = await recoverSession(paths);
  if (!recovery.meta) return null;

  return {
    meta: recovery.meta,
    events: recovery.events,
    contextState: recovery.contextState,
  };
}

/** 列出所有 session 摘要 */
export async function listSessionRecords(
  sessionRoot: string,
  input: SessionListInput = {},
): Promise<SessionListItem[]> {
  try {
    const entries = await readdir(sessionRoot, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const includeArchived = input.archived === true;

    const items = await Promise.all(
      dirs.map(async (sessionId) => {
        const paths = createSessionStorePaths(join(sessionRoot, sessionId));
        const meta = await readMeta(paths.metaPath);
        if (!meta) return null;
        if (Boolean(meta.archived) !== includeArchived) return null;
        const item: SessionListItem = {
          id: meta.id,
          title: meta.title,
          updatedAt: meta.updatedAt,
          turnCount: meta.turnCount,
        };
        if (meta.workspaceRoot) item.workspaceRoot = meta.workspaceRoot;
        if (meta.pinned) item.pinned = true;
        if (meta.archived) item.archived = true;
        return item;
      }),
    );

    return items.filter((item): item is SessionListItem => item !== null);
  } catch {
    return [];
  }
}

function createSessionId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `session-${Date.now().toString(36)}-${random}`;
}
