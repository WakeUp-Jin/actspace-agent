/**
 * meta.json 管理
 *
 * 支持创建和增量更新。
 * 增量更新只修改指定字段，保留其他字段不变。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SessionId, SessionMeta, SessionWorktreeContext } from "@actspace/shared";
import type { MetaUpdateFields, WriteResult } from "./types";

/** 创建初始 meta.json */
export async function createMeta(
  metaPath: string,
  sessionId: SessionId,
  title?: string,
  options: { workspaceId?: string; workspaceRoot?: string; worktree?: SessionWorktreeContext } = {},
): Promise<WriteResult> {
  const now = new Date().toISOString();
  const meta: SessionMeta = {
    schemaVersion: 2,
    id: sessionId,
    title: title ?? `Session ${sessionId}`,
    createdAt: now,
    updatedAt: now,
    agentRunCount: 0,
    ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    ...(options.workspaceRoot ? { workspaceRoot: options.workspaceRoot } : {}),
    ...(options.worktree ? { worktree: options.worktree } : {}),
    pinned: false,
  };

  return writeMeta(metaPath, meta);
}

/** 读取 meta.json */
export async function readMeta(metaPath: string): Promise<SessionMeta | null> {
  try {
    const raw = await readFile(metaPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SessionMeta>;
    if (
      parsed.schemaVersion !== 2 ||
      typeof parsed.id !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.agentRunCount !== "number"
    ) {
      return null;
    }
    return parsed as SessionMeta;
  } catch {
    return null;
  }
}

/** 增量更新 meta.json：只修改指定字段 */
export async function updateMeta(
  metaPath: string,
  fields: MetaUpdateFields,
): Promise<WriteResult> {
  const existing = await readMeta(metaPath);
  if (!existing) {
    return { ok: false, error: `meta.json not found at ${metaPath}` };
  }

  const updated: SessionMeta & Record<string, unknown> = { ...existing };

  if (fields.agentRunCount !== undefined) updated.agentRunCount = fields.agentRunCount;
  if (fields.updatedAt !== undefined) updated.updatedAt = fields.updatedAt;
  if (fields.title !== undefined) updated.title = fields.title;
  if (fields.workspaceId !== undefined) updated.workspaceId = fields.workspaceId;
  if (fields.workspaceRoot !== undefined) updated.workspaceRoot = fields.workspaceRoot;
  if (fields.worktree !== undefined) {
    if (fields.worktree === null) delete updated.worktree;
    else updated.worktree = fields.worktree;
  }
  if (fields.pinned !== undefined) updated.pinned = fields.pinned;
  if (fields.archived !== undefined) updated.archived = fields.archived;
  if (fields.lastModel !== undefined) (updated as Record<string, unknown>).lastModel = fields.lastModel;
  if (fields.lastError !== undefined) (updated as Record<string, unknown>).lastError = fields.lastError;
  if (fields.lastContextSnapshot !== undefined) {
    (updated as Record<string, unknown>).lastContextSnapshot = fields.lastContextSnapshot;
  }

  return writeMeta(metaPath, updated);
}

/** 递增 agentRunCount 并更新 updatedAt */
export async function incrementAgentRunCount(
  metaPath: string,
  lastModel?: string,
): Promise<WriteResult> {
  const existing = await readMeta(metaPath);
  if (!existing) {
    return { ok: false, error: `meta.json not found at ${metaPath}` };
  }

  return updateMeta(metaPath, {
    agentRunCount: existing.agentRunCount + 1,
    updatedAt: new Date().toISOString(),
    lastModel,
  });
}

/** 写入完整 meta（内部使用） */
async function writeMeta(metaPath: string, meta: unknown): Promise<WriteResult> {
  try {
    await mkdir(dirname(metaPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify(meta, null, 2));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to write meta.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
