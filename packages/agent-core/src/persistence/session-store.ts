/**
 * SessionStore — 会话存储操作集合
 *
 * 整合路径管理、事件写入、meta 更新、session 列表。
 * 所有写入操作返回 WriteResult，错误不抛出。
 */

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentTurnResult,
  SessionEvent,
  SessionListItem,
  SessionRecord,
} from "@actspace/shared";
import type { SessionStorePaths, WriteResult } from "./types";
import { appendEvents } from "./jsonl";
import { createMeta, incrementTurnCount, readMeta } from "./meta";
import { recoverSession } from "./recovery";

/** 构造 session 目录路径 */
export function createSessionStorePaths(root: string): SessionStorePaths {
  return {
    root,
    metaPath: join(root, "meta.json"),
    sessionPath: join(root, "session.jsonl"),
    attachmentsDir: join(root, "attachments"),
  };
}

/** 确保 session 目录存在 */
export async function ensureSessionStore(root: string): Promise<SessionStorePaths> {
  const paths = createSessionStorePaths(root);
  await mkdir(paths.attachmentsDir, { recursive: true });
  return paths;
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
  return incrementTurnCount(paths.metaPath, model);
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
  };
}

/** 列出所有 session 摘要 */
export async function listSessionRecords(
  sessionRoot: string,
): Promise<SessionListItem[]> {
  try {
    const entries = await readdir(sessionRoot, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const items = await Promise.all(
      dirs.map(async (sessionId) => {
        const paths = createSessionStorePaths(join(sessionRoot, sessionId));
        const meta = await readMeta(paths.metaPath);
        if (!meta) return null;
        return {
          id: meta.id,
          title: meta.title,
          updatedAt: meta.updatedAt,
          turnCount: meta.turnCount,
        } satisfies SessionListItem;
      }),
    );

    return items.filter((item): item is SessionListItem => item !== null);
  } catch {
    return [];
  }
}
