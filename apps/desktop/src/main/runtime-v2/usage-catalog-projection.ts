import { prepare } from "./usage-sql";
import type { ProjectionDatabase } from "./usage-sql";
import type { SessionQuerySource } from "@actspace/session-storage";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

/** Query-only fields. No transcript, recovery state, tools or Agent context. */
export function projectQueryCatalog(db: ProjectionDatabase, descriptor: SessionQuerySource, events: readonly SessionEventEnvelopeV1[], reset: boolean) {
  const h = descriptor.header;
  const row = prepare(db, "SELECT title,workspace_root,pinned,archived,updated_at,agent_run_count,agent_mode,agent_mode_revision FROM session_catalog WHERE session_id=?").get(h.sessionId) as Record<string, string | number | null>;
  const previous = { ...row };
  if (reset) Object.assign(row, { title: null, workspace_root: h.cwd ?? null, pinned: 0, archived: 0, updated_at: new Date(h.createdAt).toISOString(), agent_run_count: 0, agent_mode: h.createdWith.initialAgentMode ?? (h.createdWith.presetId === "actspace.chat" ? "chat" : "agent"), agent_mode_revision: 0 });
  if (reset) prepare(db, "DELETE FROM session_excerpt_search WHERE session_id=?").run(h.sessionId);
  if (reset) prepare(db, "DELETE FROM catalog_pending_tasks WHERE session_id=?").run(h.sessionId);
  const excerpt = prepare(db, "INSERT INTO session_excerpt_search(session_id,event_seq,content) VALUES(?,?,?)");
  for (const event of events) {
    const node = event.surface?.node;
    // Search is explicitly over bounded excerpts, never raw tool outputs/context.
    if (node && (node.kind === "user" || node.kind === "assistant")) {
      const text = excerptText(node.content);
      if (text.trim()) excerpt.run(h.sessionId, event.seq, titleText(text, 512));
    }
    row.updated_at = new Date(event.time).toISOString();
    const data = (event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {}) as Record<string, unknown>;
    projectPendingTaskHint(db, h.sessionId, event.type, data);
    if (event.type === "session/title-set") row.title = typeof data.title === "string" ? titleText(data.title) : null;
    if (event.type === "session/workspace-set" && typeof data.workspaceRoot === "string" && data.workspaceRoot.trim()) row.workspace_root = data.workspaceRoot;
    if (event.type === "session/pinned-set" && typeof data.pinned === "boolean") row.pinned = Number(data.pinned);
    if (event.type === "session/archived-set" && typeof data.archived === "boolean") row.archived = Number(data.archived);
    if (event.type === "turn/end") row.agent_run_count = Number(row.agent_run_count) + 1;
    if (event.type === "agent/mode-set" && (data.mode === "agent" || data.mode === "chat" || data.mode === "plan") && data.revision === Number(row.agent_mode_revision) + 1) { row.agent_mode = data.mode; row.agent_mode_revision = data.revision; }
    if (event.type === "turn/start" && row.agent_mode_revision === 0 && !h.createdWith.initialAgentMode && h.createdWith.presetId !== "actspace.chat" && (data.mode === "plan" || data.mode === "agent")) row.agent_mode = data.mode;
  }
  prepare(db, "UPDATE session_catalog SET title=?,workspace_root=?,pinned=?,archived=?,updated_at=?,agent_run_count=?,agent_mode=?,agent_mode_revision=? WHERE session_id=?").run(row.title, row.workspace_root, row.pinned, row.archived, row.updated_at, row.agent_run_count, row.agent_mode, row.agent_mode_revision, h.sessionId);
  prepare(db, "UPDATE session_catalog SET has_pending_tasks=EXISTS(SELECT 1 FROM catalog_pending_tasks WHERE session_id=?) WHERE session_id=?").run(h.sessionId, h.sessionId);
  if (previous.title !== row.title) {
    prepare(db, "DELETE FROM session_search WHERE rowid IN (SELECT rowid FROM session_catalog WHERE session_id=?)").run(h.sessionId);
    prepare(db, "INSERT INTO session_search(rowid,session_id,content) SELECT rowid,session_id,COALESCE(title,'') FROM session_catalog WHERE session_id=?").run(h.sessionId);
    prepare(db, "UPDATE usage_activity SET session_title=?,row_json=CASE WHEN ? IS NULL THEN json_remove(row_json,'$.sessionTitle') ELSE json_set(row_json,'$.sessionTitle',?) END WHERE session_id=?").run(row.title, row.title, row.title, h.sessionId);
  }
  if (previous.workspace_root !== row.workspace_root) prepare(db, "UPDATE usage_activity SET workspace_root=?,row_json=CASE WHEN ? IS NULL THEN json_remove(row_json,'$.workspaceRoot') ELSE json_set(row_json,'$.workspaceRoot',?) END WHERE session_id=?").run(row.workspace_root, row.workspace_root, row.workspace_root, h.sessionId);
  return { title: row.title as string | null, workspaceRoot: row.workspace_root as string | null };
}

/** Only identity/state for sidebar admission; no task content or executable state. */
function projectPendingTaskHint(db: ProjectionDatabase, sessionId: string, type: string, data: Record<string, unknown>): void {
  // Forked tasks retain their original Session id and must not trigger recovery.
  if (data.sessionId !== sessionId) return;
  if (type === "plugin/actspace.agent-service/task" && typeof data.taskId === "string") {
    if (data.op === "accept") prepare(db, "INSERT OR IGNORE INTO catalog_pending_tasks VALUES(?,?,NULL,'pending')").run(sessionId, data.taskId);
    if (data.op === "claim" || data.op === "operation-start") prepare(db, "UPDATE catalog_pending_tasks SET state='claimed',run_id=? WHERE session_id=? AND task_id=?").run(typeof data.runId === "string" ? data.runId : null, sessionId, data.taskId);
    if (data.op === "cancel" || data.op === "operation-finish") prepare(db, "DELETE FROM catalog_pending_tasks WHERE session_id=? AND task_id=?").run(sessionId, data.taskId);
  }
  if (type === "plugin/actspace.agent-service/run" && data.op === "finish" && typeof data.runId === "string") prepare(db, "DELETE FROM catalog_pending_tasks WHERE session_id=? AND run_id=?").run(sessionId, data.runId);
  if (type === "plugin/actspace.agent-service/queue" && data.op === "recover") prepare(db, "DELETE FROM catalog_pending_tasks WHERE session_id=? AND state='claimed'").run(sessionId);
}
// Matches the Runtime's display-title redaction, including its 160-char limit.
export function titleText(value: string, limit = 160): string {
  const text = value.replace(/\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]").replace(/(?:file:\/\/|\/Users\/|\/home\/|[A-Za-z]:\\)[^\s"']+/g, "[PATH]");
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function excerptText(content: unknown): string {
  if (typeof content === "string") return content.slice(0, 512);
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") text += part.text.slice(0, 512 - text.length);
    if (text.length >= 512) break;
  }
  return text;
}
