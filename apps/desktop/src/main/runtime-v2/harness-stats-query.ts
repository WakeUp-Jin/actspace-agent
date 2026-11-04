import type { DatabaseSync } from "node:sqlite";
import {
  addHarnessHistograms, emptyHarnessHistogram, HARNESS_COMPARE_MIN_REQUESTS, HARNESS_DURATION_BASE_MS, HARNESS_FLAG_RULES, HARNESS_TOKEN_BASE,
  HARNESS_UNKNOWN_REVISION, harnessHistogramQuantile,
  type HarnessCompareRow, type HarnessFlag, type HarnessPluginRow, type HarnessPluginSource, type HarnessRevisionInfo, type HarnessServiceRow, type HarnessSkillRow,
  type HarnessSourceRow, type HarnessStatsContext, type HarnessStatsData, type HarnessStatsDisclosure, type HarnessStatsFilter, type HarnessStatsOptions,
  type HarnessStatsOverview, type HarnessStatsPlugins, type HarnessStatsQueryInput, type HarnessStatsRuntime, type HarnessStatsSummary, type HarnessStatsTools,
  type HarnessStatsVersions, type HarnessToolRow,
} from "@actspace/shared";
import { prepare } from "./usage-sql";
import { HARNESS_SLEEP_BUCKETS } from "./harness-stats-schema";

/**
 * 「Harness 统计」按 tab 的 SQL 聚合与「值得关注」规则。全部在汇总 Worker 里执行。
 * 会话级表统一按 hour / revision / mode / model 与 harness_session_meta（工作区、会话类型）筛选；
 * 运行时表（服务、监听、加载）只按时间和版本筛选。
 */
type Row = Record<string, unknown>;
const n = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
const ratio = (a: number, b: number): number | null => b > 0 ? a / b : null;
const avg = (sum: number, count: number): number | null => count > 0 ? sum / count : null;
const RANGE_HOURS = { day: 24, week: 24 * 7, month: 24 * 30, total: 0 } as const;
/** 子 Agent 会话没有自己的 run 事件：版本取父会话发起委派时的版本。 */
const CHILD_REVISION = "child_rev AS (SELECT child_session_id AS session_id,MAX(revision) AS revision FROM harness_delegation WHERE child_session_id IS NOT NULL AND revision IS NOT NULL AND revision<>'unknown' GROUP BY child_session_id)";
const REV = (alias: string) => `(CASE WHEN ${alias}.revision IS NULL OR ${alias}.revision='unknown' THEN COALESCE(cr.revision,'unknown') ELSE ${alias}.revision END)`;

export function sinceHour(range: HarnessStatsFilter["range"], now: Date): string | null {
  const hours = RANGE_HOURS[range];
  return hours ? new Date(now.getTime() - hours * 3_600_000).toISOString().slice(0, 13) : null;
}

class Scope {
  constructor(readonly db: DatabaseSync, readonly filter: HarnessStatsFilter, readonly now: Date) {}

  /** 会话级表：FROM … JOIN … WHERE …；extra 是额外条件。ignoreRevision 用于版本对比。 */
  from(table: string, alias = "t", options: { extra?: string; ignoreRevision?: boolean; revision?: string } = {}): { sql: string; args: (string | number)[] } {
    const conditions: string[] = [`${alias}.hour IS NOT NULL`]; const args: (string | number)[] = [];
    const since = sinceHour(this.filter.range, this.now);
    if (since) { conditions.push(`${alias}.hour>=? AND ${alias}.hour GLOB '[0-9]*'`); args.push(since); }
    if (this.filter.mode) { conditions.push(`${alias}.mode=?`); args.push(this.filter.mode); }
    if (this.filter.model) { conditions.push(`${alias}.model=?`); args.push(this.filter.model); }
    if (this.filter.workspaceRoot) { conditions.push("m.workspace_root=?"); args.push(this.filter.workspaceRoot); }
    if (this.filter.sessionKind !== "all") { conditions.push("COALESCE(m.kind,'main')=?"); args.push(this.filter.sessionKind); }
    const revision = options.revision ?? (options.ignoreRevision ? undefined : this.filter.revision);
    if (revision) { conditions.push(`${REV(alias)}=?`); args.push(revision); }
    if (options.extra) conditions.push(options.extra);
    return { sql: `FROM ${table} ${alias} LEFT JOIN harness_session_meta m ON m.session_id=${alias}.session_id LEFT JOIN child_rev cr ON cr.session_id=${alias}.session_id WHERE ${conditions.join(" AND ")}`, args };
  }
  all(select: string, table: string, rest = "", options: Parameters<Scope["from"]>[2] = {}): Row[] {
    const scope = this.from(table, "t", options);
    return prepare(this.db, `WITH ${CHILD_REVISION} SELECT ${select} ${scope.sql} ${rest}`).all(...scope.args) as Row[];
  }
  get(select: string, table: string, options: Parameters<Scope["from"]>[2] = {}): Row {
    return this.all(select, table, "", options)[0] ?? {};
  }
  /** 运行时表：只按时间和版本。 */
  runtime(select: string, rest = "", extra?: string, extraArgs: (string | number)[] = []): Row[] {
    const conditions = ["1=1"]; const args: (string | number)[] = [];
    const since = sinceHour(this.filter.range, this.now);
    if (since) { conditions.push("hour>=?"); args.push(since); }
    if (this.filter.revision) { conditions.push("revision=?"); args.push(this.filter.revision); }
    if (extra) { conditions.push(extra); args.push(...extraArgs); }
    return prepare(this.db, `SELECT ${select} FROM harness_runtime_hourly WHERE ${conditions.join(" AND ")} ${rest}`).all(...args) as Row[];
  }
  get runtimeLimited(): boolean { return !!(this.filter.mode || this.filter.model || this.filter.workspaceRoot || this.filter.sessionKind !== "all"); }
  get rangeDays(): number { return this.filter.range === "day" ? 1 : this.filter.range === "week" ? 7 : this.filter.range === "month" ? 30 : Number.POSITIVE_INFINITY; }
}

export function queryHarnessStats(db: DatabaseSync, input: HarnessStatsQueryInput, now = new Date()): HarnessStatsData {
  const scope = new Scope(db, input.filter, now);
  switch (input.kind) {
    case "summary": return { kind: "summary", value: summary(scope) };
    case "options": return { kind: "options", value: options(scope) };
    case "overview": return { kind: "overview", value: overview(scope) };
    case "plugins": return { kind: "plugins", value: plugins(scope) };
    case "tools": return { kind: "tools", value: tools(scope) };
    case "context": return { kind: "context", value: context(scope) };
    case "disclosure": return { kind: "disclosure", value: disclosure(scope) };
    case "runtime": return { kind: "runtime", value: runtime(scope) };
    case "versions": return { kind: "versions", value: versions(scope, input.compare) };
  }
}

/* -------------------------------- 版本 -------------------------------- */

function currentRevision(db: DatabaseSync): string | null {
  const selected = prepare(db, "SELECT revision FROM harness_revision_info ORDER BY selection_seq DESC NULLS LAST, number DESC LIMIT 1").get() as Row | undefined;
  if (selected) return String(selected.revision);
  const seen = prepare(db, "SELECT revision FROM harness_plugin_inventory ORDER BY last_seen DESC LIMIT 1").get() as Row | undefined;
  return seen ? String(seen.revision) : null;
}
function revisionInfos(scope: Scope): HarnessRevisionInfo[] {
  const usage = new Map<string, { requests: number; first: string | null; last: string | null }>();
  for (const row of scope.all(`${REV("t")} AS revision,COUNT(*) AS requests,MIN(t.time) AS first,MAX(t.time) AS last`, "harness_request", "GROUP BY 1", { ignoreRevision: true })) {
    usage.set(String(row.revision), { requests: n(row.requests), first: row.first ? String(row.first) : null, last: row.last ? String(row.last) : null });
  }
  const infos = new Map<string, HarnessRevisionInfo>();
  for (const row of prepare(scope.db, "SELECT revision,harness_id,number,description,selected_at FROM harness_revision_info").all() as Row[]) {
    const key = String(row.revision); const used = usage.get(key);
    infos.set(key, { key, harnessId: row.harness_id ? String(row.harness_id) : null, revision: row.number == null ? null : n(row.number), description: row.description ? String(row.description) : null, firstSeenAt: used?.first ?? (row.selected_at ? String(row.selected_at) : null), lastSeenAt: used?.last ?? null, requests: used?.requests ?? 0 });
  }
  for (const [key, used] of usage) if (!infos.has(key)) {
    const [harnessId, number] = key === HARNESS_UNKNOWN_REVISION ? [null, null] : [key.split("@")[0] ?? null, Number(key.split("@")[1])];
    infos.set(key, { key, harnessId, revision: Number.isFinite(number) ? number : null, description: key === HARNESS_UNKNOWN_REVISION ? "没有版本信息的旧记录" : null, firstSeenAt: used.first, lastSeenAt: used.last, requests: used.requests });
  }
  return [...infos.values()].sort((a, b) => (b.revision ?? -1) - (a.revision ?? -1) || a.key.localeCompare(b.key));
}

/* ------------------------------ 指标卡与选项 ------------------------------ */

function inventoryRows(scope: Scope): Row[] {
  const revision = scope.filter.revision ?? currentRevision(scope.db);
  if (!revision) return [];
  return prepare(scope.db, "SELECT plugin,source,provides,loads,failures,last_error,load_hist FROM harness_plugin_inventory WHERE revision=?").all(revision) as Row[];
}
function summary(scope: Scope): HarnessStatsSummary {
  const inventory = inventoryRows(scope);
  const revision = scope.filter.revision ?? currentRevision(scope.db);
  const owners = revision ? new Set((prepare(scope.db, "SELECT DISTINCT plugin FROM harness_tool_owner WHERE revision=?").all(revision) as Row[]).map(row => String(row.plugin))) : new Set<string>();
  const tool = scope.get("SUM(t.calls) AS calls,SUM(t.failed) AS failed,COUNT(DISTINCT CASE WHEN t.calls>0 THEN t.tool END) AS tools", "harness_tool_rollup");
  const request = scope.get("COUNT(*) AS requests,SUM(CASE WHEN t.has_manifest=1 THEN t.estimated END) AS estimated,SUM(CASE WHEN t.has_manifest=1 THEN 1 END) AS samples,SUM(CASE WHEN t.has_manifest=1 THEN t.b_tools END) AS tools", "harness_request");
  const compaction = scope.get("SUM(CASE WHEN t.ok=1 THEN 1 ELSE 0 END) AS count", "harness_compaction");
  const cycle = scope.get("SUM(t.active_read) AS hit,SUM(CASE WHEN t.active_read IS NOT NULL THEN t.active END) AS active", "harness_disclosure_cycle");
  return {
    plugins: { loaded: inventory.filter(row => n(row.loads) > n(row.failures)).length, withTools: owners.size, evolved: inventory.filter(row => row.source === "evolved").length, user: inventory.filter(row => row.source === "user").length },
    toolCalls: { calls: n(tool.calls), failureRate: ratio(n(tool.failed), n(tool.calls)), tools: n(tool.tools) },
    context: { avgEstimatedTokens: avg(n(request.estimated), n(request.samples)), toolsShare: ratio(n(request.tools), n(request.estimated)) },
    compaction: { count: n(compaction.count), activeHitRate: ratio(n(cycle.hit), n(cycle.active)) },
    requests: n(request.requests),
  };
}
function options(scope: Scope): HarnessStatsOptions {
  const distinct = (column: string) => (prepare(scope.db, `SELECT DISTINCT ${column} AS value FROM harness_request WHERE ${column} IS NOT NULL AND ${column}<>'' ORDER BY 1`).all() as Row[]).map(row => String(row.value));
  return {
    modes: distinct("mode"), models: distinct("model"),
    workspaces: (prepare(scope.db, "SELECT DISTINCT workspace_root AS value FROM harness_session_meta WHERE workspace_root IS NOT NULL AND workspace_root<>'' ORDER BY 1").all() as Row[]).map(row => String(row.value)),
    revisions: revisionInfos(scope), currentRevision: currentRevision(scope.db),
  };
}

/* -------------------------------- 工具 -------------------------------- */

type ToolAggregate = HarnessToolRow & { schemaSum: number; schemaSamples: number; durationHist: number[]; outputHist: number[]; outputSum: number; outputSamples: number };
function toolAggregates(scope: Scope, options: Parameters<Scope["from"]>[2] = {}): { rows: ToolAggregate[]; raw: Row[] } {
  const raw = scope.all("t.*", "harness_tool_rollup", "", options);
  const owners = toolOwners(scope);
  const map = new Map<string, ToolAggregate>();
  for (const row of raw) {
    const name = String(row.tool);
    let tool = map.get(name);
    if (!tool) {
      tool = { name, pluginId: null, exposures: 0, calls: 0, completed: 0, failed: 0, denied: 0, aborted: 0, unknownOutcome: 0, failureCodes: [], schemaTokens: null, outputTokensAvg: null, outputTokensP95: null, durationP50Ms: null, durationP95Ms: null, truncated: 0, repeatedSameArgs: 0, retryAfterFailure: 0, foldedOutputs: 0, foldedTokens: 0, lastUsedAt: null, schemaSum: 0, schemaSamples: 0, durationHist: emptyHarnessHistogram(), outputHist: emptyHarnessHistogram(), outputSum: 0, outputSamples: 0 };
      map.set(name, tool);
    }
    const t = tool as { -readonly [K in keyof ToolAggregate]: ToolAggregate[K] };
    t.pluginId ??= row.plugin_id ? String(row.plugin_id) : null;
    t.exposures += n(row.exposures); t.calls += n(row.calls); t.completed += n(row.completed); t.failed += n(row.failed); t.denied += n(row.denied); t.aborted += n(row.aborted); t.unknownOutcome += n(row.unknown_outcome);
    t.schemaSum += n(row.schema_tokens); t.schemaSamples += n(row.schema_samples); t.outputSum += n(row.output_tokens); t.outputSamples += n(row.output_samples);
    t.truncated += n(row.truncated); t.repeatedSameArgs += n(row.repeated); t.retryAfterFailure += n(row.retried); t.foldedOutputs += n(row.folded); t.foldedTokens += n(row.folded_tokens);
    if (row.last_used_at && (!t.lastUsedAt || String(row.last_used_at) > t.lastUsedAt)) t.lastUsedAt = String(row.last_used_at);
    addHarnessHistograms(t.durationHist, parseArray(row.duration_hist)); addHarnessHistograms(t.outputHist, parseArray(row.output_hist));
    const codes = parseObject(row.failure_codes);
    if (Object.keys(codes).length) {
      const merged = new Map(t.failureCodes.map(item => [item.code, item.count]));
      for (const [code, count] of Object.entries(codes)) merged.set(code, (merged.get(code) ?? 0) + n(count));
      t.failureCodes = [...merged].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
    }
  }
  for (const tool of map.values()) {
    const t = tool as { -readonly [K in keyof ToolAggregate]: ToolAggregate[K] };
    t.pluginId = ownerPlugin(owners, t.name, t.pluginId);
    t.schemaTokens = avg(t.schemaSum, t.schemaSamples);
    t.outputTokensAvg = avg(t.outputSum, t.outputSamples);
    t.outputTokensP95 = harnessHistogramQuantile(t.outputHist, 0.95, HARNESS_TOKEN_BASE);
    t.durationP50Ms = harnessHistogramQuantile(t.durationHist, 0.5, HARNESS_DURATION_BASE_MS);
    t.durationP95Ms = harnessHistogramQuantile(t.durationHist, 0.95, HARNESS_DURATION_BASE_MS);
  }
  return { rows: [...map.values()].sort((a, b) => b.calls - a.calls || b.exposures - a.exposures || a.name.localeCompare(b.name)), raw };
}
type ToolOwners = Map<string, { plugin: string; toolPluginId: string | null }>;
function toolOwners(scope: Scope): ToolOwners {
  const revision = scope.filter.revision ?? currentRevision(scope.db);
  const rows = prepare(scope.db, "SELECT tool,plugin,tool_plugin_id,revision FROM harness_tool_owner ORDER BY (revision=?) ASC,last_seen ASC").all(revision ?? "") as Row[];
  return new Map(rows.map(row => [String(row.tool), { plugin: String(row.plugin), toolPluginId: row.tool_plugin_id ? String(row.tool_plugin_id) : null }]));
}
/**
 * 工具归属统一用加载器的插件 ID（插件页的行 ID，如 `filesystem-read`）。
 * Journal 里工具自报的是 toolPluginId（如 `actspace.filesystem-read`），两者不同，
 * 所以先按工具名查归属表，再按 toolPluginId 反查，都查不到才用 Journal 里的原值。
 */
function ownerPlugin(owners: ToolOwners, tool: string, journalPluginId: string | null): string | null {
  const owned = owners.get(tool)?.plugin;
  if (owned) return owned;
  if (journalPluginId) for (const value of owners.values()) if (value.toolPluginId === journalPluginId) return value.plugin;
  return journalPluginId;
}
const publicTool = (tool: ToolAggregate): HarnessToolRow => {
  const { schemaSum: _a, schemaSamples: _b, durationHist: _c, outputHist: _d, outputSum: _e, outputSamples: _f, ...row } = tool;
  return row;
};
function tools(scope: Scope): HarnessStatsTools {
  const { rows, raw } = toolAggregates(scope);
  const sum = (column: string, predicate: (row: Row) => boolean = () => true) => raw.filter(predicate).reduce((total, row) => total + n(row[column]), 0);
  const bash = (row: Row) => row.tool === "bash";
  return {
    rows: rows.map(publicTool),
    approvals: {
      asked: sum("approval_asked"), userApproved: sum("approval_user_approved"), userDenied: sum("approval_user_denied"), timedOut: sum("approval_timed_out"),
      autoApproved: sum("approval_auto_approved"), autoDeclined: sum("approval_auto_declined"), sessionGrantUsed: sum("approval_session_grant"), scopeDenied: sum("approval_scope_denied"),
      avgWaitMs: avg(sum("approval_wait_ms"), sum("approval_wait_samples")),
    },
    bash: { sandboxed: sum("sandboxed", bash), unsandboxed: sum("unsandboxed", bash), unknownEnvironment: sum("unknown_env", bash), escalations: sum("escalations", bash), background: sum("background", bash), foreground: Math.max(0, sum("calls", bash) - sum("background", bash)) },
    waste: { repeatedSameArgs: sum("repeated"), retryAfterFailure: sum("retried"), truncated: sum("truncated"), foldedOutputs: sum("folded"), foldedTokens: sum("folded_tokens") },
  };
}

/* -------------------------------- 插件 -------------------------------- */

function plugins(scope: Scope): HarnessStatsPlugins {
  const inventory = inventoryRows(scope);
  const since = sinceHour(scope.filter.range, scope.now);
  const loads = prepare(scope.db, `SELECT plugin,SUM(loads) AS loads,SUM(failures) AS failures,MAX(last_error) AS last_error,GROUP_CONCAT(load_hist,'|') AS hists FROM harness_plugin_inventory WHERE 1=1 ${since ? "AND last_seen>=?" : ""} ${scope.filter.revision ? "AND revision=?" : ""} GROUP BY plugin`).all(...[since, scope.filter.revision].filter((value): value is string => !!value)) as Row[];
  const owners = toolOwners(scope);
  const { rows: toolRows } = toolAggregates(scope);
  const service = scope.runtime("plugin,name,method,provider,SUM(calls) AS calls,SUM(errors) AS errors,SUM(total_ms) AS total_ms,GROUP_CONCAT(histogram,'|') AS hists", "GROUP BY plugin,name,method,provider", "kind='service'");
  const listener = scope.runtime("plugin,name,SUM(calls) AS calls,SUM(errors) AS errors,SUM(total_ms) AS total_ms", "GROUP BY plugin,name", "kind='listener'");
  const dependency = scope.runtime("plugin,name,method,SUM(calls) AS calls", "GROUP BY plugin,name,method ORDER BY 4 DESC", "kind='dependency'");
  const owner = scope.all("t.owner AS owner,SUM(t.events) AS events", "harness_owner_rollup", "GROUP BY t.owner");
  const events = new Map(owner.map(row => [String(row.owner), n(row.events)]));
  const ids = new Set<string>([...inventory.map(row => String(row.plugin)), ...loads.map(row => String(row.plugin)), ...[...owners.values()].map(value => value.plugin)]);
  const sources = new Map(inventory.map(row => [String(row.plugin), String(row.source) as HarnessPluginSource]));
  const rows: HarnessPluginRow[] = [...ids].map(pluginId => {
    const pluginTools = toolRows.filter(tool => tool.pluginId === pluginId);
    const toolPluginIds = new Set([...owners.entries()].filter(([, value]) => value.plugin === pluginId).map(([, value]) => value.toolPluginId).filter((value): value is string => !!value));
    const provided = service.filter(row => row.provider === pluginId);
    const listening = listener.filter(row => row.plugin === pluginId);
    const load = loads.find(row => row.plugin === pluginId);
    const loadHist = String(load?.hists ?? "").split("|").filter(Boolean).reduce((total, value) => addHarnessHistograms(total, parseArray(value)), emptyHarnessHistogram());
    return {
      pluginId, source: sources.get(pluginId) ?? "unknown", tools: pluginTools.length,
      toolCalls: pluginTools.reduce((sum, tool) => sum + tool.calls, 0), toolFailures: pluginTools.reduce((sum, tool) => sum + tool.failed, 0),
      contextTokens: pluginTools.some(tool => tool.schemaTokens !== null) ? pluginTools.reduce((sum, tool) => sum + (tool.schemaTokens ?? 0), 0) : null,
      services: new Set(provided.map(row => String(row.name))).size, serviceCalls: provided.reduce((sum, row) => sum + n(row.calls), 0),
      listeners: listening.length, listenerCalls: listening.reduce((sum, row) => sum + n(row.calls), 0), listenerErrors: listening.reduce((sum, row) => sum + n(row.errors), 0),
      journalEvents: (events.get(pluginId) ?? 0) + [...toolPluginIds].filter(id => id !== pluginId).reduce((sum, id) => sum + (events.get(id) ?? 0), 0),
      loads: n(load?.loads), loadFailures: n(load?.failures), loadP50Ms: harnessHistogramQuantile(loadHist, 0.5, HARNESS_DURATION_BASE_MS), lastLoadError: load?.last_error ? String(load.last_error) : null,
    };
  }).sort((a, b) => b.toolCalls + b.serviceCalls - (a.toolCalls + a.serviceCalls) || a.pluginId.localeCompare(b.pluginId));
  const services: HarnessServiceRow[] = [];
  const byService = new Map<string, HarnessServiceRow & { hist: number[]; total: number }>();
  for (const row of service) {
    const key = `${row.provider ?? ""}\0${row.name}\0${row.method}`;
    const current = byService.get(key) ?? { providerPluginId: row.provider ? String(row.provider) : null, service: String(row.name), method: String(row.method), calls: 0, errors: 0, avgMs: null, p95Ms: null, hist: emptyHarnessHistogram(), total: 0 };
    (current as { calls: number }).calls += n(row.calls); (current as { errors: number }).errors += n(row.errors); current.total += n(row.total_ms);
    for (const value of String(row.hists ?? "").split("|")) if (value) addHarnessHistograms(current.hist, parseArray(value));
    byService.set(key, current);
  }
  for (const value of byService.values()) { const { hist, total, ...row } = value; services.push({ ...row, avgMs: avg(total, row.calls), p95Ms: harnessHistogramQuantile(hist, 0.95, HARNESS_DURATION_BASE_MS) }); }
  // 声明提供、但范围内一次都没被调用的服务也列出来（「服务从未被调用」的依据）。
  for (const row of inventory) for (const name of parseArray(row.provides) as unknown as string[]) {
    if (typeof name === "string" && !services.some(item => item.providerPluginId === row.plugin && item.service === name)) services.push({ providerPluginId: String(row.plugin), service: name, method: "", calls: 0, errors: 0, avgMs: null, p95Ms: null });
  }
  services.sort((a, b) => b.calls - a.calls || a.service.localeCompare(b.service));
  const providerOf = new Map(services.map(row => [row.service, row.providerPluginId]));
  const runtimeEmpty = !(prepare(scope.db, "SELECT 1 FROM harness_runtime_hourly LIMIT 1").get() || prepare(scope.db, "SELECT 1 FROM harness_plugin_inventory LIMIT 1").get());
  return {
    rows, services,
    dependencies: dependency.map(row => ({ caller: String(row.plugin), callee: String(row.name || providerOf.get(String(row.method)) || ""), service: String(row.method), calls: n(row.calls) })),
    listeners: listener.map(row => ({ pluginId: String(row.plugin), event: String(row.name), calls: n(row.calls), errors: n(row.errors), avgMs: avg(n(row.total_ms), n(row.calls)) })).sort((a, b) => b.calls - a.calls),
    runtimeFilterLimited: scope.runtimeLimited, runtimeEmpty,
  };
}

/* ------------------------------ 上下文与 Skills ------------------------------ */

const BUCKET_COLUMNS = [["systemPrompt", "b_system"], ["tools", "b_tools"], ["rules", "b_rules"], ["skills", "b_skills"], ["summarizedConversation", "b_summarized"], ["conversation", "b_conversation"]] as const;
function bucketAverages(scope: Scope): { buckets: { bucket: string; avgTokens: number }[]; avgEstimated: number | null; samples: number } {
  const row = scope.get(`COUNT(*) AS samples,SUM(t.estimated) AS estimated,${BUCKET_COLUMNS.map(([, column]) => `SUM(t.${column}) AS ${column}`).join(",")}`, "harness_request", { extra: "t.has_manifest=1" });
  const samples = n(row.samples);
  return { samples, avgEstimated: avg(n(row.estimated), samples), buckets: BUCKET_COLUMNS.map(([bucket, column]) => ({ bucket, avgTokens: samples ? n(row[column]) / samples : 0 })) };
}
function sourceRows(scope: Scope): HarnessSourceRow[] {
  return scope.all("t.entry_key AS key,MAX(t.kind) AS kind,MAX(t.owner) AS owner,MAX(t.entry_id) AS id,SUM(t.appearances) AS appearances,SUM(t.tokens) AS tokens,MAX(t.max_tokens) AS max_tokens,SUM(t.changes) AS changes,SUM(t.compared) AS compared", "harness_entry_rollup", "GROUP BY t.entry_key ORDER BY SUM(t.tokens) DESC LIMIT 400")
    .map(row => ({ key: String(row.key), kind: String(row.kind ?? "other") as HarnessSourceRow["kind"], owner: row.owner ? String(row.owner) : null, id: String(row.id ?? row.key), appearances: n(row.appearances), avgTokens: n(row.tokens) / Math.max(1, n(row.appearances)), maxTokens: n(row.max_tokens), changeRate: ratio(n(row.changes), n(row.compared)) }));
}
function skillRows(scope: Scope): HarnessSkillRow[] {
  return scope.all("t.skill_id AS id,MAX(t.source) AS source,SUM(t.listed) AS listed,SUM(t.selected) AS selected,SUM(t.skill_reads) AS skill_reads,SUM(t.asset_reads) AS asset_reads,MAX(t.last_read_at) AS last_read_at", "harness_skill_rollup", "GROUP BY t.skill_id ORDER BY SUM(t.skill_reads)+SUM(t.asset_reads) DESC,SUM(t.listed) DESC")
    .map(row => ({ id: String(row.id), source: row.source ? String(row.source) : null, listed: n(row.listed), selected: n(row.selected), skillReads: n(row.skill_reads), assetReads: n(row.asset_reads), lastReadAt: row.last_read_at ? String(row.last_read_at) : null }));
}
function context(scope: Scope): HarnessStatsContext {
  const { buckets, avgEstimated } = bucketAverages(scope);
  const totals = scope.get("COUNT(*) AS requests,SUM(CASE WHEN t.has_manifest=1 THEN 0 ELSE 1 END) AS incomplete,SUM(t.input_tokens) AS input,SUM(t.cache_read) AS cache_read,SUM(t.cache_write) AS cache_write", "harness_request");
  const ratios = scope.all("t.estimated*1.0/t.context_window AS ratio", "harness_request", "", { extra: "t.has_manifest=1 AND t.context_window>0 AND t.estimated IS NOT NULL" }).map(row => n(row.ratio)).sort((a, b) => a - b);
  const quantile = (q: number) => ratios.length ? ratios[Math.min(ratios.length - 1, Math.max(0, Math.ceil(ratios.length * q) - 1))]! : null;
  const estimates = scope.all("t.model AS model,AVG(ABS((COALESCE(t.input_tokens,0)+COALESCE(t.cache_read,0)+COALESCE(t.cache_write,0))-t.estimated)*1.0/(COALESCE(t.input_tokens,0)+COALESCE(t.cache_read,0)+COALESCE(t.cache_write,0))) AS delta,COUNT(*) AS samples", "harness_request", "GROUP BY t.model", { extra: "t.has_manifest=1 AND t.estimated>0 AND COALESCE(t.input_tokens,0)+COALESCE(t.cache_read,0)+COALESCE(t.cache_write,0)>0" });
  const samples = estimates.reduce((sum, row) => sum + n(row.samples), 0);
  const worst = estimates.filter(row => n(row.samples) >= 5).sort((a, b) => n(b.delta) - n(a.delta))[0];
  const changes = scope.get("SUM(CASE WHEN t.bucket='systemPrompt' THEN t.changes ELSE 0 END) AS system,SUM(CASE WHEN t.kind='supplement' THEN t.changes ELSE 0 END) AS runtime", "harness_entry_rollup");
  const input = n(totals.input) + n(totals.cache_read) + n(totals.cache_write);
  return {
    requests: n(totals.requests), incompleteRequests: n(totals.incomplete), buckets, avgEstimatedTokens: avgEstimated,
    window: { p50: quantile(0.5), p95: quantile(0.95), overThreshold: ratios.filter(value => value >= 0.8).length },
    estimate: { deltaRate: samples ? estimates.reduce((sum, row) => sum + n(row.delta) * n(row.samples), 0) / samples : null, worstModel: worst ? String(worst.model ?? "") : null, worstDeltaRate: worst ? n(worst.delta) : null, samples },
    cache: { hitRate: ratio(n(totals.cache_read), input), systemChanges: n(changes.system), runtimeChanges: n(changes.runtime) },
    sources: sourceRows(scope), skills: skillRows(scope), skillsCatalogTokens: buckets.find(bucket => bucket.bucket === "skills")?.avgTokens ?? null,
  };
}

/* ------------------------------ 披露与压缩 ------------------------------ */

function disclosure(scope: Scope): HarnessStatsDisclosure {
  const cycles = scope.all("t.active AS active,t.active_read AS active_read,t.cap_hit AS cap_hit,t.index_tokens AS index_tokens", "harness_disclosure_cycle");
  const finished = cycles.filter(row => row.active_read !== null && row.active_read !== undefined && n(row.active) > 0);
  const activeHistogram = Array.from({ length: 11 }, () => 0);
  for (const row of finished) activeHistogram[Math.min(10, Math.floor(n(row.active_read) / n(row.active) * 10))]! += 1;
  const rollup = scope.all("t.*", "harness_disclosure_rollup");
  const sum = (column: string) => rollup.reduce((total, row) => total + n(row[column]), 0);
  const sleepHistogram = rollup.reduce((total, row) => { const values = parseArray(row.sleep_hist); for (let index = 0; index < HARNESS_SLEEP_BUCKETS; index++) total[index]! += values[index] ?? 0; return total; }, Array.from({ length: HARNESS_SLEEP_BUCKETS }, () => 0));
  const indexTokens = cycles.filter(row => row.index_tokens != null).map(row => n(row.index_tokens));
  const compactions = scope.all("t.*", "harness_compaction");
  const ok = compactions.filter(row => n(row.ok) === 1);
  const stepsBetween = Array.from({ length: 9 }, () => 0);
  for (const row of ok) if (row.steps_since != null) stepsBetween[Math.min(8, Math.floor(n(row.steps_since) / 10))]! += 1;
  const windows = ok.filter(row => row.window_ratio != null).map(row => n(row.window_ratio)).sort((a, b) => a - b);
  const failures = new Map<string, number>();
  for (const row of compactions) if (n(row.ok) !== 1) failures.set(String(row.failure_code ?? "unknown"), (failures.get(String(row.failure_code ?? "unknown")) ?? 0) + 1);
  const mean = (rows: Row[], column: string) => { const values = rows.filter(row => row[column] != null).map(row => n(row[column])); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
  return {
    cycles: cycles.length,
    activeHitRate: ratio(finished.reduce((total, row) => total + n(row.active_read), 0), finished.reduce((total, row) => total + n(row.active), 0)),
    sleepingReads: sum("sleeping_reads"), wakeShare: ratio(sum("sleeping_reads"), sum("reads")), avgSleepCycles: avg(sum("wake_cycles"), sum("wakes")),
    misSleepRate: ratio(sum("mis_sleeps"), sum("slept_paths")), sleepingPaths: sum("slept_paths"),
    indexTokensAvg: indexTokens.length ? indexTokens.reduce((a, b) => a + b, 0) / indexTokens.length : null,
    indexReads: sum("index_reads"), indexConversions: sum("index_conversions"), capHits: cycles.filter(row => n(row.cap_hit) === 1).length,
    activeHistogram, sleepHistogram,
    topPaths: scope.all("t.path AS path,SUM(t.reads) AS reads", "harness_path_reads", "GROUP BY t.path ORDER BY 2 DESC LIMIT 50").map(row => ({ path: String(row.path), reads: n(row.reads) })),
    compaction: {
      count: ok.length, auto: ok.filter(row => row.trigger === "auto").length, manual: ok.filter(row => row.trigger === "manual").length, failed: compactions.length - ok.length,
      avgBeforeTokens: mean(ok, "before_tokens"), avgAfterTokens: mean(ok, "after_tokens"), avgDurationMs: mean(ok, "duration_ms"),
      rereadRate: ratio(ok.filter(row => n(row.reread) > 0).length, ok.length),
      triggerWindowP50: windows.length ? windows[Math.max(0, Math.ceil(windows.length / 2) - 1)]! : null,
      stepsBetweenHistogram: stepsBetween,
      foldedOutputs: ok.reduce((total, row) => total + n(row.folded), 0), foldedTokens: ok.reduce((total, row) => total + n(row.folded_tokens), 0),
      failureReasons: [...failures].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    },
  };
}

/* -------------------------------- 运行 -------------------------------- */

const STEP_EDGES = [1, 3, 5, 8, 12, 16, 24, 32, 48, 64];
function runtime(scope: Scope): HarnessStatsRuntime {
  const turns = scope.all("t.steps AS steps,t.reason AS reason", "harness_turn");
  const stepsHistogram = Array.from({ length: 11 }, () => 0);
  for (const row of turns) { const steps = n(row.steps); const index = STEP_EDGES.findIndex(edge => steps <= edge); stepsHistogram[index < 0 ? 10 : index]! += 1; }
  const reasons = { completed: 0, aborted: 0, failed: 0, stepLimit: 0, other: 0 };
  for (const row of turns) { const reason = String(row.reason ?? "other"); if (reason === "completed" || reason === "aborted" || reason === "failed") reasons[reason]++; else if (reason === "step-limit") reasons.stepLimit++; else reasons.other++; }
  const session = scope.all("t.*", "harness_session_rollup");
  const sum = (column: string) => session.reduce((total, row) => total + n(row[column]), 0);
  const retryCodes = new Map<string, number>();
  for (const row of session) for (const [code, count] of Object.entries(parseObject(row.retry_codes))) retryCodes.set(code, (retryCodes.get(code) ?? 0) + n(count));
  // 子 Agent：父会话的 requested 行带维度，其余字段可能来自子会话的终止事件，按 invocation 合并。
  const invocations = new Set(scope.all("t.invocation_id AS id", "harness_delegation").map(row => String(row.id)));
  const delegations = new Map<string, Row>();
  for (const row of prepare(scope.db, "SELECT * FROM harness_delegation").all() as Row[]) {
    const id = String(row.invocation_id); if (!invocations.has(id)) continue;
    const current = delegations.get(id) ?? {};
    for (const [key, value] of Object.entries(row)) if (value !== null && value !== undefined && !(key === "status" && value === "running" && current.status)) current[key] = value;
    delegations.set(id, current);
  }
  const presets = new Map<string, number>();
  for (const row of delegations.values()) presets.set(String(row.preset_id ?? "unknown"), (presets.get(String(row.preset_id ?? "unknown")) ?? 0) + 1);
  const children = [...delegations.values()].map(row => row.child_session_id).filter((id): id is string => typeof id === "string");
  const childSteps = children.length ? prepare(scope.db, `SELECT session_id,SUM(steps) AS steps FROM harness_turn WHERE session_id IN (${children.map(() => "?").join(",")}) GROUP BY session_id`).all(...children) as Row[] : [];
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const background = scope.all("t.*", "harness_background_task");
  const kinds = new Map<string, number>();
  for (const row of background) kinds.set(String(row.kind ?? "unknown"), (kinds.get(String(row.kind ?? "unknown")) ?? 0) + 1);
  const sides = scope.all("t.session_id AS id,COUNT(*) AS turns", "harness_turn", "GROUP BY t.session_id", { extra: "m.kind='side'" });
  const modes = scope.all("t.mode AS mode,COUNT(*) AS requests", "harness_request", "GROUP BY t.mode ORDER BY 2 DESC");
  return {
    turns: turns.length, avgSteps: mean(turns.map(row => n(row.steps))), stepLimitHits: reasons.stepLimit, stepsHistogram, endReasons: reasons,
    retries: { total: sum("retries"), byCode: [...retryCodes].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count) },
    interventions: { aborted: reasons.aborted, steering: sum("steering"), queued: sum("queued") },
    delegations: {
      byPreset: [...presets].map(([presetId, count]) => ({ presetId, count, avgDurationMs: mean([...delegations.values()].filter(row => String(row.preset_id ?? "unknown") === presetId && row.duration_ms != null).map(row => n(row.duration_ms))) })).sort((a, b) => b.count - a.count),
      failed: [...delegations.values()].filter(row => row.status === "failed" || row.status === "error").length,
      avgSteps: mean(childSteps.map(row => n(row.steps))),
      avgDurationMs: mean([...delegations.values()].filter(row => row.duration_ms != null).map(row => n(row.duration_ms))),
      avgReturnTokens: mean([...delegations.values()].filter(row => row.return_tokens != null).map(row => n(row.return_tokens))),
    },
    background: {
      byKind: [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
      completed: background.filter(row => row.status === "completed").length, failed: background.filter(row => row.status === "failed" || row.status === "lost" || row.status === "timed_out").length,
      stopped: background.filter(row => row.status === "stopped" || row.status === "cancelled").length,
      avgDurationMs: mean(background.filter(row => row.duration_ms != null).map(row => n(row.duration_ms))),
      unread: background.filter(isUnreadTask).length,
    },
    sideChats: { sessions: sides.length, avgTurns: mean(sides.map(row => n(row.turns))) },
    modeSwitches: sum("mode_switches"),
    modeShare: modes.map(row => ({ mode: String(row.mode || "unknown"), requests: n(row.requests) })),
    auxiliary: scope.all("t.purpose AS purpose,SUM(t.calls) AS calls,SUM(t.failed) AS failed,SUM(t.total_ms) AS total_ms", "harness_aux_rollup", "GROUP BY t.purpose ORDER BY 2 DESC").map(row => ({ purpose: String(row.purpose), calls: n(row.calls), failed: n(row.failed), avgMs: avg(n(row.total_ms), n(row.calls)) })),
  };
}
function isUnreadTask(row: Row): boolean {
  const status = String(row.status ?? "running");
  if (status === "running" || status === "stopped" || status === "cancelled" || status === "lost") return false;
  return !n(row.read) && row.delivery !== "wait" && row.delivery !== "stopped";
}

/* ------------------------------ 版本对比 ------------------------------ */

function versions(scope: Scope, compare?: { from: string; to: string }): HarnessStatsVersions {
  const revisions = revisionInfos(scope);
  const withData = revisions.filter(info => info.requests > 0);
  const to = compare?.to ?? withData[0]?.key ?? null;
  const from = compare?.from ?? withData.find(info => info.key !== to)?.key ?? null;
  const metrics = (revision: string | null) => revision ? revisionMetrics(scope, revision) : null;
  const a = metrics(from); const b = metrics(to);
  const rows: HarnessCompareRow[] = COMPARE.map(item => ({ id: item.id, label: item.label, better: item.better, format: item.format, from: a ? a[item.id] ?? null : null, to: b ? b[item.id] ?? null : null }));
  const evolution = scope.all("t.action AS action,COUNT(*) AS count,SUM(CASE WHEN t.status IN ('completed','running') THEN 0 ELSE 1 END) AS failed", "harness_evolution_op", "GROUP BY t.action ORDER BY 2 DESC");
  const evolved = prepare(scope.db, "SELECT DISTINCT plugin FROM harness_plugin_inventory WHERE source='evolved'").all() as Row[];
  const toolRows = evolved.length ? toolAggregates(scope).rows : [];
  return {
    revisions, from, to, compare: rows,
    lowSample: [from, to].some(key => key !== null && (revisions.find(info => info.key === key)?.requests ?? 0) < HARNESS_COMPARE_MIN_REQUESTS),
    evolutionOps: evolution.map(row => ({ action: String(row.action ?? "unknown"), count: n(row.count), failed: n(row.failed) })),
    evolvedPlugins: evolved.map(row => {
      const plugin = String(row.plugin);
      const pluginTools = toolRows.filter(tool => tool.pluginId === plugin);
      const names = pluginTools.map(tool => tool.name);
      const sessions = names.length ? n(scope.get("COUNT(DISTINCT t.session_id) AS sessions", "harness_tool_rollup", { extra: `t.calls>0 AND t.tool IN (${names.map(name => `'${name.replaceAll("'", "''")}'`).join(",")})` }).sessions) : 0;
      return { pluginId: plugin, calls: pluginTools.reduce((sum, tool) => sum + tool.calls, 0), failures: pluginTools.reduce((sum, tool) => sum + tool.failed, 0), sessions };
    }),
  };
}
const COMPARE: readonly { id: string; label: string; better: "lower" | "higher"; format: HarnessCompareRow["format"] }[] = [
  { id: "requests", label: "模型请求", better: "higher", format: "count" },
  { id: "avgContext", label: "每次请求的上下文", better: "lower", format: "tokens" },
  { id: "toolsTokens", label: "工具定义占用", better: "lower", format: "tokens" },
  { id: "toolFailureRate", label: "工具失败率", better: "lower", format: "rate" },
  { id: "callsPerTurn", label: "每轮工具调用", better: "lower", format: "number" },
  { id: "stepsPerTurn", label: "每轮步数", better: "lower", format: "number" },
  { id: "stepLimitRate", label: "碰到步数上限", better: "lower", format: "rate" },
  { id: "retriesPer100", label: "每百次请求的模型重试", better: "lower", format: "number" },
  { id: "cacheHitRate", label: "缓存命中率", better: "higher", format: "rate" },
  { id: "compactionsPer100Turns", label: "每百轮压缩次数", better: "lower", format: "number" },
  { id: "rereadRate", label: "压缩后重读率", better: "lower", format: "rate" },
  { id: "activeHitRate", label: "活跃路径命中率", better: "higher", format: "rate" },
  { id: "misSleepRate", label: "误睡率", better: "lower", format: "rate" },
];
function revisionMetrics(scope: Scope, revision: string): Record<string, number | null> {
  const options = { revision };
  const request = scope.get("COUNT(*) AS requests,SUM(CASE WHEN t.has_manifest=1 THEN t.estimated END) AS estimated,SUM(CASE WHEN t.has_manifest=1 THEN t.b_tools END) AS tools,SUM(CASE WHEN t.has_manifest=1 THEN 1 END) AS samples,SUM(t.input_tokens) AS input,SUM(t.cache_read) AS cache_read,SUM(t.cache_write) AS cache_write", "harness_request", options);
  const tool = scope.get("SUM(t.calls) AS calls,SUM(t.failed) AS failed", "harness_tool_rollup", options);
  const turn = scope.get("COUNT(*) AS turns,SUM(t.steps) AS steps,SUM(CASE WHEN t.reason='step-limit' THEN 1 ELSE 0 END) AS limits", "harness_turn", options);
  const session = scope.get("SUM(t.retries) AS retries", "harness_session_rollup", options);
  const compaction = scope.get("SUM(CASE WHEN t.ok=1 THEN 1 ELSE 0 END) AS count,SUM(CASE WHEN t.ok=1 AND t.reread>0 THEN 1 ELSE 0 END) AS reread", "harness_compaction", options);
  const cycle = scope.get("SUM(t.active_read) AS hit,SUM(CASE WHEN t.active_read IS NOT NULL THEN t.active END) AS active", "harness_disclosure_cycle", options);
  const disclosure = scope.get("SUM(t.mis_sleeps) AS mis,SUM(t.slept_paths) AS slept", "harness_disclosure_rollup", options);
  const input = n(request.input) + n(request.cache_read) + n(request.cache_write);
  return {
    requests: n(request.requests), avgContext: avg(n(request.estimated), n(request.samples)), toolsTokens: avg(n(request.tools), n(request.samples)),
    toolFailureRate: ratio(n(tool.failed), n(tool.calls)), callsPerTurn: ratio(n(tool.calls), n(turn.turns)), stepsPerTurn: ratio(n(turn.steps), n(turn.turns)),
    stepLimitRate: ratio(n(turn.limits), n(turn.turns)), retriesPer100: n(request.requests) ? n(session.retries) / n(request.requests) * 100 : null,
    cacheHitRate: ratio(n(request.cache_read), input), compactionsPer100Turns: n(turn.turns) ? n(compaction.count) / n(turn.turns) * 100 : null,
    rereadRate: ratio(n(compaction.reread), n(compaction.count)), activeHitRate: ratio(n(cycle.hit), n(cycle.active)), misSleepRate: ratio(n(disclosure.mis), n(disclosure.slept)),
  };
}

/* ------------------------------ 总览与规则 ------------------------------ */

function overview(scope: Scope): HarnessStatsOverview {
  const { buckets, avgEstimated } = bucketAverages(scope);
  const daily = new Map<string, number>();
  for (const row of scope.all("t.hour AS hour,SUM(t.calls) AS calls", "harness_tool_rollup", "GROUP BY t.hour")) {
    const time = Date.parse(`${String(row.hour)}:00:00.000Z`); if (!Number.isFinite(time)) continue;
    const local = new Date(time); const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    daily.set(day, (daily.get(day) ?? 0) + n(row.calls));
  }
  const revision = currentRevision(scope.db);
  const inventory = revision ? prepare(scope.db, "SELECT COUNT(*) AS plugins FROM harness_plugin_inventory WHERE revision=?").get(revision) as Row : {};
  const toolPlugins = revision ? prepare(scope.db, "SELECT COUNT(DISTINCT plugin) AS plugins,COUNT(*) AS tools FROM harness_tool_owner WHERE revision=?").get(revision) as Row : {};
  const since = revision ? prepare(scope.db, "SELECT selected_at FROM harness_revision_info WHERE revision=?").get(revision) as Row | undefined : undefined;
  const health = (prepare(scope.db, "SELECT write_failures,file_bytes,last_rebuild_at FROM harness_stats_health WHERE id=1").get() ?? {}) as Row;
  return {
    flags: flags(scope), dailyToolCalls: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, value })), buckets, avgEstimatedTokens: avgEstimated,
    harness: { currentRevision: revision, currentSince: since?.selected_at ? String(since.selected_at) : null, plugins: n(inventory.plugins), toolPlugins: n(toolPlugins.plugins), tools: n(toolPlugins.tools), statsFileBytes: n(health.file_bytes), statsWriteFailures: n(health.write_failures), lastRebuildAt: health.last_rebuild_at ? String(health.last_rebuild_at) : null },
  };
}

const pct = (value: number) => `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
export function flags(scope: Scope): HarnessFlag[] {
  const R = HARNESS_FLAG_RULES; const out: HarnessFlag[] = [];
  const { rows: toolRows } = toolAggregates(scope);
  for (const tool of toolRows) {
    const rate = tool.exposures ? tool.calls / tool.exposures : 0;
    if (tool.exposures >= R.toolCostlyUnused.minExposures && (tool.schemaTokens ?? 0) >= R.toolCostlyUnused.minSchemaTokens && rate < R.toolCostlyUnused.maxCallRate)
      out.push({ rule: "tool-costly-unused", level: "warn", title: `${tool.name} 占用高、使用少`, detail: `定义约 ${Math.round(tool.schemaTokens ?? 0)} token，出现 ${tool.exposures} 次请求，只调用 ${tool.calls} 次（${pct(rate)}）`, category: "工具 · 成本 vs 使用", target: { tab: "tools", key: tool.name } });
    if (tool.calls >= R.toolFailureRate.minCalls && tool.failed / tool.calls > R.toolFailureRate.minFailureRate)
      out.push({ rule: "tool-failure-rate", level: "error", title: `${tool.name} 失败率 ${pct(tool.failed / tool.calls)}`, detail: `${tool.calls} 次调用失败 ${tool.failed} 次${tool.failureCodes[0] ? `，最多的原因 ${tool.failureCodes[0].code}` : ""}`, category: "工具 · 失败", target: { tab: "tools", key: tool.name } });
  }
  const plugin = plugins(scope);
  for (const row of plugin.rows) {
    const pluginTools = toolRows.filter(tool => tool.pluginId === row.pluginId);
    const exposures = Math.max(0, ...pluginTools.map(tool => tool.exposures));
    if (row.tools > 0 && exposures >= R.pluginCostlyUnused.minExposures && (row.contextTokens ?? 0) >= R.pluginCostlyUnused.minSchemaTokens && row.toolCalls / exposures < R.pluginCostlyUnused.maxCallRate)
      out.push({ rule: "plugin-costly-unused", level: "warn", title: `${row.pluginId} 占用高、使用少`, detail: `${row.tools} 个工具定义合计约 ${Math.round(row.contextTokens ?? 0)} token，${exposures} 次请求里调用 ${row.toolCalls} 次`, category: "插件 · 成本 vs 使用", target: { tab: "plugins", key: row.pluginId } });
    if (row.loadFailures >= R.pluginLoadFailure.minFailures)
      out.push({ rule: "plugin-load-failure", level: "error", title: `${row.pluginId} 加载失败 ${row.loadFailures} 次`, detail: row.lastLoadError ?? "没有记录失败原因", category: "插件 · 生命周期", target: { tab: "plugins", key: row.pluginId } });
  }
  for (const listener of plugin.listeners) if (listener.errors >= R.listenerErrors.minErrors)
    out.push({ rule: "listener-errors", level: "error", title: `${listener.pluginId} 的 ${listener.event} 监听报错 ${listener.errors} 次`, detail: `共触发 ${listener.calls} 次`, category: "插件 · 监听", target: { tab: "plugins", key: listener.pluginId } });
  if (!plugin.runtimeEmpty && scope.rangeDays >= R.serviceNeverCalled.minRangeDays)
    for (const service of plugin.services) if (service.calls === 0 && service.method === "")
      out.push({ rule: "service-never-called", level: "info", title: `服务 ${service.service} 从未被调用`, detail: `由 ${service.providerPluginId ?? "未知插件"} 提供，所选范围内 0 次调用`, category: "插件 · 服务", target: { tab: "plugins", key: service.providerPluginId ?? undefined } });
  const unread = skillRows(scope).filter(skill => skill.listed >= R.skillNeverRead.minListed && skill.skillReads + skill.assetReads === 0);
  if (unread.length > 3) {
    const names = unread.slice(0, 5).map(skill => skill.id).join("、");
    out.push({ rule: "skill-never-read", level: "info", title: `${unread.length} 个 Skill 从未被读取`, detail: `每个都列出了至少 ${R.skillNeverRead.minListed} 次，0 次读取：${names}${unread.length > 5 ? " 等" : ""}`, category: "上下文 · Skills", target: { tab: "context" } });
  } else for (const skill of unread)
    out.push({ rule: "skill-never-read", level: "info", title: `Skill ${skill.id} 从未被读取`, detail: `列出 ${skill.listed} 次，0 次读取`, category: "上下文 · Skills", target: { tab: "context", key: skill.id } });
  const d = disclosure(scope);
  if (d.compaction.count >= R.compactionReread.minCompactions && (d.compaction.rereadRate ?? 0) > R.compactionReread.minRate)
    out.push({ rule: "compaction-reread", level: "warn", title: `压缩后重读率 ${pct(d.compaction.rereadRate ?? 0)}`, detail: `${d.compaction.count} 次压缩里，压缩后 5 步内又读了之前读过的文件`, category: "压缩", target: { tab: "disclosure" } });
  if (d.sleepingPaths >= R.misSleep.minSleepingPaths && (d.misSleepRate ?? 0) > R.misSleep.minRate)
    out.push({ rule: "mis-sleep", level: "warn", title: `误睡率 ${pct(d.misSleepRate ?? 0)}`, detail: `${d.sleepingPaths} 条路径睡下后，有的在下一个周期就被读了`, category: "渐进式披露", target: { tab: "disclosure" } });
  const r = runtime(scope);
  if (r.background.unread >= R.backgroundUnread.minUnread)
    out.push({ rule: "background-unread", level: "info", title: `${r.background.unread} 个后台任务的输出没人读`, detail: "任务结束后没有 task_output / task_wait 读取它", category: "运行 · 后台任务", target: { tab: "runtime" } });
  if (r.turns >= R.stepLimit.minTurns && r.stepLimitHits / r.turns > R.stepLimit.minRate)
    out.push({ rule: "step-limit", level: "warn", title: `${pct(r.stepLimitHits / r.turns)} 的轮次碰到步数上限`, detail: `${r.turns} 轮里 ${r.stepLimitHits} 轮`, category: "运行 · Agent 循环", target: { tab: "runtime" } });
  for (const source of sourceRows(scope)) if (source.kind !== "tools" && source.appearances >= R.contextChurn.minAppearances && (source.changeRate ?? 0) > R.contextChurn.minChangeRate)
    out.push({ rule: "context-churn", level: "info", title: `上下文来源 ${source.id} 变化频繁`, detail: `出现 ${source.appearances} 次，${pct(source.changeRate ?? 0)} 的请求里内容变了，会影响缓存命中`, category: "上下文 · 来源", target: { tab: "context", key: source.key } });
  const order = { error: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** 统计数据是否变了：会话进度、删除标记、统计文件游标、版本记录。主进程据此决定要不要递增 dataVersion。 */
export function harnessFingerprint(db: DatabaseSync): string {
  const row = prepare(db, `SELECT
    (SELECT COUNT(*)||':'||COALESCE(SUM(last_seq),0) FROM harness_session_state) AS state,
    (SELECT COUNT(*)||':'||COALESCE(SUM(deleted),0) FROM harness_session_meta) AS meta,
    (SELECT COALESCE(SUM(CAST(value AS INTEGER)),0) FROM index_state WHERE key LIKE 'harness-stats-file:%') AS files,
    (SELECT COUNT(*)||':'||COALESCE(MAX(selection_seq),0) FROM harness_revision_info) AS revisions`).get() as Row;
  return `${row.state}|${row.meta}|${row.files}|${row.revisions}`;
}

function parseArray(value: unknown): number[] { if (typeof value !== "string") return Array.isArray(value) ? value as number[] : []; try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed as number[] : []; } catch { return []; } }
function parseObject(value: unknown): Record<string, number> { if (typeof value !== "string") return {}; try { const parsed = JSON.parse(value) as unknown; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, number> : {}; } catch { return {}; } }
