/**
 * Session Persistence 统一导出
 */

// 类型
export type {
  SessionStorePaths,
  JsonlParseResult,
  JsonlParseError,
  WriteResult,
  SessionRecoveryResult,
  MetaUpdateFields,
} from "./types";

// JSONL 读写
export { appendEvent, appendEvents, parseJsonl } from "./jsonl";

// Meta 管理
export { createMeta, readMeta, updateMeta, incrementTurnCount } from "./meta";

// Session Store（完整操作集合）
export {
  createSessionStorePaths,
  ensureSessionStore,
  createSessionRecord,
  setSessionPinned,
  writeSessionResult,
  writeContextState,
  readContextState,
  readSessionRecord,
  listSessionRecords,
} from "./session-store";

// 恢复
export {
  recoverSession,
  recoverMessages,
  recoverMessageBlocks,
  recoverContextSnapshot,
  recoverDiffSummary,
} from "./recovery";
