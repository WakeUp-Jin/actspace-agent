import { createHash } from "node:crypto";
import { dirname } from "node:path";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import {
  HARNESS_ACTIVE_PATH_LIMIT, HARNESS_DURATION_BASE_MS, HARNESS_INDEX_CONVERSION_STEPS, HARNESS_REREAD_WINDOW_STEPS, HARNESS_TOKEN_BASE,
  harnessHistogramIndex, harnessRevisionKey, HARNESS_UNKNOWN_REVISION,
} from "@actspace/shared";
import { prepare, type ProjectionDatabase } from "./usage-sql";
import { HarnessAccumulator, harnessHistogramPoint, HARNESS_SLEEP_BUCKETS, HARNESS_STATE_TABLE, HARNESS_TABLES } from "./harness-stats-schema";

/**
 * 把会话日志投影成 Harness 统计。只读事件的元数据（名字、状态、时间、token 估算、路径），
 * 不保存参数、输出和对话内容。跨批次的关联状态存在 harness_session_state，与汇总行同一事务提交。
 */
type Json = Record<string, unknown>;
const record = (value: unknown): Json => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown): string | undefined => typeof value === "string" && value ? value : undefined;
const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

type Dims = { hour: string; revision: string; mode: string; model: string };
type PendingCall = Dims & { tool: string; pluginId: string | null; turnId: string | null; at: string; runStartAt?: string; requestedAt?: string; escalation: boolean; ranged?: boolean };
type DisclosurePath = { v: "a" | "s"; sleptAt?: number; reads: number; woke?: boolean };
type State = {
  v: 1;
  steps: number; turns: number;
  revision: string; mode: string; model: string;
  runs: Record<string, string>;
  activeRuns: string[];
  turns_: Record<string, { rev: string; mode: string; steps: number }>;
  turnOfRun: Record<string, string>;
  requests: Record<string, Dims>;
  requestOrder: string[];
  calls: Record<string, PendingCall>;
  recentCalls: Record<string, Dims & { tool: string }>;
  recentOrder: string[];
  turnDigests: Record<string, string[]>;
  turnFailed: Record<string, string | null>;
  permissionCalls: Record<string, { callId: string; requestedAt: string }>;
  entries: Record<string, number>;
  skills: Record<string, { location: string; source: string | null }>;
  disclosure: { cycle: number; paths: Record<string, DisclosurePath>; indexPaths: string[]; conversionSteps: number; converted: boolean };
  compaction: { lastStep: number; lastTurn: number; windowRatio: number | null; readSince: string[]; pending: { id: string; before: string[]; found: string[]; steps: number } | null; open: Record<string, Dims & { time: string }> };
  tasks: Record<string, string>;
};

function emptyState(): State {
  return {
    v: 1, steps: 0, turns: 0, revision: HARNESS_UNKNOWN_REVISION, mode: "", model: "",
    runs: {}, activeRuns: [], turns_: {}, turnOfRun: {}, requests: {}, requestOrder: [], calls: {}, recentCalls: {}, recentOrder: [],
    turnDigests: {}, turnFailed: {}, permissionCalls: {}, entries: {}, skills: {},
    disclosure: { cycle: 0, paths: {}, indexPaths: [], conversionSteps: 0, converted: false },
    compaction: { lastStep: 0, lastTurn: 0, windowRatio: null, readSince: [], pending: null, open: {} },
    tasks: {},
  };
}

const MAX_TRACKED = 2_000;
const TRUNCATION_MARKERS = ["[Output truncated", "[Showing lines", "[Showing first", "[Content truncated", "[Visual report truncated", "...[truncated]"];
const CONVERSATION_KINDS = new Set(["message", "tool-call", "tool-result", "thinking"]);
const KIND_OF: Record<string, string> = { tool: "tools", skill: "skills", section: "section", supplement: "supplement", "model-facts": "model-facts" };

export function hourOf(time: string): string {
  const value = Date.parse(time);
  return Number.isFinite(value) ? new Date(value - (value % 3_600_000)).toISOString().slice(0, 13) : "unknown";
}
const tokensOf = (chars: number) => Math.ceil(chars / 4);

export function clearHarnessSession(db: ProjectionDatabase, sessionId: string): void {
  prepare(db, `DELETE FROM ${HARNESS_STATE_TABLE} WHERE session_id=?`).run(sessionId);
}

/** 增量投影一个批次；已处理过的 seq 会被跳过，所以重复投递同一批次是安全的。 */
export function projectHarnessJournalBatch(db: ProjectionDatabase, sessionId: string, events: readonly SessionEventEnvelopeV1[]): void {
  const saved = prepare(db, `SELECT last_seq,state_json FROM ${HARNESS_STATE_TABLE} WHERE session_id=?`).get(sessionId) as { last_seq: number; state_json: string } | undefined;
  let state: State;
  try { state = saved ? { ...emptyState(), ...JSON.parse(saved.state_json) as State } : emptyState(); } catch { state = emptyState(); }
  let lastSeq = saved?.last_seq ?? -1;
  const fresh = events.filter(event => event.seq > lastSeq);
  if (!fresh.length) return;
  const acc = new HarnessAccumulator();
  const replay = new HarnessReplay(db, sessionId, state, acc);
  for (const event of fresh) { replay.apply(event); lastSeq = event.seq; }
  acc.flush(db);
  prepare(db, `INSERT INTO ${HARNESS_STATE_TABLE}(session_id,last_seq,state_json) VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET last_seq=excluded.last_seq,state_json=excluded.state_json`).run(sessionId, lastSeq, JSON.stringify(state));
}

class HarnessReplay {
  constructor(private readonly db: ProjectionDatabase, private readonly sessionId: string, private readonly s: State, private readonly acc: HarnessAccumulator) {}

  apply(event: SessionEventEnvelopeV1): void {
    const data = record(event.data);
    const owner = text(event.source?.ownerPluginId);
    if (owner) this.add("owner", this.dims(event), { owner }, { events: 1 });
    switch (event.type) {
      case "plugin/actspace.agent-service/run": return this.run(event, data);
      case "plugin/actspace.agent-service/task": return this.task(event, data);
      case "plugin/actspace.agent-service/queue-return": if (data.op === "return-steering") this.add("session", this.dims(event), {}, { steering: 1 }); return;
      case "agent/inbox/spliced": if (data.operation === "enqueue" && (data.source === "steer" || record(data.source).kind === "steer")) this.add("session", this.dims(event), {}, { steering: 1 }); return;
      case "agent/mode-set": { const mode = text(data.mode); if (mode) this.s.mode = mode; this.add("session", this.dims(event), {}, { mode_switches: 1 }); return; }
      case "turn/start": return this.turnStart(data);
      case "turn/end": return this.turnEnd(event, data);
      case "step/start": return this.step();
      case "request/header": return this.requestHeader(event, data);
      case "request/context": return this.requestContext(event, data);
      case "assistant/message": return this.assistant(data);
      case "llm/retry": { const code = text(record(data.failure).code) ?? "unknown"; this.add("session", this.dims(event, text(data.requestId)), {}, { retries: 1, retry_codes: { [code]: 1 } }); return; }
      case "llm/auxiliary-end": return this.auxiliary(event, data);
      case "tool/call": return this.toolCall(event, data);
      case "tool-workflow/run-start": { const call = this.s.calls[text(data.callId) ?? ""]; if (call) call.runStartAt = event.time; return; }
      case "tool/result": return this.toolResult(event, data);
      case "permission/asked": return this.permissionAsked(event, data);
      case "permission/decided": return this.permissionDecided(event, data);
      case "permission/grant-used": return this.callMetric(text(data.callId), { approval_session_grant: 1 });
      case "permission/scope-denied": return this.callMetric(text(data.callId), { approval_scope_denied: 1 });
      case "plugin/actspace.context/state": return this.disclosure(event, data);
      case "compaction/start": { const id = text(data.compactionId); if (id) this.s.compaction.open[id] = { ...this.dims(event), time: event.time }; return; }
      case "surface/replaced": return this.folded(data);
      case "compaction/end": return this.compactionEnd(event, data);
      case "delegation/requested": case "delegation/completed": case "delegation/child-terminal": return this.delegation(event, data);
      case "background/task": return this.background(event, data);
    }
  }

  private add(table: Parameters<HarnessAccumulator["add"]>[0], dims: Dims, key: Record<string, string | number>, values: Record<string, unknown>): void {
    // 维度表（按小时等聚合）把维度当主键；按 id 存的表（轮次、压缩……）把维度写成普通列，未知时不覆盖已有值。
    const dimensional = (HARNESS_TABLES[table].keys as readonly string[]).includes("hour");
    this.acc.add(table, this.sessionId, dimensional ? { ...dims, ...key } : key, dimensional || dims.hour === "unknown" ? values : { ...dims, ...values });
  }
  private dims(event: SessionEventEnvelopeV1, requestId?: string): Dims {
    const request = requestId ? this.s.requests[requestId] : undefined;
    return request ? { ...request, hour: hourOf(event.time) } : { hour: hourOf(event.time), revision: this.s.revision, mode: this.s.mode, model: this.s.model };
  }

  /* ----------------------------- Agent 循环 ----------------------------- */

  private run(_event: SessionEventEnvelopeV1, data: Json): void {
    const runId = text(data.runId); if (!runId) return;
    if (data.op === "start") {
      const harness = record(data.harness);
      const revision = harnessRevisionKey(text(harness.harnessId), num(harness.revision));
      this.s.runs[runId] = revision; this.s.revision = revision;
      if (!this.s.activeRuns.includes(runId)) this.s.activeRuns.push(runId);
      const configuration = record(data.configuration);
      const model = text(configuration.model); if (model && !this.s.model) this.s.model = model;
      for (const skillId of list(configuration.selectedSkillIds)) if (typeof skillId === "string") this.add("skill", this.dims(_event), { skill_id: skillId }, { selected: 1 });
      trim(this.s.runs, 200);
    }
    if (data.op === "finish") this.s.activeRuns = this.s.activeRuns.filter(id => id !== runId);
  }
  private task(event: SessionEventEnvelopeV1, data: Json): void {
    if (data.op === "accept" && this.s.activeRuns.length) this.add("session", this.dims(event), {}, { queued: 1 });
  }
  private turnStart(data: Json): void {
    const turnId = text(data.turnId); if (!turnId) return;
    const runId = text(data.agentRunId);
    const rev = runId ? this.s.runs[runId] ?? this.s.revision : this.s.revision;
    const mode = text(data.mode) ?? this.s.mode;
    if (mode) this.s.mode = mode;
    this.s.turns_[turnId] = { rev, mode, steps: 0 };
    this.s.turns++;
    trim(this.s.turns_, 50);
  }
  private turnEnd(event: SessionEventEnvelopeV1, data: Json): void {
    const turnId = text(data.turnId); if (!turnId) return;
    const turn = this.s.turns_[turnId];
    const reason = normalizeReason(text(data.reason));
    this.add("turn", { hour: hourOf(event.time), revision: turn?.rev ?? this.s.revision, mode: turn?.mode ?? this.s.mode, model: this.s.model }, { turn_id: turnId }, { time: event.time, steps: turn?.steps ?? 0, reason });
    delete this.s.turns_[turnId]; delete this.s.turnDigests[turnId]; delete this.s.turnFailed[turnId];
  }
  private step(): void {
    this.s.steps++;
    for (const turn of Object.values(this.s.turns_)) turn.steps++;
    const d = this.s.disclosure;
    if (d.conversionSteps > 0) d.conversionSteps--;
    const pending = this.s.compaction.pending;
    if (pending && --pending.steps <= 0) this.finishReread();
  }
  private finishReread(): void {
    const pending = this.s.compaction.pending; if (!pending) return;
    delete this.s.compaction.open[pending.id];
    this.s.compaction.pending = null;
  }

  /* ------------------------------ 模型请求 ------------------------------ */

  private requestHeader(event: SessionEventEnvelopeV1, data: Json): void {
    const requestId = text(data.requestId); if (!requestId) return;
    const turn = this.s.turns_[text(data.turnId) ?? ""];
    const mode = text(data.agentMode) ?? turn?.mode ?? this.s.mode;
    const model = text(data.model) ?? this.s.model;
    if (mode) this.s.mode = mode; if (model) this.s.model = model;
    const dims = { hour: hourOf(event.time), revision: turn?.rev ?? this.s.revision, mode, model };
    this.s.requests[requestId] = dims;
    this.s.requestOrder.push(requestId);
    while (this.s.requestOrder.length > 64) delete this.s.requests[this.s.requestOrder.shift()!];
    this.add("request", dims, { request_id: requestId }, { ...dims, time: event.time, context_window: num(data.contextWindow) ?? null });
    this.add("session", dims, {}, { requests: 1 });
  }
  private requestContext(event: SessionEventEnvelopeV1, data: Json): void {
    const requestId = text(data.requestId); if (!requestId) return;
    const dims = this.s.requests[requestId] ?? this.dims(event);
    const snapshot = record(data.snapshot);
    const manifest = record(snapshot.contextManifest);
    const entries = list(manifest.entries).map(record);
    const comparable = manifest.comparable !== false && entries.length > 0;
    const buckets = record(manifest.buckets);
    const window = num(record(snapshot.contextModel).contextWindow);
    const estimated = num(manifest.totalEstimatedTokens);
    this.add("request", dims, { request_id: requestId }, {
      estimated: estimated ?? null, has_manifest: comparable ? 1 : 0, ...(window ? { context_window: window } : {}),
      b_system: num(buckets.systemPrompt) ?? 0, b_tools: num(buckets.tools) ?? 0, b_rules: num(buckets.rules) ?? 0, b_skills: num(buckets.skills) ?? 0,
      b_summarized: num(buckets.summarizedConversation) ?? 0, b_conversation: num(buckets.conversation) ?? 0,
    });
    if (estimated && window) this.s.compaction.windowRatio = estimated / window;
    // 技能目录：位置用于判断“读了 SKILL.md / 附属文件”。
    for (const fact of list(snapshot.contextModelFacts).map(record)) {
      if (fact.id !== "core/skills-catalog") continue;
      for (const skill of list(fact.content).map(record)) {
        const id = text(skill.id); const location = text(skill.location);
        if (id && location) this.s.skills[id] = { location, source: text(skill.source) ?? null };
      }
    }
    const schemaTokens = new Map<string, number>();
    if (comparable) for (const entry of entries) {
      let key: unknown[]; try { key = JSON.parse(String(entry.key)) as unknown[]; } catch { continue; }
      const kind = String(key[0] ?? "");
      if (CONVERSATION_KINDS.has(kind)) continue;
      const tokens = num(entry.estimatedTokens) ?? 0;
      const entryKey = String(entry.key);
      const previous = this.s.entries[entryKey];
      const id = kind === "tool" ? String(key[2] ?? "") : kind === "skill" ? String(key[3] ?? key[2] ?? "") : String(key[2] ?? key[1] ?? kind);
      this.add("entry", dims, { entry_key: entryKey }, {
        kind: KIND_OF[kind] ?? "other", bucket: text(entry.bucket) ?? null, owner: kind === "tool" || kind === "model-facts" ? null : text(key[1]) ?? null, entry_id: id,
        appearances: 1, tokens, max_tokens: tokens, compared: previous === undefined ? 0 : 1, changes: previous !== undefined && previous !== tokens ? 1 : 0,
      });
      this.s.entries[entryKey] = tokens;
      if (kind === "tool") schemaTokens.set(id, tokens);
      if (kind === "skill") this.add("skill", dims, { skill_id: id }, { listed: 1, source: this.s.skills[id]?.source ?? null });
    }
    trim(this.s.entries, 1_000);
    for (const tool of list(snapshot.tools).map(record)) {
      const name = text(tool.name); if (!name) continue;
      const tokens = schemaTokens.get(name);
      this.add("tool", dims, { tool: name }, { exposures: 1, ...(tokens === undefined ? {} : { schema_tokens: tokens, schema_samples: 1 }) });
    }
  }
  private assistant(data: Json): void {
    const requestId = text(data.requestId); const dims = requestId ? this.s.requests[requestId] : undefined;
    if (!requestId || !dims) return;
    const usage = record(data.usage);
    this.add("request", dims, { request_id: requestId }, { input_tokens: num(usage.inputTokens) ?? null, cache_read: num(usage.cacheReadTokens) ?? null, cache_write: num(usage.cacheWriteTokens) ?? null });
  }
  private auxiliary(event: SessionEventEnvelopeV1, data: Json): void {
    const purpose = text(data.purpose) ?? "unknown";
    const started = Date.parse(text(data.startedAt) ?? ""); const finished = Date.parse(text(data.finishedAt) ?? "");
    const failed = data.status !== "completed";
    this.add("aux", this.dims(event), { purpose }, { calls: 1, failed: failed ? 1 : 0, total_ms: Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : 0 });
    if (purpose === "compaction" && failed) {
      const id = text(data.logicalRequestId) ?? text(data.attemptId) ?? `aux-${event.seq}`;
      this.add("compaction", this.dims(event), { compaction_id: `failed:${id}` }, { time: event.time, ok: 0, failure_code: text(record(data.failure).code) ?? String(data.status ?? "failed"), trigger: "unknown" });
    }
  }

  /* -------------------------------- 工具 -------------------------------- */

  private toolCall(event: SessionEventEnvelopeV1, data: Json): void {
    const callId = text(data.callId); const tool = text(data.name); if (!callId || !tool) return;
    const dims = this.dims(event, text(data.requestId));
    const turnId = text(data.turnId) ?? null;
    const args = record(data.args);
    const escalation = args.sandbox_permissions === "require_escalated";
    // 模型自己给了 offset/limit 的分段读取不算截断。
    const ranged = args.offset !== undefined || args.limit !== undefined;
    this.s.calls[callId] = { ...dims, tool, pluginId: text(data.pluginId) ?? null, turnId, at: event.time, escalation, ...(ranged ? { ranged } : {}) };
    trim(this.s.calls, 200);
    const values: Record<string, unknown> = { calls: 1, last_used_at: event.time, plugin_id: text(data.pluginId) ?? null, escalations: escalation ? 1 : 0 };
    if (turnId) {
      const digest = createHash("sha1").update(tool).update("\0").update(stableJson(args)).digest("base64").slice(0, 16);
      const seen = this.s.turnDigests[turnId] ??= [];
      if (seen.includes(digest)) values.repeated = 1; else if (seen.length < 500) seen.push(digest);
      if (this.s.turnFailed[turnId] === tool) values.retried = 1;
      this.s.turnFailed[turnId] = null;
    }
    this.add("tool", dims, { tool }, values);
    if (tool === "plugin_manager") this.add("evolution", dims, { call_id: callId }, { time: event.time, action: text(args.action) ?? "unknown", target: text(args.pluginId) ?? text(args.id) ?? text(args.name) ?? null, status: "running" });
    if (tool === "task_output" || tool === "task_wait") {
      const taskId = text(args.taskId);
      if (taskId) this.acc.add("background", this.sessionId, { task_id: taskId }, { read: 1 });
    }
  }
  private toolResult(event: SessionEventEnvelopeV1, data: Json): void {
    const callId = text(data.callId); if (!callId) return;
    const call = this.s.calls[callId];
    const tool = call?.tool ?? text(data.name); if (!tool) return;
    const dims: Dims = call ? { hour: call.hour, revision: call.revision, mode: call.mode, model: call.model } : this.dims(event);
    const status = text(data.status) ?? "unknown";
    const failure = record(data.failure);
    const output = list(data.modelOutput).map(record).filter(part => part.type === "text").map(part => String(part.text ?? "")).join("");
    const outputTokens = tokensOf(output.length);
    const startAt = Date.parse(call?.runStartAt ?? call?.at ?? ""); const endAt = Date.parse(event.time);
    const duration = Number.isFinite(startAt) && Number.isFinite(endAt) ? Math.max(0, endAt - startAt) : undefined;
    const values: Record<string, unknown> = {
      completed: status === "completed" ? 1 : 0, failed: status === "failed" ? 1 : 0, denied: status === "denied" ? 1 : 0,
      aborted: status === "aborted" || status === "cancelled" ? 1 : 0, unknown_outcome: ["completed", "failed", "denied", "aborted", "cancelled"].includes(status) ? 0 : 1,
      output_tokens: outputTokens, output_samples: 1, output_hist: harnessHistogramPoint(harnessHistogramIndex(outputTokens, HARNESS_TOKEN_BASE)),
      truncated: !call?.ranged && TRUNCATION_MARKERS.some(marker => output.includes(marker)) ? 1 : 0, plugin_id: text(data.pluginId) ?? call?.pluginId ?? null,
    };
    if (duration !== undefined) values.duration_hist = harnessHistogramPoint(harnessHistogramIndex(duration, HARNESS_DURATION_BASE_MS));
    if (status === "failed" || status === "denied") values.failure_codes = { [text(failure.code) ?? status]: 1 };
    const approvalMode = text(data.approvalMode); const approvalReason = text(data.approvalReason) ?? "";
    if (approvalMode === "auto") values.approval_auto_approved = 1;
    if (approvalMode === "manual" && approvalReason.startsWith("自动审批未允许")) values.approval_auto_declined = 1;
    for (const detail of list(data.detail).map(record)) {
      const value = record(detail.value);
      if (detail.label === "environment" && typeof value.sandboxed === "boolean") values[value.sandboxed ? "sandboxed" : "unsandboxed"] = 1;
      if (detail.label === "actspace.context.file" && value.kind === "file" && value.operation === "read" && typeof value.path === "string") this.fileRead(event, dims, value.path);
    }
    if (tool === "bash" && values.sandboxed === undefined && values.unsandboxed === undefined) values.unknown_env = 1;
    if (status === "failed" && call?.turnId) this.s.turnFailed[call.turnId] = tool;
    this.add("tool", dims, { tool }, values);
    this.acc.add("output", this.sessionId, { seq: event.seq }, { ...dims, tool, tokens: outputTokens });
    if (tool === "plugin_manager") this.add("evolution", dims, { call_id: callId }, { status });
    delete this.s.calls[callId];
    this.s.recentCalls[callId] = { ...dims, tool }; this.s.recentOrder.push(callId);
    while (this.s.recentOrder.length > 200) delete this.s.recentCalls[this.s.recentOrder.shift()!];
  }
  private callMetric(callId: string | undefined, values: Record<string, unknown>): void {
    const call = callId ? this.s.calls[callId] ?? this.s.recentCalls[callId] : undefined;
    if (!call) return;
    this.add("tool", { hour: call.hour, revision: call.revision, mode: call.mode, model: call.model }, { tool: call.tool }, values);
  }
  private permissionAsked(event: SessionEventEnvelopeV1, data: Json): void {
    const requestId = text(data.requestId); const callId = text(data.callId); if (!requestId || !callId) return;
    this.s.permissionCalls[requestId] = { callId, requestedAt: text(data.requestedAt) ?? event.time };
    trim(this.s.permissionCalls, 100);
    this.callMetric(callId, { approval_asked: 1 });
  }
  private permissionDecided(event: SessionEventEnvelopeV1, data: Json): void {
    const requestId = text(data.requestId); const asked = requestId ? this.s.permissionCalls[requestId] : undefined; if (!asked || !requestId) return;
    delete this.s.permissionCalls[requestId];
    const kind = text(data.kind); const code = text(data.code) ?? "";
    const wait = Date.parse(text(data.decidedAt) ?? event.time) - Date.parse(asked.requestedAt);
    const values: Record<string, unknown> = Number.isFinite(wait) && wait >= 0 ? { approval_wait_ms: wait, approval_wait_samples: 1 } : {};
    if (kind === "once" || kind === "session") values.approval_user_approved = 1;
    else if (/timeout|timed[-_]?out|expired/i.test(code)) values.approval_timed_out = 1;
    else values.approval_user_denied = 1;
    this.callMetric(asked.callId, values);
  }

  /* --------------------------- 披露、Skills、压缩 --------------------------- */

  private fileRead(event: SessionEventEnvelopeV1, dims: Dims, path: string): void {
    const d = this.s.disclosure;
    if (d.indexPaths.includes(path)) {
      this.add("disclosure", dims, {}, { index_reads: 1 });
      d.conversionSteps = HARNESS_INDEX_CONVERSION_STEPS + 1; d.converted = false;
    }
    for (const [id, skill] of Object.entries(this.s.skills)) {
      if (path === skill.location) { this.add("skill", dims, { skill_id: id }, { skill_reads: 1, last_read_at: event.time, source: skill.source }); break; }
      if (path.startsWith(`${dirname(skill.location)}/`)) { this.add("skill", dims, { skill_id: id }, { asset_reads: 1, last_read_at: event.time, source: skill.source }); break; }
    }
  }
  private disclosure(event: SessionEventEnvelopeV1, data: Json): void {
    const d = this.s.disclosure; const dims = this.dims(event);
    if (data.op === "index" || data.op === "applied") for (const path of list(data.indexPaths)) if (typeof path === "string" && !d.indexPaths.includes(path)) { d.indexPaths.push(path); delete d.paths[path]; }
    if (data.op === "fact") {
      for (const item of list(data.paths).map(record)) {
        const path = text(item.path); if (!path || d.indexPaths.includes(path)) continue;
        let entry = d.paths[path];
        if (!entry) {
          const active = Object.values(d.paths).filter(value => value.v === "a").length;
          entry = d.paths[path] = active >= HARNESS_ACTIVE_PATH_LIMIT ? { v: "s", sleptAt: d.cycle, reads: 0 } : { v: "a", reads: 0 };
        }
        if (item.read !== true) continue;
        entry.reads++;
        this.add("disclosure", dims, {}, { reads: 1 });
        this.add("path", dims, { path }, { reads: 1, last_read_at: event.time });
        if (entry.v === "s" && !entry.woke) {
          entry.woke = true;
          const slept = Math.max(1, d.cycle - (entry.sleptAt ?? d.cycle));
          this.add("disclosure", dims, {}, { sleeping_reads: 1, wakes: 1, wake_cycles: slept, mis_sleeps: slept === 1 ? 1 : 0, sleep_hist: harnessHistogramPoint(slept - 1, HARNESS_SLEEP_BUCKETS) });
          if (d.conversionSteps > 0 && !d.converted) { d.converted = true; this.add("disclosure", dims, {}, { index_conversions: 1 }); }
        } else if (entry.v === "s") this.add("disclosure", dims, {}, { sleeping_reads: 1 });
        const since = this.s.compaction.readSince;
        if (!since.includes(path) && since.length < MAX_TRACKED) since.push(path);
        const pending = this.s.compaction.pending;
        // 压缩后窗口内重读压缩前读过的路径：立即记一次（会话可能在窗口结束前就停了）。
        if (pending && pending.before.includes(path) && !pending.found.includes(path)) { pending.found.push(path); this.acc.add("compaction", this.sessionId, { compaction_id: pending.id }, { reread: 1 }); }
      }
      trim(d.paths, MAX_TRACKED * 2);
    }
    if (data.op === "applied") {
      // 结束的周期：活跃路径中本周期被读过的数量回写到上一周期行。
      const previousActive = Object.entries(d.paths).filter(([, value]) => value.v === "a");
      if (d.cycle > 0) this.acc.add("cycle", this.sessionId, { cycle: d.cycle - 1 }, { active_read: previousActive.filter(([, value]) => value.reads > 0).length });
      const active = new Set(list(data.activeIds).filter((id): id is string => typeof id === "string"));
      let slept = 0;
      for (const id of active) if (!d.paths[id]) d.paths[id] = { v: "a", reads: 0 };
      for (const [id, value] of Object.entries(d.paths)) {
        if (active.has(id)) d.paths[id] = { v: "a", reads: 0 };
        else { if (value.v === "a") slept++; d.paths[id] = { v: "s", sleptAt: value.v === "a" ? d.cycle + 1 : value.sleptAt ?? d.cycle, reads: 0, woke: value.v === "a" ? false : value.woke }; }
      }
      d.cycle++;
      const sleeping = Object.values(d.paths).filter(value => value.v === "s").length;
      const index = record(data.index);
      this.add("cycle", dims, { cycle: d.cycle - 1 }, { time: event.time, active: active.size, sleeping, cap_hit: active.size >= HARNESS_ACTIVE_PATH_LIMIT ? 1 : 0, index_tokens: num(index.size) === undefined ? null : tokensOf(num(index.size)!) });
      if (slept) this.add("disclosure", dims, {}, { slept_paths: slept });
    }
  }
  private folded(data: Json): void {
    const compactionId = text(data.compactionId);
    const seqs = list(data.sourceEventSeqs).filter((seq): seq is number => typeof seq === "number");
    if (!seqs.length) return;
    const select = prepare(this.db, "SELECT hour,revision,mode,model,tool,tokens FROM harness_tool_output WHERE session_id=? AND seq=?");
    const remove = prepare(this.db, "DELETE FROM harness_tool_output WHERE session_id=? AND seq=?");
    let count = 0; let tokens = 0;
    // 同一批次里刚写入的输出还在累加器里：先落盘再查。
    this.acc.flush(this.db);
    for (const seq of seqs) {
      const row = select.get(this.sessionId, seq) as { hour: string; revision: string; mode: string; model: string; tool: string; tokens: number } | undefined;
      if (!row) continue;
      remove.run(this.sessionId, seq);
      count++; tokens += Number(row.tokens ?? 0);
      this.add("tool", { hour: row.hour, revision: row.revision, mode: row.mode, model: row.model }, { tool: row.tool }, { folded: 1, folded_tokens: Number(row.tokens ?? 0) });
    }
    if (compactionId && count) {
      const open = this.s.compaction.open[compactionId];
      this.add("compaction", open ?? { hour: "unknown", revision: this.s.revision, mode: this.s.mode, model: this.s.model }, { compaction_id: compactionId }, { folded: count, folded_tokens: tokens });
    }
  }
  private compactionEnd(event: SessionEventEnvelopeV1, data: Json): void {
    const id = text(data.compactionId); if (!id) return;
    const c = this.s.compaction;
    if (c.pending) this.finishReread();
    const dims = c.open[id] ?? this.dims(event);
    c.open[id] = { ...dims, time: c.open[id]?.time ?? event.time };
    this.add("compaction", dims, { compaction_id: id }, {
      time: event.time, ok: 1, trigger: text(data.trigger) ?? "unknown", duration_ms: num(data.durationMs) ?? null,
      before_tokens: num(data.beforeTokens) ?? null, after_tokens: num(data.afterTokens) ?? null,
      steps_since: this.s.steps - c.lastStep, turns_since: this.s.turns - c.lastTurn, window_ratio: c.windowRatio, read_before: c.readSince.length, reread: 0,
    });
    c.pending = { id, before: c.readSince, found: [], steps: HARNESS_REREAD_WINDOW_STEPS };
    c.readSince = []; c.lastStep = this.s.steps; c.lastTurn = this.s.turns;
    trim(c.open, 20);
  }

  /* ------------------------ 子 Agent 与后台任务 ------------------------ */

  private delegation(event: SessionEventEnvelopeV1, data: Json): void {
    const invocationId = text(data.invocationId); if (!invocationId) return;
    const dims = this.dims(event);
    const values: Record<string, unknown> = { preset_id: text(data.presetId) ?? null, child_session_id: text(data.childSessionId) ?? null };
    if (event.type === "delegation/requested") Object.assign(values, { ...dims, time: event.time, status: "running" });
    else Object.assign(values, { status: text(data.status) ?? null });
    if (event.type === "delegation/child-terminal") Object.assign(values, { duration_ms: num(data.durationMs) ?? null, tool_uses: num(data.toolUseCount) ?? null, return_tokens: typeof data.text === "string" ? tokensOf(data.text.length) : null });
    this.acc.add("delegation", this.sessionId, { invocation_id: invocationId }, values);
  }
  private background(event: SessionEventEnvelopeV1, data: Json): void {
    const taskId = text(data.taskId); if (!taskId) return;
    if (data.op === "start") {
      const callId = text(data.callId);
      const call = callId ? this.s.calls[callId] ?? this.s.recentCalls[callId] : undefined;
      const dims: Dims = call ? { hour: hourOf(event.time), revision: call.revision, mode: call.mode, model: call.model } : this.dims(event);
      this.s.tasks[taskId] = text(data.startedAt) ?? event.time; trim(this.s.tasks, 200);
      this.acc.add("background", this.sessionId, { task_id: taskId }, { ...dims, time: event.time, kind: text(data.kind) ?? "unknown", status: "running" });
      if (call) this.add("tool", { hour: call.hour, revision: call.revision, mode: call.mode, model: call.model }, { tool: call.tool }, { background: 1 });
    }
    if (data.op === "settle") {
      const started = Date.parse(this.s.tasks[taskId] ?? ""); const ended = Date.parse(text(data.endedAt) ?? event.time);
      delete this.s.tasks[taskId];
      this.acc.add("background", this.sessionId, { task_id: taskId }, { status: text(data.status) ?? "unknown", delivery: text(data.delivery) ?? null, duration_ms: Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : null });
    }
  }
}

function normalizeReason(reason: string | undefined): string {
  if (!reason) return "other";
  if (reason === "completed" || reason === "aborted" || reason === "failed") return reason;
  if (/step[-_ ]?limit|max[-_ ]?steps/i.test(reason)) return "step-limit";
  return "other";
}
function trim<T>(map: Record<string, T>, limit: number): void {
  const keys = Object.keys(map);
  for (let index = 0; index < keys.length - limit; index++) delete map[keys[index]!];
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Json)[key])}`).join(",")}}`;
}
