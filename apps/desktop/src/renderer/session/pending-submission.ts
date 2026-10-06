import type { ComposerDraftRestore } from "../components/Composer";

// 已提交、Runtime 尚未确认的消息（14 S10，02 §6 第 1 条）。本地与远端会话统一存 localStorage，跨重启保留。
// 记录在提交前写入；确认收到或明确被拒绝后清除；结果未知（unknown）时保留，下次激活会话时恢复为草稿，永不自动重发。
// main 进程有同名概念 `PendingSubmission`（remote-hosts），含义不同，这里叫 PendingSubmissionRecord。

const KEY_PREFIX = "actspace:pending-submission:";
export const PENDING_SUBMISSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 恢复为草稿用的内容；附件去掉了 previewUrl（blob URL 跨重启无效）。 */
export type PendingSubmissionDraft = Pick<ComposerDraftRestore, "sessionId" | "text" | "attachments" | "fileReferences" | "responseAnnotations">;

export type PendingSubmissionRecord = {
  /** 序列化后的提交内容：再次发送相同内容时复用同一个 submissionId，让 Runtime 去重。 */
  readonly content: string;
  /** submissionId。 */
  readonly id: string;
  readonly draft: PendingSubmissionDraft;
  readonly createdAt: string;
};

const keyFor = (sessionId: string) => `${KEY_PREFIX}${sessionId}`;

function parse(sessionId: string, raw: string | null): PendingSubmissionRecord | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingSubmissionRecord> | null;
    if (!value || typeof value.content !== "string" || typeof value.id !== "string") return null;
    if (!value.draft || value.draft.sessionId !== sessionId || typeof value.draft.text !== "string") return null;
    return value as PendingSubmissionRecord;
  } catch {
    return null;
  }
}

/** 读不到、格式不对或不属于这个会话时返回 null。 */
export function readPendingSubmission(sessionId: string): PendingSubmissionRecord | null {
  try { return parse(sessionId, localStorage.getItem(keyFor(sessionId))); } catch { return null; }
}

export function writePendingSubmission(sessionId: string, record: Omit<PendingSubmissionRecord, "createdAt">, now = new Date()): void {
  try { localStorage.setItem(keyFor(sessionId), JSON.stringify({ ...record, createdAt: now.toISOString() })); }
  catch (error) { console.error("Failed to record pending submission", error); }
}

export function clearPendingSubmission(sessionId: string): void {
  try { localStorage.removeItem(keyFor(sessionId)); } catch { /* storage unavailable */ }
}

/**
 * 启动时清理：超过 7 天的记录、无法解析的记录删除。
 * 没有 createdAt 的旧格式记录（本计划之前写入）补上当前时间，从现在起算 7 天，不直接丢掉未确认的草稿。
 */
export function sweepExpiredPendingSubmissions(now = Date.now()): void {
  let keys: string[];
  try { keys = Object.keys(localStorage).filter((key) => key.startsWith(KEY_PREFIX)); } catch { return; }
  for (const key of keys) {
    const record = parse(key.slice(KEY_PREFIX.length), localStorage.getItem(key));
    if (!record) { localStorage.removeItem(key); continue; }
    const created = Date.parse(record.createdAt);
    if (record.createdAt === undefined || Number.isNaN(created)) localStorage.setItem(key, JSON.stringify({ ...record, createdAt: new Date(now).toISOString() }));
    else if (now - created > PENDING_SUBMISSION_TTL_MS) localStorage.removeItem(key);
  }
}
