import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import {
  HARNESS_ACTIVE_PATH_LIMIT, HARNESS_DURATION_BASE_MS, HARNESS_INDEX_CONVERSION_STEPS, HARNESS_REREAD_WINDOW_STEPS, HARNESS_TOKEN_BASE,
  harnessHistogramIndex, harnessRevisionKey, HARNESS_UNKNOWN_REVISION, estimateCharCount,
  applyContextEstimate, initialContextEstimate, viewContextEstimate, type ContextEstimateState,
} from "@actspace/shared";
import { prepare, type ProjectionDatabase } from "./usage-sql";
import { HarnessAccumulator, harnessHistogramPoint, HARNESS_SLEEP_BUCKETS, HARNESS_STATE_TABLE, HARNESS_TABLES } from "./harness-stats-schema";
import { parseBashPrograms, type BashProgramOccurrence } from "./bash-programs";

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
type PendingCall = Dims & { tool: string; pluginId: string | null; turnId: string | null; at: string; runStartAt?: string; ranged?: boolean; bash?: BashProgramOccurrence[] };
type DisclosurePath = { v: "a" | "s"; sleptAt?: number; reads: number; woke?: boolean };
type State = {
  v: 2;
  steps: number;
  revision: string; mode: string; model: string;
  runs: Record<string, string>;
  turns_: Record<string, { rev: string; mode: string }>;
  requests: Record<string, Dims>;
  requestOrder: string[];
  calls: Record<string, PendingCall>;
  turnDigests: Record<string, string[]>;
  permissionCalls: Record<string, { callId: string; requestedAt: string }>;
  entries: Record<string, number>;
  /** 上一次请求里 Harness 自己内容（非对话条目 key:tokens）的摘要，判断「缓存被打断」。 */
  harnessDigest?: string;
  skills: Record<string, { location: string; source: string | null }>;
  disclosure: { cycle: number; paths: Record<string, DisclosurePath>; indexPaths: string[]; conversionSteps: number; converted: boolean };
  compaction: { lastStep: number; windowRatio: number | null; readSince: string[]; pending: { id: string; before: string[]; found: string[]; steps: number } | null; open: Record<string, Dims & { time: string }> };
  /** 子 Agent 激活的开始时间（`activation:<id>`）。 */
  tasks: Record<string, string>;
  /** Preset of each subagent (`subagent/spawned`), for its activations' rows. */
  subagents?: Record<string, string>;
  /** 与会话投影 `contextEstimate` 同一个折叠（agent-spec-request-record.md §6.4）；只含非对话项与两个对话合计。 */
  estimate: ContextEstimateState;
  /** 最近一条 `request/tools` 的工具名，按请求计曝光。 */
  toolNames: string[];
};

function emptyState(): State {
  return {
    v: 2, steps: 0, revision: HARNESS_UNKNOWN_REVISION, mode: "", model: "",
    runs: {}, turns_: {}, requests: {}, requestOrder: [], calls: {},
    turnDigests: {}, permissionCalls: {}, entries: {}, skills: {},
    disclosure: { cycle: 0, paths: {}, indexPaths: [], conversionSteps: 0, converted: false },
    compaction: { lastStep: 0, windowRatio: null, readSince: [], pending: null, open: {} },
    tasks: {},
    estimate: initialContextEstimate(), toolNames: [],
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

/**
 * 增量投影一个批次；已处理过的 seq 会被跳过，所以重复投递同一批次是安全的。
 * `inheritedThroughSeq`：分叉 / 侧边对话从父会话复制来的前缀（seq ≤ 它）。这些事件在父会话里执行和记账，
 * 这里只用来恢复状态（版本、模式、模型、披露、Skills 等），不产生任何统计行。
 */
export function projectHarnessJournalBatch(db: ProjectionDatabase, sessionId: string, events: readonly SessionEventEnvelopeV1[], inheritedThroughSeq = -1): void {
  const saved = prepare(db, `SELECT last_seq,state_json FROM ${HARNESS_STATE_TABLE} WHERE session_id=?`).get(sessionId) as { last_seq: number; state_json: string } | undefined;
  let state: State;
  try { state = saved ? { ...emptyState(), ...JSON.parse(saved.state_json) as State } : emptyState(); } catch { state = emptyState(); }
  if (state.v !== 2) state = emptyState();
  let lastSeq = saved?.last_seq ?? -1;
  const fresh = events.filter(event => event.seq > lastSeq);
  if (!fresh.length) return;
  const acc = new HarnessAccumulator();
  const replay = new HarnessReplay(db, sessionId, state, acc);
  // 继承的前缀写进一个不落盘的累加器：状态照常推进，行被丢弃。
  const inherited = new HarnessReplay(db, sessionId, state, new HarnessAccumulator(), false);
  for (const event of fresh) {
    if (event.seq <= inheritedThroughSeq) inherited.apply(event);
    else {
      // 跨过边界：父会话里还没等到重读的压缩属于父会话，不在这里补记。
      if (lastSeq <= inheritedThroughSeq) state.compaction.pending = null;
      replay.apply(event);
    }
    lastSeq = event.seq;
  }
  acc.flush(db);
  prepare(db, `INSERT INTO ${HARNESS_STATE_TABLE}(session_id,last_seq,state_json) VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET last_seq=excluded.last_seq,state_json=excluded.state_json`).run(sessionId, lastSeq, JSON.stringify(state));
}

class HarnessReplay {
  /** counting=false：只推进状态，不读写统计表（累加器由调用方丢弃）。 */
  constructor(private readonly db: ProjectionDatabase, private readonly sessionId: string, private readonly s: State, private readonly acc: HarnessAccumulator, private readonly counting = true) {}

  apply(event: SessionEventEnvelopeV1): void {
    const data = record(event.data);
    this.s.estimate = applyContextEstimate(this.s.estimate, event);
    switch (event.type) {
      case "plugin/actspace.agent-service/run": return this.run(data);
      case "agent/mode-set": { const mode = text(data.mode); if (mode) this.s.mode = mode; return; }
      case "turn/start": return this.turnStart(data);
      case "turn/end": { const turnId = text(data.turnId); if (turnId) { delete this.s.turns_[turnId]; delete this.s.turnDigests[turnId]; } return; }
      case "step/start": return this.step();
      case "request/header": return this.requestHeader(event, data);
      case "request/system-prompt": return this.systemPrompt(data);
      case "request/tools": { this.s.toolNames = list(data.tools).flatMap(tool => { const name = text(record(tool).name); return name ? [name] : []; }); return; }
      case "request/context": return this.requestContext(event, data);
      case "assistant/message": return this.assistant(data);
      case "llm/auxiliary-end": return this.auxiliary(event, data);
      case "tool/call": return this.toolCall(event, data);
      case "tool-workflow/run-start": { const call = this.s.calls[text(data.callId) ?? ""]; if (call) call.runStartAt = event.time; return; }
      case "tool/result": return this.toolResult(event, data);
      case "permission/asked": return this.permissionAsked(event, data);
      case "permission/decided": return this.permissionDecided(event, data);
      case "plugin/actspace.context/state": return this.disclosure(event, data);
      case "compaction/start": { const id = text(data.compactionId); if (id) this.s.compaction.open[id] = { ...this.dims(event), time: event.time }; return; }
      case "surface/replaced": return this.folded(data);
      case "compaction/end": return this.compactionEnd(event, data);
      // Old Sessions record `delegation/*`; new ones one row per subagent activation.
      case "delegation/requested": case "delegation/completed": case "delegation/child-terminal": return this.delegation(event, data);
      case "subagent/spawned": { const agentId = text(data.agentId); if (agentId) { (this.s.subagents ??= {})[agentId] = `actspace.subagent.${text(data.preset) ?? text(data.kind) ?? "unknown"}`; trim(this.s.subagents, 200); } return; }
      case "subagent/activation": return this.subagentActivation(event, data);
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

  private run(data: Json): void {
    const runId = text(data.runId); if (!runId || data.op !== "start") return;
    const harness = record(data.harness);
    const revision = harnessRevisionKey(text(harness.harnessId), num(harness.revision));
    this.s.runs[runId] = revision; this.s.revision = revision;
    const model = text(record(data.configuration).model); if (model && !this.s.model) this.s.model = model;
    trim(this.s.runs, 200);
  }
  private turnStart(data: Json): void {
    const turnId = text(data.turnId); if (!turnId) return;
    const runId = text(data.agentRunId);
    const rev = runId ? this.s.runs[runId] ?? this.s.revision : this.s.revision;
    const mode = text(data.mode) ?? this.s.mode;
    if (mode) this.s.mode = mode;
    this.s.turns_[turnId] = { rev, mode };
    trim(this.s.turns_, 50);
  }
  private step(): void {
    this.s.steps++;
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
  }
  /** 技能目录（位置用于判断「读了 SKILL.md / 附属文件」）只在提示词变化时写一次。 */
  private systemPrompt(data: Json): void {
    for (const fact of list(data.modelFacts).map(record)) {
      if (fact.id !== "core/skills-catalog") continue;
      for (const skill of list(fact.content).map(record)) {
        const id = text(skill.id); const location = text(skill.location);
        if (id && location) this.s.skills[id] = { location, source: text(skill.source) ?? null };
      }
    }
  }
  /** 每次请求按当时的折叠状态记分类、总数、逐项与工具曝光；估算不再从 `request/context` 读。 */
  private requestContext(event: SessionEventEnvelopeV1, data: Json): void {
    const requestId = text(data.requestId); if (!requestId) return;
    const dims = this.s.requests[requestId] ?? this.dims(event);
    const view = viewContextEstimate(this.s.estimate);
    const comparable = view.entries.length > 0;
    const buckets = view.buckets;
    const window = num(record(record(data.snapshot).contextModel).contextWindow) ?? view.contextWindow ?? undefined;
    const estimated = view.totalEstimatedTokens;
    // 缓存被打断：Harness 自己的条目（不含对话）新增、消失或 token 数变化，与同一会话上一次请求比。
    const harnessParts = view.entries.filter(entry => !CONVERSATION_KINDS.has(entryKind(entry.key))).map(entry => `${entry.key}:${entry.estimatedTokens}`).sort();
    const digest = comparable ? createHash("sha1").update(harnessParts.join("\n")).digest("base64").slice(0, 16) : undefined;
    const changed = digest === undefined || this.s.harnessDigest === undefined ? null : digest === this.s.harnessDigest ? 0 : 1;
    if (digest !== undefined) this.s.harnessDigest = digest;
    this.add("request", dims, { request_id: requestId }, {
      estimated, has_manifest: comparable ? 1 : 0, ...(window ? { context_window: window } : {}), harness_changed: changed,
      b_system: buckets.systemPrompt, b_tools: buckets.tools, b_rules: buckets.rules, b_skills: buckets.skills,
      b_summarized: buckets.summarizedConversation, b_conversation: buckets.conversation,
    });
    if (estimated && window) this.s.compaction.windowRatio = estimated / window;
    const schemaTokens = new Map<string, number>();
    for (const entry of view.entries) {
      let key: unknown[]; try { key = JSON.parse(entry.key) as unknown[]; } catch { continue; }
      const kind = String(key[0] ?? "");
      if (CONVERSATION_KINDS.has(kind)) continue;
      const tokens = entry.estimatedTokens;
      const previous = this.s.entries[entry.key];
      const id = kind === "tool" ? String(key[2] ?? "") : kind === "skill" ? String(key[3] ?? key[2] ?? "") : String(key[2] ?? key[1] ?? kind);
      this.add("entry", dims, { entry_key: entry.key }, {
        kind: KIND_OF[kind] ?? "other", bucket: entry.bucket, owner: kind === "tool" || kind === "model-facts" ? null : text(key[1]) ?? null, entry_id: id,
        appearances: 1, tokens, max_tokens: tokens, compared: previous === undefined ? 0 : 1, changes: previous !== undefined && previous !== tokens ? 1 : 0,
      });
      this.s.entries[entry.key] = tokens;
      if (kind === "tool") schemaTokens.set(id, tokens);
      if (kind === "skill") this.add("skill", dims, { skill_id: id }, { listed: 1, source: this.s.skills[id]?.source ?? null });
    }
    trim(this.s.entries, 1_000);
    for (const name of this.s.toolNames) {
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
  /** 辅助模型的用量在使用统计里；这里只记压缩失败（压缩卡的「失败」）。 */
  private auxiliary(event: SessionEventEnvelopeV1, data: Json): void {
    if (data.purpose !== "compaction" || data.status === "completed") return;
    const id = text(data.logicalRequestId) ?? text(data.attemptId) ?? `aux-${event.seq}`;
    this.add("compaction", this.dims(event), { compaction_id: `failed:${id}` }, { time: event.time, ok: 0, failure_code: text(record(data.failure).code) ?? String(data.status ?? "failed"), trigger: "unknown" });
  }

  /* -------------------------------- 工具 -------------------------------- */

  private toolCall(event: SessionEventEnvelopeV1, data: Json): void {
    const callId = text(data.callId); const tool = text(data.name); if (!callId || !tool) return;
    const dims = this.dims(event, text(data.requestId));
    const turnId = text(data.turnId) ?? null;
    const args = record(data.args);
    // 模型自己给了 offset/limit 的分段读取不算截断。
    const ranged = args.offset !== undefined || args.limit !== undefined;
    const bash = tool === "bash" && typeof args.command === "string" ? uniquePrograms(parseBashPrograms(args.command)) : undefined;
    this.s.calls[callId] = { ...dims, tool, pluginId: text(data.pluginId) ?? null, turnId, at: event.time, ...(ranged ? { ranged } : {}), ...(bash?.length ? { bash } : {}) };
    trim(this.s.calls, 200);
    const values: Record<string, unknown> = { calls: 1, plugin_id: text(data.pluginId) ?? null };
    if (turnId) {
      const digest = createHash("sha1").update(tool).update("\0").update(stableJson(args)).digest("base64").slice(0, 16);
      const seen = this.s.turnDigests[turnId] ??= [];
      if (seen.includes(digest)) values.repeated = 1; else if (seen.length < 500) seen.push(digest);
    }
    this.add("tool", dims, { tool }, values);
  }
  private toolResult(event: SessionEventEnvelopeV1, data: Json): void {
    const callId = text(data.callId); if (!callId) return;
    const call = this.s.calls[callId];
    const tool = call?.tool ?? text(data.name); if (!tool) return;
    const dims: Dims = call ? { hour: call.hour, revision: call.revision, mode: call.mode, model: call.model } : this.dims(event);
    const status = text(data.status) ?? "unknown";
    const failure = record(data.failure);
    const output = list(data.modelOutput).map(record).filter(part => part.type === "text").map(part => String(part.text ?? "")).join("");
    const outputTokens = estimateCharCount(output.length);
    // 执行耗时从开始执行算（不含等待审批）；被拒绝的调用没有执行。
    const startAt = Date.parse(call?.runStartAt ?? call?.at ?? ""); const endAt = Date.parse(event.time);
    const duration = status !== "denied" && Number.isFinite(startAt) && Number.isFinite(endAt) ? Math.max(0, endAt - startAt) : undefined;
    const values: Record<string, unknown> = {
      failed: status === "failed" ? 1 : 0,
      output_tokens: outputTokens, output_samples: 1, output_hist: harnessHistogramPoint(harnessHistogramIndex(outputTokens, HARNESS_TOKEN_BASE)),
      truncated: !call?.ranged && TRUNCATION_MARKERS.some(marker => output.includes(marker)) ? 1 : 0, plugin_id: text(data.pluginId) ?? call?.pluginId ?? null,
    };
    if (duration !== undefined) Object.assign(values, { duration_ms: duration, duration_samples: 1, duration_hist: harnessHistogramPoint(harnessHistogramIndex(duration, HARNESS_DURATION_BASE_MS)) });
    if (status === "failed" || status === "denied") values.failure_codes = { [text(failure.code) ?? status]: 1 };
    for (const detail of list(data.detail).map(record)) {
      const value = record(detail.value);
      if (detail.label === "actspace.context.file" && value.kind === "file" && value.operation === "read" && typeof value.path === "string") this.fileRead(event, dims, value.path);
    }
    this.add("tool", dims, { tool }, values);
    // 管道里的每个程序都记整条命令的结果与耗时。
    if (status !== "denied") for (const { program, subcommand } of call?.bash ?? []) {
      this.add("bash", dims, { program, subcommand }, { calls: 1, failed: status === "failed" ? 1 : 0, ...(duration === undefined ? {} : { duration_ms: duration, duration_samples: 1 }) });
    }
    this.acc.add("output", this.sessionId, { seq: event.seq }, { tokens: outputTokens });
    delete this.s.calls[callId];
  }
  private permissionAsked(event: SessionEventEnvelopeV1, data: Json): void {
    const requestId = text(data.requestId); const callId = text(data.callId); if (!requestId || !callId) return;
    this.s.permissionCalls[requestId] = { callId, requestedAt: text(data.requestedAt) ?? event.time };
    trim(this.s.permissionCalls, 100);
  }
  /** 只记等待时长（耗时环形图的「等待审批」）。 */
  private permissionDecided(event: SessionEventEnvelopeV1, data: Json): void {
    const requestId = text(data.requestId); const asked = requestId ? this.s.permissionCalls[requestId] : undefined; if (!asked || !requestId) return;
    delete this.s.permissionCalls[requestId];
    const call = this.s.calls[asked.callId];
    const wait = Date.parse(text(data.decidedAt) ?? event.time) - Date.parse(asked.requestedAt);
    if (!call || !Number.isFinite(wait) || wait < 0) return;
    this.add("tool", { hour: call.hour, revision: call.revision, mode: call.mode, model: call.model }, { tool: call.tool }, { approval_wait_ms: wait, approval_wait_samples: 1 });
  }

  /* --------------------------- 披露、Skills、压缩 --------------------------- */

  private fileRead(event: SessionEventEnvelopeV1, dims: Dims, path: string): void {
    const d = this.s.disclosure;
    if (d.indexPaths.includes(path)) {
      this.add("disclosure", dims, {}, { index_reads: 1 });
      d.conversionSteps = HARNESS_INDEX_CONVERSION_STEPS + 1; d.converted = false;
    }
    for (const [id, skill] of Object.entries(this.s.skills)) {
      const root = `${dirname(skill.location)}/`;
      const isSkill = path === skill.location;
      if (!isSkill && !path.startsWith(root)) continue;
      this.add("skill", dims, { skill_id: id }, { [isSkill ? "skill_reads" : "asset_reads"]: 1, last_read_at: event.time, source: skill.source });
      this.add("skillFile", dims, { skill_id: id, file: isSkill ? basename(path) : path.slice(root.length) }, { reads: 1, last_read_at: event.time });
      break;
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
        this.add("path", dims, { path }, { reads: 1, last_read_at: event.time });
        if (entry.v === "s" && !entry.woke) {
          entry.woke = true;
          const slept = Math.max(1, d.cycle - (entry.sleptAt ?? d.cycle));
          this.add("disclosure", dims, {}, { mis_sleeps: slept === 1 ? 1 : 0, sleep_hist: harnessHistogramPoint(slept - 1, HARNESS_SLEEP_BUCKETS) });
          if (d.conversionSteps > 0 && !d.converted) { d.converted = true; this.add("disclosure", dims, {}, { index_conversions: 1 }); }
        }
        const since = this.s.compaction.readSince;
        if (!since.includes(path) && since.length < MAX_TRACKED) since.push(path);
        const pending = this.s.compaction.pending;
        // 压缩后窗口内重读压缩前读过的路径：立即记一次（会话可能在窗口结束前就停了）。
        if (pending?.before.includes(path) && !pending.found.includes(path)) { pending.found.push(path); this.acc.add("compaction", this.sessionId, { compaction_id: pending.id }, { reread: 1 }); }
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
      this.add("cycle", dims, { cycle: d.cycle - 1 }, { active: active.size, cap_hit: active.size >= HARNESS_ACTIVE_PATH_LIMIT ? 1 : 0 });
      if (slept) this.add("disclosure", dims, {}, { slept_paths: slept });
    }
  }
  private folded(data: Json): void {
    const compactionId = text(data.compactionId);
    const seqs = list(data.sourceEventSeqs).filter((seq): seq is number => typeof seq === "number");
    if (!seqs.length || !this.counting) return;
    const select = prepare(this.db, "SELECT tokens FROM harness_tool_output WHERE session_id=? AND seq=?");
    const remove = prepare(this.db, "DELETE FROM harness_tool_output WHERE session_id=? AND seq=?");
    let count = 0; let tokens = 0;
    // 同一批次里刚写入的输出还在累加器里：先落盘再查。
    this.acc.flush(this.db);
    for (const seq of seqs) {
      const row = select.get(this.sessionId, seq) as { tokens: number } | undefined;
      if (!row) continue;
      remove.run(this.sessionId, seq);
      count++; tokens += Number(row.tokens ?? 0);
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
      steps_since: this.s.steps - c.lastStep, window_ratio: c.windowRatio, reread: 0,
    });
    c.pending = { id, before: c.readSince, found: [], steps: HARNESS_REREAD_WINDOW_STEPS };
    c.readSince = []; c.lastStep = this.s.steps;
    trim(c.open, 20);
  }

  /* ------------------------------ 子 Agent ------------------------------ */

  private delegation(event: SessionEventEnvelopeV1, data: Json): void {
    const invocationId = text(data.invocationId); if (!invocationId) return;
    const dims = this.dims(event);
    const values: Record<string, unknown> = { preset_id: text(data.presetId) ?? null, child_session_id: text(data.childSessionId) ?? null };
    if (event.type === "delegation/requested") Object.assign(values, { ...dims, time: event.time, status: "running" });
    else Object.assign(values, { status: text(data.status) ?? null });
    if (event.type === "delegation/child-terminal") Object.assign(values, { duration_ms: num(data.durationMs) ?? null });
    this.acc.add("delegation", this.sessionId, { invocation_id: invocationId }, values);
  }
  private subagentActivation(event: SessionEventEnvelopeV1, data: Json): void {
    const activationId = text(data.activationId), agentId = text(data.agentId); if (!activationId || !agentId) return;
    const values: Record<string, unknown> = { preset_id: this.s.subagents?.[agentId] ?? null, child_session_id: agentId };
    const started = `activation:${activationId}`;
    if (data.op === "start") {
      const callId = text(data.callId);
      const call = callId ? this.s.calls[callId] : undefined;
      const dims: Dims = call ? { hour: hourOf(event.time), revision: call.revision, mode: call.mode, model: call.model } : this.dims(event);
      this.s.tasks[started] = text(data.startedAt) ?? event.time; trim(this.s.tasks, 200);
      Object.assign(values, { ...dims, time: event.time, status: "running" });
    } else if (data.op === "settle") {
      const status = text(data.status);
      const startedAt = this.s.tasks[started]; delete this.s.tasks[started];
      const duration = startedAt ? Date.parse(text(data.endedAt) ?? event.time) - Date.parse(startedAt) : NaN;
      Object.assign(values, {
        status: status === "completed" ? "completed" : status === "interrupted" ? "aborted" : "failed",
        duration_ms: Number.isFinite(duration) ? Math.max(0, duration) : null,
      });
    } else return;
    this.acc.add("delegation", this.sessionId, { invocation_id: activationId }, values);
  }
}

/** 同一条命令里重复出现的「程序 + 子命令」只记一次；名字不合法的段不记。 */
function uniquePrograms(occurrences: BashProgramOccurrence[]): BashProgramOccurrence[] {
  const seen = new Set<string>();
  return occurrences.filter(({ program, subcommand }) => {
    const key = `${program}\0${subcommand}`;
    if (!program || seen.has(key) || seen.size >= 16) return false;
    seen.add(key); return true;
  });
}
function entryKind(key: string): string {
  try { return String((JSON.parse(key) as unknown[])[0] ?? ""); } catch { return ""; }
}
function trim<T>(map: Record<string, T>, limit: number): void {
  const keys = Object.keys(map);
  for (let index = 0; index < keys.length - limit; index++) delete map[keys[index]];
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Json)[key])}`).join(",")}}`;
}
