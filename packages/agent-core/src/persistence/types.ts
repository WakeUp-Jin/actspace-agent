/**
 * Session Persistence 类型定义
 */

import type {
  ContextUsageSnapshot,
  ContextState,
  SessionDiffSummary,
  SessionEvent,
  SessionId,
  SessionMeta,
} from "@actspace/shared";
import type { Message } from "../messages";

export interface SessionStorePaths {
  root: string;
  metaPath: string;
  sessionPath: string;
  contextStatePath: string;
  attachmentsDir: string;
}

/** JSONL 解析结果，包含坏行容错信息 */
export interface JsonlParseResult {
  events: SessionEvent[];
  errors: JsonlParseError[];
  totalLines: number;
}

export interface JsonlParseError {
  line: number;
  raw: string;
  error: string;
}

/** 写盘操作结果 */
export interface WriteResult {
  ok: boolean;
  error?: string;
}

/** 完整恢复结果 */
export interface SessionRecoveryResult {
  meta: SessionMeta | null;
  events: SessionEvent[];
  messages: Message[];
  contextSnapshot: ContextUsageSnapshot | null;
  contextState: ContextState | null;
  diffSummary: SessionDiffSummary | null;
  parseErrors: JsonlParseError[];
  recoveryErrors: Array<{ index: number; error: string }>;
}

/** meta.json 增量更新字段 */
export interface MetaUpdateFields {
  turnCount?: number;
  updatedAt?: string;
  title?: string;
  lastModel?: string;
  lastError?: string;
  lastContextSnapshot?: ContextUsageSnapshot;
}
