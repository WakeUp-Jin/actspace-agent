import type { DatabaseSync } from "node:sqlite";
import {
  addHarnessHistograms, emptyHarnessHistogram, HARNESS_DURATION_BASE_MS, HARNESS_FLAG_RULES, HARNESS_UNKNOWN_REVISION, harnessHistogramQuantile,
  type HarnessCompactionRecord, type HarnessFlag, type HarnessListenerRow, type HarnessPluginRow, type HarnessPluginSource, type HarnessRevisionInfo,
  type HarnessRevisionMetrics, type HarnessServiceRow, type HarnessSkillRow, type HarnessSourceRow, type HarnessStatsContext, type HarnessStatsData,
  type HarnessStatsDisclosure, type HarnessStatsFilter, type HarnessStatsOptions, type HarnessStatsOverview, type HarnessStatsPlugins, type HarnessStatsQueryInput,
  type HarnessStatsUsageVs, type HarnessStatsVersions, type HarnessToolRow, type HarnessUsagePluginRow,
} from "@actspace/shared";
import { prepare } from "./usage-sql";
import { HARNESS_SLEEP_BUCKETS } from "./harness-stats-schema";

/**
 * 「Harness 统计」按卡片的 SQL 聚合与「值得关注」规则，全部在汇总 Worker 里执行。
 * 会话级表统一按 hour / revision / mode / model 与 harness_session_meta（会话类型）筛选；
 * 运行时表（服务、监听、加载）只按时间和版本筛选。口径见 docs/design-docs/frontend/front-统计页规范.md §3、§4.2。
 */
type Row = Record<string, unknown>;
type Options = { extra?: string; ignoreRevision?: boolean; revision?: string };
const n = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
const s = (value: unknown): string | null => value === null || value === undefined || value === "" ? null : String(value);
const ratio = (a: number, b: number): number | null => b > 0 ? a / b : null;
const avg = (sum: number, count: number): number | null => count > 0 ? sum / count : null;
const RANGE_HOURS = { day: 24, week: 24 * 7, month: 24 * 30, total: 0 } as const;
/** 子 Agent 会话没有自己的 run 事件：版本取父会话发起委派时的版本。 */
const CHILD_REVISION = "child_rev AS (SELECT child_session_id AS session_id,MAX(revision) AS revision FROM harness_delegation WHERE child_session_id IS NOT NULL AND revision IS NOT NULL AND revision<>'unknown' GROUP BY child_session_id)";
const REV = (alias: string) => `(CASE WHEN ${alias}.revision IS NULL OR ${alias}.revision='unknown' THEN COALESCE(cr.revision,'unknown') ELSE ${alias}.revision END)`;
/** 实际输入（未缓存 + 缓存读 + 缓存写）。 */
const INPUT = "(COALESCE(t.input_tokens,0)+COALESCE(t.cache_read,0)+COALESCE(t.cache_write,0))";

export function sinceHour(range: HarnessStatsFilter["range"], now: Date): string | null {
  const hours = RANGE_HOURS[range];
  return hours ? new Date(now.getTime() - hours * 3_600_000).toISOString().slice(0, 13) : null;
}

class Scope {
  constructor(readonly db: DatabaseSync, readonly filter: HarnessStatsFilter, readonly now: Date) {}

  /** 会话级表：FROM … JOIN … WHERE …；extra 是额外条件。ignoreRevision 用于按版本分组。 */
  from(table: string, alias = "t", options: Options = {}): { sql: string; args: (string | number)[] } {
    const conditions: string[] = [`${alias}.hour IS NOT NULL`]; const args: (string | number)[] = [];
    const since = sinceHour(this.filter.range, this.now);
    if (since) { conditions.push(`${alias}.hour>=? AND ${alias}.hour GLOB '[0-9]*'`); args.push(since); }
    if (this.filter.mode) { conditions.push(`${alias}.mode=?`); args.push(this.filter.mode); }
    if (this.filter.model) { conditions.push(`${alias}.model=?`); args.push(this.filter.model); }
    if (this.filter.sessionKind !== "all") { conditions.push("COALESCE(m.kind,'main')=?"); args.push(this.filter.sessionKind); }
    const revision = options.revision ?? (options.ignoreRevision ? undefined : this.filter.revision);
    if (revision) { conditions.push(`${REV(alias)}=?`); args.push(revision); }
    if (options.extra) conditions.push(options.extra);
    return { sql: `FROM ${table} ${alias} LEFT JOIN harness_session_meta m ON m.session_id=${alias}.session_id LEFT JOIN child_rev cr ON cr.session_id=${alias}.session_id WHERE ${conditions.join(" AND ")}`, args };
  }
  all(select: string, table: string, rest = "", options: Options = {}): Row[] {
    const scope = this.from(table, "t", options);
    return prepare(this.db, `WITH ${CHILD_REVISION} SELECT ${select} ${scope.sql} ${rest}`).all(...scope.args) as Row[];
  }
  get(select: string, table: string, options: Options = {}): Row {
    return this.all(select, table, "", options)[0] ?? {};
  }
  /** 运行时表：只按时间和版本。 */
  runtime(select: string, rest = "", extra?: string): Row[] {
    const conditions = ["1=1"]; const args: (string | number)[] = [];
    const since = sinceHour(this.filter.range, this.now);
    if (since) { conditions.push("hour>=?"); args.push(since); }
    if (this.filter.revision) { conditions.push("revision=?"); args.push(this.filter.revision); }
    if (extra) conditions.push(extra);
    return prepare(this.db, `SELECT ${select} FROM harness_runtime_hourly WHERE ${conditions.join(" AND ")} ${rest}`).all(...args) as Row[];
  }
  get rangeDays(): number { return this.filter.range === "day" ? 1 : this.filter.range === "week" ? 7 : this.filter.range === "month" ? 30 : Number.POSITIVE_INFINITY; }
}

export function queryHarnessStats(db: DatabaseSync, input: HarnessStatsQueryInput, now = new Date()): HarnessStatsData {
  const scope = new Scope(db, input.filter, now);
  switch (input.kind) {
    case "options": return { kind: "options", value: options(scope) };
    case "overview": return { kind: "overview", value: overview(scope) };
    case "usage-vs": return { kind: "usage-vs", value: usageVs(scope) };
    case "context": return { kind: "context", value: context(scope) };
    case "disclosure": return { kind: "disclosure", value: disclosure(scope) };
    case "plugins": return { kind: "plugins", value: plugins(scope) };
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
/** 版本列表：新版本在前；requests 是当前时间范围与筛选（版本筛选除外）下的请求数。 */
function revisionInfos(scope: Scope): HarnessRevisionInfo[] {
  const usage = new Map<string, { requests: number; first: string | null; last: string | null }>();
  for (const row of scope.all(`${REV("t")} AS revision,COUNT(*) AS requests,MIN(t.time) AS first,MAX(t.time) AS last`, "harness_request", "GROUP BY 1", { ignoreRevision: true })) {
    usage.set(String(row.revision), { requests: n(row.requests), first: s(row.first), last: s(row.last) });
  }
  const infos = new Map<string, HarnessRevisionInfo>();
  for (const row of prepare(scope.db, "SELECT revision,harness_id,number,description,selected_at FROM harness_revision_info").all() as Row[]) {
    const key = String(row.revision); const used = usage.get(key);
    infos.set(key, { key, harnessId: s(row.harness_id), revision: row.number == null ? null : n(row.number), description: s(row.description), firstSeenAt: used?.first ?? s(row.selected_at), lastSeenAt: used?.last ?? null, requests: used?.requests ?? 0 });
  }
  for (const [key, used] of usage) if (!infos.has(key)) {
    const [harnessId, number] = key === HARNESS_UNKNOWN_REVISION ? [null, null] : [key.split("@")[0] ?? null, Number(key.split("@")[1])];
    infos.set(key, { key, harnessId, revision: Number.isFinite(number) ? number : null, description: key === HARNESS_UNKNOWN_REVISION ? "没有版本信息的旧记录" : null, firstSeenAt: used.first, lastSeenAt: used.last, requests: used.requests });
  }
  return [...infos.values()].sort((a, b) => (b.revision ?? -1) - (a.revision ?? -1) || a.key.localeCompare(b.key));
}

function options(scope: Scope): HarnessStatsOptions {
  const distinct = (column: string) => (prepare(scope.db, `SELECT DISTINCT ${column} AS value FROM harness_request WHERE ${column} IS NOT NULL AND ${column}<>'' ORDER BY 1`).all() as Row[]).map(row => String(row.value));
  return { modes: distinct("mode"), models: distinct("model"), revisions: revisionInfos(scope), currentRevision: currentRevision(scope.db) };
}

/**
 * 所有版本的指标：每张表一次 `GROUP BY 版本`。时间范围、模式、模型、会话类型照常筛选，版本筛选不参与。
 */
function metricsByRevision(scope: Scope): Map<string, HarnessRevisionMetrics> {
  const group = { ignoreRevision: true };
  const rev = REV("t");
  const request = scope.all(`${rev} AS rev,COUNT(*) AS requests,
    SUM(CASE WHEN t.has_manifest=1 THEN 1 END) AS samples,SUM(CASE WHEN t.has_manifest=1 THEN t.estimated END) AS estimated,
    SUM(CASE WHEN t.has_manifest=1 THEN COALESCE(t.b_system,0)+COALESCE(t.b_tools,0)+COALESCE(t.b_rules,0)+COALESCE(t.b_skills,0) END) AS fixed,
    SUM(CASE WHEN t.has_manifest=1 AND t.context_window>0 THEN t.context_window END) AS window,SUM(CASE WHEN t.has_manifest=1 AND t.context_window>0 THEN 1 END) AS window_samples,
    SUM(CASE WHEN t.harness_changed=1 THEN 1 ELSE 0 END) AS broken,SUM(CASE WHEN t.harness_changed IS NOT NULL THEN 1 ELSE 0 END) AS compared,
    SUM(CASE WHEN t.harness_changed=1 AND t.cache_read IS NOT NULL THEN t.cache_read END) AS hit_b,SUM(CASE WHEN t.harness_changed=1 AND t.cache_read IS NOT NULL THEN ${INPUT} END) AS in_b,
    SUM(CASE WHEN COALESCE(t.harness_changed,0)=0 AND t.cache_read IS NOT NULL THEN t.cache_read END) AS hit_o,SUM(CASE WHEN COALESCE(t.harness_changed,0)=0 AND t.cache_read IS NOT NULL THEN ${INPUT} END) AS in_o`,
  "harness_request", "GROUP BY 1", group);
  const tool = scope.all(`${rev} AS rev,t.tool AS tool,SUM(t.calls) AS calls,SUM(t.failed) AS failed,SUM(t.repeated) AS repeated,SUM(t.truncated) AS truncated`, "harness_tool_rollup", "GROUP BY 1,2", group);
  const compaction = scope.all(`${rev} AS rev,SUM(CASE WHEN t.ok=1 THEN 1 ELSE 0 END) AS count,SUM(CASE WHEN t.ok=1 AND t.reread>0 THEN 1 ELSE 0 END) AS reread,SUM(CASE WHEN t.ok=1 THEN t.folded_tokens ELSE 0 END) AS folded`, "harness_compaction", "GROUP BY 1", group);
  const cycle = scope.all(`${rev} AS rev,SUM(t.active_read) AS hit,SUM(CASE WHEN t.active_read IS NOT NULL THEN t.active END) AS active`, "harness_disclosure_cycle", "GROUP BY 1", group);
  const plugins = new Map((prepare(scope.db, "SELECT revision,COUNT(*) AS plugins FROM harness_plugin_inventory WHERE loads>failures GROUP BY revision").all() as Row[]).map(row => [String(row.revision), n(row.plugins)]));
  const byRev = <T extends Row>(rows: T[]) => new Map(rows.map(row => [String(row.rev), row]));
  const requests = byRev(request); const compactions = byRev(compaction); const cycles = byRev(cycle);
  const tools = new Map<string, { calls: number; failed: number; repeated: number; truncated: number; top: { name: string; failed: number } | null }>();
  for (const row of tool) {
    const key = String(row.rev);
    const current = tools.get(key) ?? { calls: 0, failed: 0, repeated: 0, truncated: 0, top: null };
    const calls = n(row.calls);
    current.calls += calls; current.failed += n(row.failed);
    // 分子封顶为调用数：同一次调用可能既重复又截断。
    current.repeated += Math.min(calls, n(row.repeated)); current.truncated += Math.min(calls, n(row.truncated));
    if (n(row.failed) > 0 && (!current.top || n(row.failed) > current.top.failed)) current.top = { name: String(row.tool), failed: n(row.failed) };
    tools.set(key, current);
  }
  const keys = new Set([...requests.keys(), ...tools.keys(), ...compactions.keys(), ...cycles.keys()]);
  const out = new Map<string, HarnessRevisionMetrics>();
  for (const key of keys) {
    const r = requests.get(key) ?? {}; const t = tools.get(key); const c = compactions.get(key) ?? {}; const d = cycles.get(key) ?? {};
    out.set(key, {
      requests: n(r.requests), avgContextTokens: avg(n(r.estimated), n(r.samples)), fixedOverheadTokens: avg(n(r.fixed), n(r.samples)), avgContextWindow: avg(n(r.window), n(r.window_samples)),
      cacheBrokenRate: ratio(n(r.broken), n(r.compared)), cacheHitBroken: ratio(n(r.hit_b), n(r.in_b)), cacheHitOther: ratio(n(r.hit_o), n(r.in_o)),
      toolCalls: t?.calls ?? 0, toolFailureRate: t ? ratio(t.failed, t.calls) : null, topFailedTool: t?.top ?? null,
      repeatRate: t ? ratio(t.repeated, t.calls) : null, truncateRate: t ? ratio(t.truncated, t.calls) : null,
      compactions: n(c.count), rereadRate: ratio(n(c.reread), n(c.count)), foldedTokens: n(c.folded),
      activeHitRate: ratio(n(d.hit), n(d.active)), plugins: plugins.get(key) ?? null,
    });
  }
  return out;
}

/* ------------------------------ 总览 ------------------------------ */

function overview(scope: Scope): HarnessStatsOverview {
  const revisions = revisionInfos(scope).filter(info => info.requests > 0);
  const current = scope.filter.revision ?? revisions[0]?.key ?? null;
  const index = current ? revisions.findIndex(info => info.key === current) : -1;
  // 版本列表新版本在前：排在当前版本之后的第一个有数据的版本就是「上一版本」。
  const previous = index >= 0 ? revisions[index + 1]?.key ?? null : null;
  const metrics = current || previous ? metricsByRevision(scope) : new Map<string, HarnessRevisionMetrics>();
  return { flags: flags(scope), current, previous, metrics: current ? metrics.get(current) ?? null : null, previousMetrics: previous ? metrics.get(previous) ?? null : null };
}

function versions(scope: Scope, compare?: { from: string; to: string }): HarnessStatsVersions {
  const revisions = revisionInfos(scope);
  const withData = revisions.filter(info => info.requests > 0);
  const to = compare?.to ?? withData[0]?.key ?? null;
  const from = compare?.from ?? withData.find(info => info.key !== to)?.key ?? null;
  const metrics = from || to ? metricsByRevision(scope) : new Map<string, HarnessRevisionMetrics>();
  return { revisions, from, to, fromMetrics: from ? metrics.get(from) ?? null : null, toMetrics: to ? metrics.get(to) ?? null : null };
}

/* -------------------------------- 工具与插件 -------------------------------- */

type ToolAggregate = HarnessToolRow & { schemaSum: number; schemaSamples: number };
function toolAggregates(scope: Scope): ToolAggregate[] {
  const owners = toolOwners(scope);
  const map = new Map<string, { -readonly [K in keyof ToolAggregate]: ToolAggregate[K] }>();
  const codes = new Map<string, Map<string, number>>();
  for (const row of scope.all("t.tool AS tool,MAX(t.plugin_id) AS plugin_id,SUM(t.exposures) AS exposures,SUM(t.calls) AS calls,SUM(t.failed) AS failed,SUM(t.schema_tokens) AS schema_tokens,SUM(t.schema_samples) AS schema_samples,SUM(t.truncated) AS truncated,SUM(t.repeated) AS repeated,GROUP_CONCAT(t.failure_codes,'|') AS codes", "harness_tool_rollup", "GROUP BY t.tool")) {
    const name = String(row.tool);
    map.set(name, {
      name, pluginId: ownerPlugin(owners, name, s(row.plugin_id)), exposures: n(row.exposures), calls: n(row.calls), failed: n(row.failed), failureCodes: [],
      schemaTokens: avg(n(row.schema_tokens), n(row.schema_samples)), truncated: n(row.truncated), repeated: n(row.repeated), schemaSum: n(row.schema_tokens), schemaSamples: n(row.schema_samples),
    });
    const merged = new Map<string, number>();
    for (const value of String(row.codes ?? "").split("|")) for (const [code, count] of Object.entries(parseObject(value))) merged.set(code, (merged.get(code) ?? 0) + n(count));
    codes.set(name, merged);
  }
  for (const [name, merged] of codes) { const tool = map.get(name); if (tool) tool.failureCodes = [...merged].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count); }
  return [...map.values()].sort((a, b) => b.calls - a.calls || b.exposures - a.exposures || a.name.localeCompare(b.name));
}
type ToolOwners = Map<string, { plugin: string; toolPluginId: string | null }>;
function toolOwners(scope: Scope): ToolOwners {
  const revision = scope.filter.revision ?? currentRevision(scope.db);
  const rows = prepare(scope.db, "SELECT tool,plugin,tool_plugin_id,revision FROM harness_tool_owner ORDER BY (revision=?) ASC,last_seen ASC").all(revision ?? "") as Row[];
  return new Map(rows.map(row => [String(row.tool), { plugin: String(row.plugin), toolPluginId: s(row.tool_plugin_id) }]));
}
/**
 * 工具归属统一用加载器的插件 ID（插件行 ID，如 `filesystem-read`）。
 * Journal 里工具自报的是 toolPluginId（如 `actspace.filesystem-read`），两者不同，
 * 所以先按工具名查归属表，再按 toolPluginId 反查，都查不到才用 Journal 里的原值。
 */
function ownerPlugin(owners: ToolOwners, tool: string, journalPluginId: string | null): string | null {
  const owned = owners.get(tool)?.plugin;
  if (owned) return owned;
  if (journalPluginId) for (const value of owners.values()) if (value.toolPluginId === journalPluginId) return value.plugin;
  return journalPluginId;
}
const publicTool = ({ schemaSum: _a, schemaSamples: _b, ...row }: ToolAggregate): HarnessToolRow => row;

function inventoryRows(scope: Scope): Row[] {
  const revision = scope.filter.revision ?? currentRevision(scope.db);
  if (!revision) return [];
  return prepare(scope.db, "SELECT plugin,source,provides,loads,failures,last_error,load_hist FROM harness_plugin_inventory WHERE revision=?").all(revision) as Row[];
}
function pluginSources(scope: Scope): Map<string, HarnessPluginSource> {
  return new Map(inventoryRows(scope).map(row => [String(row.plugin), String(row.source) as HarnessPluginSource]));
}
function usagePlugins(tools: readonly ToolAggregate[], sources: Map<string, HarnessPluginSource>): HarnessUsagePluginRow[] {
  const groups = new Map<string, ToolAggregate[]>();
  for (const tool of tools) if (tool.pluginId) groups.set(tool.pluginId, [...groups.get(tool.pluginId) ?? [], tool]);
  return [...groups].map(([pluginId, rows]) => ({
    pluginId, source: sources.get(pluginId) ?? "unknown", tools: rows.map(tool => tool.name),
    calls: rows.reduce((sum, tool) => sum + tool.calls, 0), failed: rows.reduce((sum, tool) => sum + tool.failed, 0),
    schemaTokens: rows.some(tool => tool.schemaTokens !== null) ? rows.reduce((sum, tool) => sum + (tool.schemaTokens ?? 0), 0) : null,
    exposures: Math.max(0, ...rows.map(tool => tool.exposures)),
  })).sort((a, b) => b.calls - a.calls || a.pluginId.localeCompare(b.pluginId));
}
function skillRows(scope: Scope): HarnessSkillRow[] {
  const catalog = new Map(scope.all("t.entry_id AS id,SUM(t.tokens) AS tokens,SUM(t.appearances) AS appearances", "harness_entry_rollup", "GROUP BY t.entry_id", { extra: "t.kind='skills'" })
    .map(row => [String(row.id), avg(n(row.tokens), n(row.appearances))]));
  return scope.all("t.skill_id AS id,MAX(t.source) AS source,SUM(t.listed) AS listed,SUM(t.skill_reads) AS skill_reads,SUM(t.asset_reads) AS asset_reads,MAX(t.last_read_at) AS last_read_at", "harness_skill_rollup", "GROUP BY t.skill_id ORDER BY SUM(t.skill_reads) DESC,SUM(t.asset_reads) DESC,SUM(t.listed) DESC")
    .map(row => ({ id: String(row.id), source: s(row.source), listed: n(row.listed), catalogTokens: catalog.get(String(row.id)) ?? null, skillReads: n(row.skill_reads), assetReads: n(row.asset_reads), lastReadAt: s(row.last_read_at) }));
}
function usageVs(scope: Scope): HarnessStatsUsageVs {
  const tools = toolAggregates(scope);
  return { requests: n(scope.get("COUNT(*) AS requests", "harness_request").requests), tools: tools.map(publicTool), plugins: usagePlugins(tools, pluginSources(scope)), skills: skillRows(scope) };
}

/* ------------------------------ 上下文 ------------------------------ */

const BUCKET_COLUMNS = [["systemPrompt", "b_system"], ["tools", "b_tools"], ["rules", "b_rules"], ["skills", "b_skills"], ["summarizedConversation", "b_summarized"], ["conversation", "b_conversation"]] as const;
function sourceRows(scope: Scope): HarnessSourceRow[] {
  return scope.all("t.entry_key AS key,MAX(t.kind) AS kind,MAX(t.bucket) AS bucket,MAX(t.owner) AS owner,MAX(t.entry_id) AS id,SUM(t.appearances) AS appearances,SUM(t.tokens) AS tokens,SUM(t.changes) AS changes,SUM(t.compared) AS compared", "harness_entry_rollup", "GROUP BY t.entry_key ORDER BY SUM(t.tokens) DESC LIMIT 400")
    .map(row => ({ key: String(row.key), kind: String(row.kind ?? "other") as HarnessSourceRow["kind"], bucket: String(row.bucket ?? "systemPrompt"), owner: s(row.owner), id: String(row.id ?? row.key), appearances: n(row.appearances), avgTokens: n(row.tokens) / Math.max(1, n(row.appearances)), changeRate: ratio(n(row.changes), n(row.compared)) }));
}
function context(scope: Scope): HarnessStatsContext {
  const row = scope.get(`COUNT(*) AS requests,SUM(CASE WHEN t.has_manifest=1 THEN 1 END) AS samples,SUM(CASE WHEN t.has_manifest=1 THEN t.estimated END) AS estimated,${BUCKET_COLUMNS.map(([, column]) => `SUM(CASE WHEN t.has_manifest=1 THEN t.${column} END) AS ${column}`).join(",")}`, "harness_request");
  const samples = n(row.samples);
  return {
    requests: n(row.requests), avgEstimatedTokens: avg(n(row.estimated), samples),
    buckets: BUCKET_COLUMNS.map(([bucket, column]) => ({ bucket, avgTokens: samples ? n(row[column]) / samples : 0 })),
    sources: sourceRows(scope),
  };
}

/* ------------------------------ 披露与压缩 ------------------------------ */

function disclosure(scope: Scope): HarnessStatsDisclosure {
  const cycles = scope.all("t.active AS active,t.active_read AS active_read,t.cap_hit AS cap_hit", "harness_disclosure_cycle");
  const finished = cycles.filter(row => row.active_read !== null && row.active_read !== undefined && n(row.active) > 0);
  const activeHistogram = Array.from({ length: 11 }, () => 0);
  for (const row of cycles) activeHistogram[Math.min(10, Math.floor(n(row.active) / 10))] += 1;
  const rollup = scope.get(`SUM(t.mis_sleeps) AS mis,SUM(t.slept_paths) AS slept,SUM(t.index_reads) AS index_reads,SUM(t.index_conversions) AS conversions,GROUP_CONCAT(t.sleep_hist,'|') AS hists`, "harness_disclosure_rollup");
  const sleepHistogram = Array.from({ length: HARNESS_SLEEP_BUCKETS }, () => 0);
  for (const value of String(rollup.hists ?? "").split("|")) { const values = parseArray(value); for (let index = 0; index < HARNESS_SLEEP_BUCKETS; index++) sleepHistogram[index] += values[index] ?? 0; }
  const compactions = scope.all("t.compaction_id AS id,t.time AS time,t.trigger AS trigger,t.ok AS ok,t.failure_code AS failure_code,t.duration_ms AS duration_ms,t.before_tokens AS before_tokens,t.after_tokens AS after_tokens,t.steps_since AS steps_since,t.window_ratio AS window_ratio,t.folded AS folded,t.folded_tokens AS folded_tokens,t.reread AS reread", "harness_compaction", "ORDER BY t.time DESC");
  const ok = compactions.filter(row => n(row.ok) === 1);
  const windows = ok.filter(row => row.window_ratio != null).map(row => n(row.window_ratio)).sort((a, b) => a - b);
  const mean = (rows: Row[], column: string) => { const values = rows.filter(row => row[column] != null).map(row => n(row[column])); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
  const records: HarnessCompactionRecord[] = compactions.slice(0, 200).map(row => ({
    id: String(row.id), time: s(row.time), trigger: String(row.trigger ?? "auto"), ok: n(row.ok) === 1, failureCode: s(row.failure_code),
    beforeTokens: row.before_tokens == null ? null : n(row.before_tokens), afterTokens: row.after_tokens == null ? null : n(row.after_tokens),
    durationMs: row.duration_ms == null ? null : n(row.duration_ms), rereads: n(row.reread),
  }));
  return {
    cycles: cycles.length,
    activeHitRate: ratio(finished.reduce((total, row) => total + n(row.active_read), 0), finished.reduce((total, row) => total + n(row.active), 0)),
    misSleepRate: ratio(n(rollup.mis), n(rollup.slept)), indexConversionRate: ratio(n(rollup.conversions), n(rollup.index_reads)),
    capHits: cycles.filter(row => n(row.cap_hit) === 1).length,
    activeHistogram, sleepHistogram,
    topPaths: scope.all("t.path AS path,SUM(t.reads) AS reads", "harness_path_reads", "GROUP BY t.path ORDER BY 2 DESC LIMIT 10").map(row => ({ path: String(row.path), reads: n(row.reads) })),
    compaction: {
      count: ok.length, auto: ok.filter(row => row.trigger === "auto").length, manual: ok.filter(row => row.trigger === "manual").length, failed: compactions.length - ok.length,
      avgBeforeTokens: mean(ok, "before_tokens"), avgAfterTokens: mean(ok, "after_tokens"), avgDurationMs: mean(ok, "duration_ms"),
      rereadRate: ratio(ok.filter(row => n(row.reread) > 0).length, ok.length),
      triggerWindowP50: windows.length ? windows[Math.max(0, Math.ceil(windows.length / 2) - 1)] : null,
      avgStepsBetween: mean(ok, "steps_since"),
      foldedOutputs: ok.reduce((total, row) => total + n(row.folded), 0), foldedTokens: ok.reduce((total, row) => total + n(row.folded_tokens), 0),
    },
    records,
  };
}

/* -------------------------------- 插件运行时 -------------------------------- */

function plugins(scope: Scope): HarnessStatsPlugins {
  const inventory = inventoryRows(scope);
  const since = sinceHour(scope.filter.range, scope.now);
  const loadArgs = [since, scope.filter.revision].filter((value): value is string => !!value);
  const loads = prepare(scope.db, `SELECT plugin,SUM(loads) AS loads,SUM(failures) AS failures,MAX(last_error) AS last_error,GROUP_CONCAT(load_hist,'|') AS hists FROM harness_plugin_inventory WHERE 1=1 ${since ? "AND last_seen>=?" : ""} ${scope.filter.revision ? "AND revision=?" : ""} GROUP BY plugin`).all(...loadArgs) as Row[];
  const owners = toolOwners(scope);
  const tools = toolAggregates(scope);
  const sources = new Map(inventory.map(row => [String(row.plugin), String(row.source) as HarnessPluginSource]));
  const ids = new Set<string>([...inventory.map(row => String(row.plugin)), ...loads.map(row => String(row.plugin)), ...[...owners.values()].map(value => value.plugin)]);
  const loadHist = emptyHarnessHistogram();
  const rows: HarnessPluginRow[] = [...ids].map(pluginId => {
    const pluginTools = tools.filter(tool => tool.pluginId === pluginId);
    const load = loads.find(row => row.plugin === pluginId);
    for (const value of String(load?.hists ?? "").split("|")) if (value) addHarnessHistograms(loadHist, parseArray(value));
    return {
      pluginId, source: sources.get(pluginId) ?? "unknown", tools: pluginTools.length,
      toolCalls: pluginTools.reduce((sum, tool) => sum + tool.calls, 0),
      contextTokens: pluginTools.some(tool => tool.schemaTokens !== null) ? pluginTools.reduce((sum, tool) => sum + (tool.schemaTokens ?? 0), 0) : null,
      loads: n(load?.loads), loadFailures: n(load?.failures), lastLoadError: s(load?.last_error),
    };
  }).sort((a, b) => (b.contextTokens ?? 0) - (a.contextTokens ?? 0) || b.toolCalls - a.toolCalls || a.pluginId.localeCompare(b.pluginId));
  const byService = new Map<string, HarnessServiceRow & { hist: number[] }>();
  for (const row of scope.runtime("name,method,provider,SUM(calls) AS calls,SUM(errors) AS errors,GROUP_CONCAT(histogram,'|') AS hists", "GROUP BY name,method,provider", "kind='service'")) {
    const key = `${row.provider ?? ""}\0${row.name}\0${row.method}`;
    const current = byService.get(key) ?? { providerPluginId: s(row.provider), service: String(row.name), method: String(row.method), calls: 0, errors: 0, p95Ms: null, hist: emptyHarnessHistogram() };
    (current as { calls: number }).calls += n(row.calls); (current as { errors: number }).errors += n(row.errors);
    for (const value of String(row.hists ?? "").split("|")) if (value) addHarnessHistograms(current.hist, parseArray(value));
    byService.set(key, current);
  }
  const services: HarnessServiceRow[] = [...byService.values()].map(({ hist, ...row }) => ({ ...row, p95Ms: harnessHistogramQuantile(hist, 0.95, HARNESS_DURATION_BASE_MS) }));
  // 声明提供、但范围内一次都没被调用的服务也列出来（「服务从未被调用」的依据）。
  for (const row of inventory) for (const name of parseArray(row.provides) as unknown as string[]) {
    if (typeof name === "string" && !services.some(item => item.providerPluginId === row.plugin && item.service === name)) services.push({ providerPluginId: String(row.plugin), service: name, method: "", calls: 0, errors: 0, p95Ms: null });
  }
  services.sort((a, b) => b.calls - a.calls || a.service.localeCompare(b.service));
  const listeners: HarnessListenerRow[] = scope.runtime("plugin,name,SUM(calls) AS calls,SUM(errors) AS errors", "GROUP BY plugin,name ORDER BY 3 DESC", "kind='listener'")
    .map(row => ({ pluginId: String(row.plugin), event: String(row.name), calls: n(row.calls), errors: n(row.errors) }));
  const runtimeEmpty = !(prepare(scope.db, "SELECT 1 FROM harness_runtime_hourly LIMIT 1").get() || prepare(scope.db, "SELECT 1 FROM harness_plugin_inventory LIMIT 1").get());
  return { rows, services, listeners, loadP50Ms: harnessHistogramQuantile(loadHist, 0.5, HARNESS_DURATION_BASE_MS), runtimeEmpty };
}

/* ------------------------------ 值得关注 ------------------------------ */

const pct = (value: number) => `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
export function flags(scope: Scope): HarnessFlag[] {
  const R = HARNESS_FLAG_RULES; const out: HarnessFlag[] = [];
  const tools = toolAggregates(scope);
  for (const tool of tools) {
    const rate = tool.exposures ? tool.calls / tool.exposures : 0;
    if (tool.exposures >= R.toolCostlyUnused.minExposures && (tool.schemaTokens ?? 0) >= R.toolCostlyUnused.minSchemaTokens && rate < R.toolCostlyUnused.maxCallRate)
      out.push({ rule: "tool-costly-unused", level: "warn", title: `${tool.name} 占用高、使用少`, detail: `定义约 ${Math.round(tool.schemaTokens ?? 0)} token，出现在 ${tool.exposures} 次请求里，只调用 ${tool.calls} 次（${pct(rate)}）`, category: "占用 vs 使用", target: { card: "usage-vs", tab: "tools", key: tool.name } });
    if (tool.calls >= R.toolFailureRate.minCalls && tool.failed / tool.calls > R.toolFailureRate.minFailureRate)
      out.push({ rule: "tool-failure-rate", level: "error", title: `${tool.name} 失败率 ${pct(tool.failed / tool.calls)}`, detail: `${tool.calls} 次调用失败 ${tool.failed} 次${tool.failureCodes[0] ? `，最多的原因 ${tool.failureCodes[0].code}` : ""}`, category: "工具失败", target: { card: "detail", tab: "tools", key: tool.name } });
  }
  for (const row of usagePlugins(tools, pluginSources(scope)))
    if (row.exposures >= R.pluginCostlyUnused.minExposures && (row.schemaTokens ?? 0) >= R.pluginCostlyUnused.minSchemaTokens && row.calls / row.exposures < R.pluginCostlyUnused.maxCallRate)
      out.push({ rule: "plugin-costly-unused", level: "warn", title: `${row.pluginId} 占用高、使用少`, detail: `${row.tools.length} 个工具定义合计约 ${Math.round(row.schemaTokens ?? 0)} token，${row.exposures} 次请求里调用 ${row.calls} 次`, category: "占用 vs 使用", target: { card: "usage-vs", tab: "plugins", key: row.pluginId } });
  const plugin = plugins(scope);
  for (const row of plugin.rows) if (row.loadFailures >= R.pluginLoadFailure.minFailures)
    out.push({ rule: "plugin-load-failure", level: "error", title: `${row.pluginId} 加载失败 ${row.loadFailures} 次`, detail: row.lastLoadError ?? "没有记录失败原因", category: "插件运行时", target: { card: "runtime", tab: "load", key: row.pluginId } });
  for (const listener of plugin.listeners) if (listener.errors >= R.listenerErrors.minErrors)
    out.push({ rule: "listener-errors", level: "error", title: `${listener.pluginId} 的 ${listener.event} 监听报错 ${listener.errors} 次`, detail: `共触发 ${listener.calls} 次`, category: "插件运行时", target: { card: "runtime", tab: "listeners", key: listener.pluginId } });
  if (!plugin.runtimeEmpty && scope.rangeDays >= R.serviceNeverCalled.minRangeDays)
    for (const service of plugin.services) if (service.calls === 0 && service.method === "")
      out.push({ rule: "service-never-called", level: "info", title: `服务 ${service.service} 从未被调用`, detail: `由 ${service.providerPluginId ?? "未知插件"} 提供，所选范围内 0 次调用`, category: "插件运行时", target: { card: "runtime", tab: "services", key: service.service } });
  const unread = skillRows(scope).filter(skill => skill.listed >= R.skillNeverRead.minListed && skill.skillReads + skill.assetReads === 0);
  if (unread.length > 3) {
    const names = unread.slice(0, 5).map(skill => skill.id).join("、");
    out.push({ rule: "skill-never-read", level: "info", title: `${unread.length} 个 Skill 从未被读取`, detail: `每个都列出了至少 ${R.skillNeverRead.minListed} 次，0 次读取：${names}${unread.length > 5 ? " 等" : ""}`, category: "占用 vs 使用", target: { card: "usage-vs", tab: "skills" } });
  } else for (const skill of unread)
    out.push({ rule: "skill-never-read", level: "info", title: `Skill ${skill.id} 从未被读取`, detail: `列出 ${skill.listed} 次，0 次读取`, category: "占用 vs 使用", target: { card: "usage-vs", tab: "skills", key: skill.id } });
  const d = disclosure(scope);
  if (d.compaction.count >= R.compactionReread.minCompactions && (d.compaction.rereadRate ?? 0) > R.compactionReread.minRate)
    out.push({ rule: "compaction-reread", level: "warn", title: `压缩后重读率 ${pct(d.compaction.rereadRate ?? 0)}`, detail: `${d.compaction.count} 次压缩里，压缩后 5 步内又读了之前读过的文件`, category: "压缩", target: { card: "compaction" } });
  const slept = n(scope.get("SUM(t.slept_paths) AS slept", "harness_disclosure_rollup").slept);
  if (slept >= R.misSleep.minSleepingPaths && (d.misSleepRate ?? 0) > R.misSleep.minRate)
    out.push({ rule: "mis-sleep", level: "warn", title: `误睡率 ${pct(d.misSleepRate ?? 0)}`, detail: `${slept} 条路径睡下后，有的在下一个周期就被读了`, category: "渐进式披露", target: { card: "disclosure", tab: "sleep" } });
  for (const source of sourceRows(scope)) if (source.kind !== "tools" && source.appearances >= R.contextChurn.minAppearances && (source.changeRate ?? 0) > R.contextChurn.minChangeRate)
    out.push({ rule: "context-churn", level: "info", title: `上下文来源 ${source.id} 变化频繁`, detail: `出现 ${source.appearances} 次，${pct(source.changeRate ?? 0)} 的请求里内容变了，会打断缓存`, category: "上下文来源", target: { card: "sources", tab: source.bucket, key: source.key } });
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
