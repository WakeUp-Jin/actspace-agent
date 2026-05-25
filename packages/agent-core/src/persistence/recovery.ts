/**
 * Session 恢复协调器
 *
 * 从 session.jsonl + meta.json 恢复完整会话状态：
 * 1. SessionEvent[] → Message[]（agent-core 消费，可灌入 ContextManager）
 * 2. SessionEvent[] → MessageBlock[]（renderer 消费）
 * 3. SessionEvent[] → ContextUsageSnapshot（context popup）
 * 4. SessionEvent[] → SessionDiffSummary（diff panel）
 *
 * 坏行容错：解析错误和恢复错误都收集到结果中，不中断整体流程。
 */

import {
  createMessageBlocks,
  createSessionDiffSummary,
  getLatestContextSnapshot,
} from "@actspace/shared";
import { readFile } from "node:fs/promises";
import type {
  ContextUsageSnapshot,
  MessageBlock,
  SessionDiffSummary,
  SessionEvent,
  SessionId,
  SessionMeta,
} from "@actspace/shared";
import { sessionEventsToMessages } from "../adapters";
import type { Message } from "../messages";
import { parseJsonl } from "./jsonl";
import { readMeta } from "./meta";
import type { SessionRecoveryResult, SessionStorePaths } from "./types";

/** 完整恢复一个 session */
export async function recoverSession(
  paths: SessionStorePaths,
): Promise<SessionRecoveryResult> {
  const meta = await readMeta(paths.metaPath);
  const parseResult = await parseJsonl(paths.sessionPath);
  const contextState = await readContextStateFile(paths.contextStatePath);

  const { messages, errors: recoveryErrors } = sessionEventsToMessages(parseResult.events);
  const contextSnapshot = getLatestContextSnapshot(parseResult.events);
  const diffSummary = meta
    ? createSessionDiffSummary(meta.id, parseResult.events)
    : null;

  return {
    meta,
    events: parseResult.events,
    messages,
    contextSnapshot,
    contextState,
    diffSummary,
    parseErrors: parseResult.errors,
    recoveryErrors,
  };
}

async function readContextStateFile(
  contextStatePath: string,
): Promise<import("@actspace/shared").ContextState | null> {
  try {
    const raw = await readFile(contextStatePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as import("@actspace/shared").ContextState;
  } catch {
    return null;
  }
}

/** 仅恢复 Message[]（用于灌入 ContextManager） */
export async function recoverMessages(
  sessionPath: string,
): Promise<{ messages: Message[]; errors: Array<{ index: number; error: string }> }> {
  const parseResult = await parseJsonl(sessionPath);
  return sessionEventsToMessages(parseResult.events);
}

/** 仅恢复 MessageBlock[]（用于前端渲染） */
export async function recoverMessageBlocks(
  sessionPath: string,
): Promise<MessageBlock[]> {
  const parseResult = await parseJsonl(sessionPath);
  return createMessageBlocks(parseResult.events);
}

/** 仅恢复 ContextUsageSnapshot */
export async function recoverContextSnapshot(
  sessionPath: string,
): Promise<ContextUsageSnapshot | null> {
  const parseResult = await parseJsonl(sessionPath);
  return getLatestContextSnapshot(parseResult.events);
}

/** 仅恢复 SessionDiffSummary */
export async function recoverDiffSummary(
  sessionId: SessionId,
  sessionPath: string,
): Promise<SessionDiffSummary> {
  const parseResult = await parseJsonl(sessionPath);
  return createSessionDiffSummary(sessionId, parseResult.events);
}
