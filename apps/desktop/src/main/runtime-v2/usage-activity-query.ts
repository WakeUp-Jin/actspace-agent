import type { DatabaseSync } from "node:sqlite";
import {
  addHarnessHistograms,
  emptyHarnessHistogram,
  HARNESS_DURATION_BASE_MS,
  harnessHistogramQuantile,
  type UsageActivityAggregate,
  type UsageActivityRow,
  type UsageActivitySnapshot,
  type UsageActivitySummary,
  type UsageAuxiliaryPurpose,
  type UsageAuxiliaryRow,
  type UsageCommandRow,
  type UsageCostSummary,
  type UsageHeatmap,
  type UsageSeries,
  type UsageSkillRow,
  type UsageStatisticsGetInput,
  type UsageSubagentRow,
  type UsageTiming,
  type UsageToolRow,
} from "@actspace/shared";
import { prepare } from "./usage-sql";
import { metricsSource, metricSql, searchMetricsSource } from "./usage-rollups";

/**
 * 「使用统计」一次 `usage.getActivity` 的全部 SQL，在汇总 Worker 里执行。
 * 来自模型请求的数读小时 rollup（工作区 / 标题筛选时读按会话临时汇总表）；
 * 工具、命令、Skills、子 Agent 读 Harness 表，不受模型 / 提供商筛选影响。口径见 docs/design-docs/frontend/front-统计页规范.md §4.1。
 */
type Row = Record<string, unknown>;
const n = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
const DAY = 86_400_000;
const RANGE_DAYS = { day: 1, week: 7, month: 30 } as const;
const HEATMAP_DAYS = 98;
const SEP = "char(31)";
/** worktree 会话归到来源工作区。 */
const WORKSPACE_ROOT = "COALESCE(json_extract(worktree_json,'$.sourceWorkspaceRoot'),workspace_root,'')";
const USD_COST = "CASE WHEN a.cost_amount IS NOT NULL AND a.cost_currency='USD' THEN a.cost_amount ELSE 0 END";

class Where {
  readonly conditions: string[] = [];
  readonly args: (string | number)[] = [];
  add(condition: string, ...args: (string | number)[]): this {
    this.conditions.push(condition);
    this.args.push(...args);
    return this;
  }
  clone(): Where {
    const copy = new Where();
    copy.conditions.push(...this.conditions);
    copy.args.push(...this.args);
    return copy;
  }
  get sql(): string {
    return this.conditions.length ? `WHERE ${this.conditions.join(" AND ")}` : "";
  }
  /** 再加一个条件后的 WHERE 子句（不改自身）。 */
  and(condition: string): string {
    return this.conditions.length ? `${this.sql} AND ${condition}` : `WHERE ${condition}`;
  }
}

export function queryUsageActivity(
  database: DatabaseSync,
  input: UsageStatisticsGetInput,
  fallback: boolean,
  now = new Date(),
): UsageActivitySnapshot | null {
  if (typeof input.search === "string" && input.search.length > 300)
    throw new Error("Usage search exceeds 300 characters.");
  const scope = input.scope ?? (input.sessionId ? "session" : "global");
  const selected =
    scope === "session"
      ? (prepare(database, "SELECT session_id,title FROM session_catalog WHERE session_id = ?").get(
          input.sessionId ?? "",
        ) as { session_id: string; title: string | null } | undefined)
      : undefined;
  if (scope === "session" && !selected) return null;
  const range = input.range ?? "month";
  const since = range === "total" ? undefined : new Date(now.getTime() - RANGE_DAYS[range] * DAY).toISOString();
  const offset = utcOffset(input.utcOffsetMinutes);

  // base：会话 / 时间 / 工作区；filter：再加模型、提供商与兼容的状态、搜索条件。
  const base = new Where();
  if (scope === "session") base.add("a.session_id = ?", input.sessionId ?? "");
  if (since) base.add("a.started_at >= ?", since);
  if (input.workspaceRoot !== undefined)
    base.add(`a.session_id IN (SELECT session_id FROM session_catalog WHERE ${WORKSPACE_ROOT}=?)`, input.workspaceRoot);
  const filter = base.clone();
  if (input.model !== undefined) filter.add("a.model = ?", input.model);
  if (input.providerId !== undefined) filter.add("a.provider_id = ?", input.providerId);
  if (input.status && input.status !== "all") filter.add("a.status = ?", input.status);
  const search = input.search?.trim();
  const titleMatches = search
    ? n(
        (
          prepare(database, "SELECT COUNT(*) AS n FROM session_search WHERE session_search MATCH ?").get(
            toFtsQuery(search),
          ) as Row
        ).n,
      )
    : 0;
  const allTitlesMatch =
    titleMatches > 0 &&
    titleMatches === n((prepare(database, "SELECT COUNT(*) AS n FROM session_catalog").get() as Row).n);
  if (search && !allTitlesMatch)
    filter.add(
      "(a.search_key IN (SELECT search_key FROM search_documents WHERE search_documents MATCH ?) OR a.session_id IN (SELECT session_id FROM session_search WHERE session_search MATCH ?))",
      toFtsQuery(search),
      toFtsQuery(search),
    );

  // 全局且无工作区：小时 rollup；工作区或标题搜索：按会话 × 小时的临时汇总表；单会话：明细。
  const rangeSource = scope === "global" && input.workspaceRoot === undefined ? metricsSource(since) : undefined;
  const source =
    scope === "global" && (input.workspaceRoot !== undefined || (titleMatches > 0 && !allTitlesMatch))
      ? searchMetricsSource(database, filter.sql, filter.args)
      : rangeSource;
  const summary = summarySql(database, filter, source);
  const pageSize = boundedInteger(input.requestRowsPage?.limit, 10, 500);
  const page = boundedInteger(input.requestRowsPage?.page, 1, 1_000_000);
  const cursor = decodeCursor(input.requestRowsPage?.cursor);
  const filteredCount = n(
    (
      prepare(database, metricSql(`SELECT COUNT(*) AS count FROM usage_activity a ${filter.sql}`, source)).get(
        ...filter.args,
      ) as Row
    ).count,
  );
  const pageWhere = cursor ? filter.and("(a.started_at,a.source_event_seq,a.activity_id) < (?,?,?)") : filter.sql;
  const pageArgs = cursor ? [...filter.args, cursor.startedAt, cursor.sourceEventSeq, cursor.activityId] : filter.args;
  const pageIndex =
    filteredCount < 10_000
      ? ""
      : input.model !== undefined
        ? "INDEXED BY usage_activity_model_page_idx"
        : input.providerId !== undefined
          ? "INDEXED BY usage_activity_provider_page_idx"
          : input.status && input.status !== "all"
            ? "INDEXED BY usage_activity_status_page_idx"
            : "INDEXED BY usage_activity_started_idx";
  const pageRows =
    filteredCount === 0
      ? []
      : (boundedRows(
          prepare(
            database,
            `SELECT a.row_json FROM usage_activity a ${pageIndex} ${pageWhere} ORDER BY a.started_at DESC, a.source_event_seq DESC, a.activity_id DESC LIMIT ? OFFSET ?`,
          ).iterate(...pageArgs, pageSize + 1, cursor ? 0 : (page - 1) * pageSize),
        ) as { row_json: string }[]);
  const rows = pageRows.slice(0, pageSize).map((row) => JSON.parse(row.row_json) as UsageActivityRow);
  const next = pageRows.length > pageSize ? encodeCursor(rows.at(-1)) : null;
  const harness = fallback
    ? undefined
    : new HarnessScope(database, scope === "session" ? input.sessionId : undefined, since, input.workspaceRoot);
  const tools = harness ? toolRows(harness) : undefined;

  return {
    schemaVersion: 1,
    scope,
    sessionId: scope === "session" ? (input.sessionId ?? null) : null,
    title: scope === "session" ? (selected?.title ?? "New chat") : "全部数据",
    range,
    generatedAt: now.toISOString(),
    sourceCount:
      scope === "session"
        ? 1
        : n((prepare(database, "SELECT COUNT(*) AS count FROM session_catalog").get() as Row).count),
    ...watermarks(database, scope, input.sessionId),
    summary,
    costSummary: costSummarySql(database, filter, source),
    aggregates: aggregateSql(database, filter, source),
    timing: timingSql(database, filter, source, tools?.totals),
    series: seriesSql(database, range, offset, filter, source, now),
    ...(scope === "global" ? { heatmap: heatmapSql(database, offset, now) } : {}),
    ...(harness && tools
      ? {
          tools: tools.rows,
          commands: commandRows(harness),
          skills: skillRows(harness),
          subagents: subagentRows(database, harness, since),
        }
      : { harnessUnavailable: true as const }),
    auxiliary: auxiliarySql(database, base, rangeSource),
    filterOptions: filterOptions(database),
    rows,
    rowsPage: {
      page,
      pageSize,
      totalRows: filteredCount,
      totalPages: Math.max(1, Math.ceil(filteredCount / pageSize)),
      ...(next ? { nextCursor: next } : {}),
    },
  };
}

/* ------------------------------ 模型请求 ------------------------------ */

function summarySql(database: DatabaseSync, filter: Where, source?: string): UsageActivitySummary {
  const unknown = (column: string) =>
    `SUM(CASE WHEN a.status!='running' AND a.${column} IS NULL THEN 1 ELSE 0 END) AS ${column}_unknown`;
  const row = prepare(
    database,
    metricSql(
      `SELECT COUNT(*) AS request_count, SUM(CASE WHEN a.status='success' THEN 1 ELSE 0 END) AS success_count, SUM(CASE WHEN a.status='error' THEN 1 ELSE 0 END) AS error_count, SUM(CASE WHEN a.status='aborted' THEN 1 ELSE 0 END) AS aborted_count, SUM(CASE WHEN a.status='running' THEN 1 ELSE 0 END) AS running_count, SUM(CASE WHEN a.status='unknown' THEN 1 ELSE 0 END) AS unknown_count, COALESCE(SUM(a.retries),0) AS retry_count, COALESCE(SUM(a.input_tokens),0) AS input_tokens, COALESCE(SUM(a.output_tokens),0) AS output_tokens, COALESCE(SUM(a.cache_read_tokens),0) AS cache_read_tokens, COALESCE(SUM(a.cache_write_tokens),0) AS cache_write_tokens, COALESCE(SUM(a.reasoning_tokens),0) AS reasoning_tokens, COALESCE(SUM(a.total_tokens),0) AS total_tokens, ${["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "total_tokens"].map(unknown).join(", ")}, SUM(a.cost_usd) AS cost_usd, SUM(CASE WHEN a.status!='running' AND a.cost_amount IS NULL AND a.total_tokens_unknown=0 THEN 1 ELSE 0 END) AS cost_unavailable_count FROM usage_activity a ${filter.sql}`,
      source,
    ),
  ).get(...filter.args) as Row;
  const requests = n(row.request_count);
  return {
    activityCount: requests,
    requestCount: requests,
    failedRequestCount: n(row.error_count),
    retryCount: n(row.retry_count),
    successCount: n(row.success_count),
    errorCount: n(row.error_count),
    abortedCount: n(row.aborted_count),
    runningCount: n(row.running_count),
    unknownCount: n(row.unknown_count),
    inputTokens: n(row.input_tokens),
    outputTokens: n(row.output_tokens),
    cacheReadTokens: n(row.cache_read_tokens),
    cacheWriteTokens: n(row.cache_write_tokens),
    reasoningTokens: n(row.reasoning_tokens),
    totalTokens: n(row.total_tokens),
    unknownTokenRequestCounts: {
      input: n(row.input_tokens_unknown),
      output: n(row.output_tokens_unknown),
      cacheRead: n(row.cache_read_tokens_unknown),
      cacheWrite: n(row.cache_write_tokens_unknown),
      reasoning: n(row.reasoning_tokens_unknown),
      total: n(row.total_tokens_unknown),
    },
    costUsd: row.cost_usd == null ? null : n(row.cost_usd),
    costUnavailableCount: n(row.cost_unavailable_count),
  };
}

function costSummarySql(database: DatabaseSync, filter: Where, source?: string): UsageCostSummary {
  const row = prepare(
    database,
    metricSql(
      `SELECT COALESCE(SUM(CASE WHEN kind='llm_request' AND cost_amount IS NOT NULL AND cost_currency='USD' THEN cost_amount ELSE 0 END),0) AS cost,
    COALESCE(SUM(kind='llm_request' AND cost_amount IS NOT NULL AND cost_currency='USD'),0) AS known,
    -- 仅统计已有 token 用量但没有定价的请求；running 是未完成或中断残留，没有 token 的失败请求没有费用依据可缺。
    -- rollup 只保留 total_tokens_unknown 维度，所以用它判断「有 token 用量」。
    COALESCE(SUM(kind='llm_request' AND status!='running' AND (cost_amount IS NULL OR COALESCE(cost_currency,'')!='USD') AND total_tokens_unknown=0),0) AS unknown,
    COALESCE(SUM(kind='llm_request' AND historical_unverified=1 AND cost_amount IS NOT NULL AND cost_currency='USD'),0) AS unverified
    FROM usage_activity a ${filter.sql}`,
      source,
    ),
  ).get(...filter.args) as Record<string, number>;
  return {
    costUsd: row.cost,
    knownCostRequestCount: row.known,
    unknownCostRequestCount: row.unknown,
    unverifiedHistoricalRequestCount: row.unverified,
  };
}

function aggregateSql(
  database: DatabaseSync,
  filter: Where,
  source?: string,
): { providers: UsageActivityAggregate[]; models: UsageActivityAggregate[] } {
  const read = (kind: "providers" | "models"): UsageActivityAggregate[] => {
    const key =
      kind === "models"
        ? "COALESCE(a.provider_id,'未知服务商') || '/' || COALESCE(a.connection_id,'') || '/' || COALESCE(a.model,'未知模型')"
        : "COALESCE(a.provider_id,'未知服务商') || '/' || COALESCE(a.connection_id,'')";
    const label = kind === "models" ? "COALESCE(a.model,'未知模型')" : "COALESCE(a.provider_id,'未知服务商')";
    const sql = `SELECT ${key} AS key, ${label} AS label, MAX(a.provider_id) AS provider_id, MAX(a.connection_id) AS connection_id, COUNT(*) AS count, SUM(CASE WHEN a.status='error' THEN 1 ELSE 0 END) AS error_count,
      COALESCE(SUM(a.total_tokens),0) AS total_tokens, COALESCE(SUM(a.input_tokens),0) AS input_tokens, COALESCE(SUM(a.output_tokens),0) AS output_tokens, COALESCE(SUM(a.cache_read_tokens),0) AS cache_read_tokens, COALESCE(SUM(a.cache_write_tokens),0) AS cache_write_tokens, COALESCE(SUM(a.reasoning_tokens),0) AS reasoning_tokens,
      COALESCE(SUM(a.ttft_ms),0) AS ttft_ms, COALESCE(SUM(a.ttft_samples),0) AS ttft_samples, COALESCE(SUM(a.decode_ms),0) AS decode_ms, COALESCE(SUM(a.decode_tokens),0) AS decode_tokens,
      SUM(CASE WHEN a.status!='running' AND a.total_tokens IS NULL THEN 1 ELSE 0 END) AS unknown_token_request_count, COALESCE(SUM(a.duration_ms),0) AS duration_ms,
      COALESCE(SUM(${USD_COST}),0) AS cost_usd, SUM(CASE WHEN a.cost_amount IS NOT NULL AND a.cost_currency='USD' THEN 1 ELSE 0 END) AS known_cost_count,
      SUM(CASE WHEN a.status!='running' AND (a.cost_amount IS NULL OR COALESCE(a.cost_currency,'')!='USD') AND a.total_tokens_unknown=0 THEN 1 ELSE 0 END) AS unknown_cost_count,
      SUM(CASE WHEN a.historical_unverified=1 AND a.cost_amount IS NOT NULL AND a.cost_currency='USD' THEN 1 ELSE 0 END) AS unverified_count
      FROM usage_activity a ${filter.sql} GROUP BY ${key} ORDER BY total_tokens DESC, key`;
    return (boundedRows(prepare(database, metricSql(sql, source)).iterate(...filter.args)) as Row[]).map((row) => ({
      key: String(row.key),
      label: String(row.label),
      ...(row.provider_id ? { providerId: String(row.provider_id) } : {}),
      ...(row.connection_id ? { connectionId: String(row.connection_id) } : {}),
      count: n(row.count),
      errorCount: n(row.error_count),
      totalTokens: n(row.total_tokens),
      unknownTokenRequestCount: n(row.unknown_token_request_count),
      durationMs: n(row.duration_ms),
      inputTokens: n(row.input_tokens),
      outputTokens: n(row.output_tokens),
      cacheReadTokens: n(row.cache_read_tokens),
      cacheWriteTokens: n(row.cache_write_tokens),
      reasoningTokens: n(row.reasoning_tokens),
      ttftMs: n(row.ttft_ms),
      ttftSamples: n(row.ttft_samples),
      decodeMs: n(row.decode_ms),
      decodeTokens: n(row.decode_tokens),
      costSummary: {
        costUsd: n(row.cost_usd),
        knownCostRequestCount: n(row.known_cost_count),
        unknownCostRequestCount: n(row.unknown_cost_count),
        unverifiedHistoricalRequestCount: n(row.unverified_count),
      },
    }));
  };
  return { providers: read("providers"), models: read("models") };
}

function timingSql(
  database: DatabaseSync,
  filter: Where,
  source: string | undefined,
  tools?: { durationMs: number; durationSamples: number; approvalWaitMs: number; approvalSamples: number },
): UsageTiming {
  // 主请求才有首字时间；辅助请求单独成一段。
  const row = prepare(
    database,
    metricSql(
      `SELECT COALESCE(SUM(CASE WHEN a.purpose IS NULL THEN a.ttft_ms ELSE 0 END),0) AS ttft_ms, COALESCE(SUM(CASE WHEN a.purpose IS NULL THEN a.ttft_samples ELSE 0 END),0) AS ttft_samples,
    COALESCE(SUM(CASE WHEN a.purpose IS NULL THEN a.decode_ms ELSE 0 END),0) AS decode_ms, COALESCE(SUM(CASE WHEN a.purpose IS NULL THEN a.decode_tokens ELSE 0 END),0) AS decode_tokens,
    COALESCE(SUM(CASE WHEN a.purpose IS NULL AND a.status!='running' THEN 1 ELSE 0 END),0) AS ended, COALESCE(SUM(CASE WHEN a.purpose IS NULL AND a.status!='running' THEN COALESCE(a.ttft_samples,0) ELSE 0 END),0) AS timed,
    COALESCE(SUM(CASE WHEN a.purpose IS NOT NULL THEN a.duration_ms ELSE 0 END),0) AS aux_ms, COALESCE(SUM(CASE WHEN a.purpose IS NOT NULL THEN 1 ELSE 0 END),0) AS aux_count
    FROM usage_activity a ${filter.sql}`,
      source,
    ),
  ).get(...filter.args) as Row;
  return {
    ttftMs: n(row.ttft_ms),
    ttftSamples: n(row.ttft_samples),
    decodeMs: n(row.decode_ms),
    decodeTokens: n(row.decode_tokens),
    untimedRequests: Math.max(0, n(row.ended) - n(row.timed)),
    toolMs: tools?.durationMs ?? 0,
    toolSamples: tools?.durationSamples ?? 0,
    approvalWaitMs: tools?.approvalWaitMs ?? 0,
    approvalSamples: tools?.approvalSamples ?? 0,
    auxiliaryMs: n(row.aux_ms),
    auxiliaryCount: n(row.aux_count),
  };
}

/** 用量趋势：24 小时按小时、7 / 30 天按天、全部按周（周一起），本机时区分桶，补齐空桶。 */
function seriesSql(
  database: DatabaseSync,
  range: NonNullable<UsageStatisticsGetInput["range"]>,
  offset: number,
  filter: Where,
  source: string | undefined,
  now: Date,
): UsageSeries {
  const unit: UsageSeries["unit"] = range === "day" ? "hour" : range === "total" ? "week" : "day";
  const shift = shiftSql(offset);
  const bucket =
    unit === "hour"
      ? `strftime('%Y-%m-%d %H:00',a.started_at,${shift})`
      : unit === "day"
        ? `date(a.started_at,${shift})`
        : `date(a.started_at,${shift},'-6 days','weekday 1')`;
  // 整小时时区直接用小时 rollup；+5:30 这类时区按明细分桶，避免半小时误差。
  const seriesSource = offset % 60 !== 0 ? undefined : source === "usage_total_rollups" ? "usage_rollups" : source;
  const rows = boundedRows(
    prepare(
      database,
      metricSql(
        `SELECT ${bucket} AS start, COALESCE(SUM(a.total_tokens),0) AS tokens, COALESCE(SUM(${USD_COST}),0) AS cost, COUNT(*) AS requests FROM usage_activity a ${filter.sql} GROUP BY 1`,
        seriesSource,
      ),
    ).iterate(...filter.args),
  ) as Row[];
  const values = new Map(rows.map((row) => [String(row.start), row]));
  const local = new Date(now.getTime() + offset * 60_000);
  const keys: string[] = [];
  if (unit === "hour") {
    const hour = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), local.getUTCHours());
    for (let index = 23; index >= 0; index--) {
      const date = new Date(hour - index * 3_600_000);
      keys.push(`${dayKey(date)} ${String(date.getUTCHours()).padStart(2, "0")}:00`);
    }
  } else if (unit === "day") {
    const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    for (let index = RANGE_DAYS[range as "week" | "month"] - 1; index >= 0; index--)
      keys.push(dayKey(new Date(today - index * DAY)));
  } else {
    const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
    const first = [...values.keys()].sort()[0];
    const start = first ? Date.parse(`${first}T00:00:00.000Z`) : monday;
    for (let week = Math.max(start, monday - 520 * 7 * DAY); week <= monday; week += 7 * DAY)
      keys.push(dayKey(new Date(week)));
  }
  // 总 rollup 不带时间，最早时间取小时 rollup（精确到小时，够算日均）。
  const first = prepare(
    database,
    metricSql(`SELECT MIN(a.started_at) AS first_at FROM usage_activity a ${filter.sql}`, seriesSource),
  ).get(...filter.args) as Row | undefined;
  return {
    unit,
    firstAt: first?.first_at ? String(first.first_at) : null,
    buckets: keys.map((start) => {
      const row = values.get(start);
      return { start, tokens: n(row?.tokens), costUsd: n(row?.cost), requests: n(row?.requests) };
    }),
  };
}

/** 活跃度：最近 98 天（本机时区），不受任何筛选影响；会话 = 当天有模型请求的会话数。 */
function heatmapSql(database: DatabaseSync, offset: number, now: Date): UsageHeatmap {
  const local = new Date(now.getTime() + offset * 60_000);
  const since = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      (HEATMAP_DAYS - 1) * DAY -
      offset * 60_000,
  ).toISOString();
  const shift = shiftSql(offset);
  const whole = offset % 60 === 0;
  const tokens = boundedRows(
    prepare(
      database,
      `SELECT date(started_at,${shift}) AS date,COALESCE(SUM(total_tokens),0) AS tokens FROM ${whole ? "usage_rollups" : "usage_activity"} WHERE started_at>=? GROUP BY 1`,
    ).iterate(since),
  ) as Row[];
  const sessions = boundedRows(
    prepare(
      database,
      `SELECT date(started_at,${shift}) AS date,COUNT(DISTINCT session_id) AS sessions FROM ${whole ? "usage_run_counts" : "usage_activity"} WHERE started_at>=? AND kind='llm_request' GROUP BY 1`,
    ).iterate(since),
  ) as Row[];
  const days = new Map<string, { date: string; sessions: number; tokens: number }>();
  for (const row of tokens) days.set(String(row.date), { date: String(row.date), sessions: 0, tokens: n(row.tokens) });
  for (const row of sessions) {
    const day = days.get(String(row.date)) ?? { date: String(row.date), sessions: 0, tokens: 0 };
    day.sessions = n(row.sessions);
    days.set(day.date, day);
  }
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

/** 辅助模型各用途：不受模型 / 提供商筛选影响。 */
function auxiliarySql(database: DatabaseSync, base: Where, rangeSource?: string): UsageAuxiliaryRow[] {
  return (
    boundedRows(
      prepare(
        database,
        metricSql(
          `SELECT a.purpose AS purpose, COUNT(*) AS calls, COALESCE(SUM(a.duration_ms),0) AS duration_ms, COALESCE(SUM(a.total_tokens),0) AS tokens, COALESCE(SUM(${USD_COST}),0) AS cost FROM usage_activity a ${base.and("a.purpose IS NOT NULL")} GROUP BY a.purpose ORDER BY 2 DESC`,
          rangeSource,
        ),
      ).iterate(...base.args),
    ) as Row[]
  ).map((row) => ({
    purpose: String(row.purpose) as UsageAuxiliaryPurpose,
    calls: n(row.calls),
    durationMs: n(row.duration_ms),
    totalTokens: n(row.tokens),
    costUsd: n(row.cost),
  }));
}

function filterOptions(database: DatabaseSync): { models: string[]; providers: string[]; workspaces: string[] } {
  const distinct = (sql: string) =>
    (boundedRows(prepare(database, sql).iterate()) as Row[]).map((row) => String(row.value));
  return {
    models: distinct(
      "SELECT DISTINCT model AS value FROM usage_total_rollups WHERE model IS NOT NULL AND model<>'' ORDER BY 1",
    ),
    providers: distinct(
      "SELECT DISTINCT provider_id AS value FROM usage_total_rollups WHERE provider_id IS NOT NULL AND provider_id<>'' ORDER BY 1",
    ),
    workspaces: distinct(
      `SELECT DISTINCT ${WORKSPACE_ROOT} AS value FROM session_catalog WHERE ${WORKSPACE_ROOT}<>'' ORDER BY 1`,
    ),
  };
}

/* ------------------------------ Harness 表 ------------------------------ */

/** 使用统计读 Harness 表：会话类型 = 全部；按时间、单会话、工作区筛选。 */
class HarnessScope {
  readonly where: string;
  readonly args: (string | number)[] = [];
  constructor(
    readonly db: DatabaseSync,
    sessionId: string | undefined,
    since: string | undefined,
    workspaceRoot: string | undefined,
  ) {
    const conditions = ["t.hour IS NOT NULL"];
    if (since) {
      conditions.push("t.hour>=? AND t.hour GLOB '[0-9]*'");
      this.args.push(since.slice(0, 13));
    }
    if (sessionId !== undefined) {
      conditions.push("t.session_id=?");
      this.args.push(sessionId);
    }
    if (workspaceRoot !== undefined) {
      conditions.push("m.workspace_root=?");
      this.args.push(workspaceRoot);
    }
    this.where = conditions.join(" AND ");
  }
  all(select: string, table: string, rest = ""): Row[] {
    return boundedRows(
      prepare(
        this.db,
        `SELECT ${select} FROM ${table} t LEFT JOIN harness_session_meta m ON m.session_id=t.session_id WHERE ${this.where} ${rest}`,
      ).iterate(...this.args),
    ) as Row[];
  }
}

function toolRows(scope: HarnessScope): {
  rows: UsageToolRow[];
  totals: { durationMs: number; durationSamples: number; approvalWaitMs: number; approvalSamples: number };
} {
  const totals = { durationMs: 0, durationSamples: 0, approvalWaitMs: 0, approvalSamples: 0 };
  const rows = scope
    .all(
      `t.tool AS tool,MAX(t.plugin_id) AS plugin_id,SUM(t.calls) AS calls,SUM(t.failed) AS failed,GROUP_CONCAT(t.failure_codes,${SEP}) AS codes,SUM(t.duration_ms) AS duration_ms,SUM(t.duration_samples) AS duration_samples,GROUP_CONCAT(t.duration_hist,${SEP}) AS hists,SUM(t.output_tokens) AS output_tokens,SUM(t.output_samples) AS output_samples,SUM(t.approval_wait_ms) AS wait_ms,SUM(t.approval_wait_samples) AS wait_samples`,
      "harness_tool_rollup",
      "GROUP BY t.tool HAVING SUM(t.calls)>0 ORDER BY 3 DESC, 1",
    )
    .map((row) => {
      totals.durationMs += n(row.duration_ms);
      totals.durationSamples += n(row.duration_samples);
      totals.approvalWaitMs += n(row.wait_ms);
      totals.approvalSamples += n(row.wait_samples);
      const failureCodes: Record<string, number> = {};
      for (const value of split(row.codes))
        for (const [code, count] of Object.entries(parseObject(value)))
          failureCodes[code] = (failureCodes[code] ?? 0) + n(count);
      const hist = emptyHarnessHistogram();
      for (const value of split(row.hists)) addHarnessHistograms(hist, parseArray(value));
      return {
        name: String(row.tool),
        ...(row.plugin_id ? { pluginId: String(row.plugin_id) } : {}),
        calls: n(row.calls),
        failed: n(row.failed),
        failureCodes,
        durationMs: n(row.duration_ms),
        durationSamples: n(row.duration_samples),
        p95Ms: harnessHistogramQuantile(hist, 0.95, HARNESS_DURATION_BASE_MS),
        outputTokens: n(row.output_tokens),
        outputSamples: n(row.output_samples),
      };
    });
  return { rows, totals };
}

function commandRows(scope: HarnessScope): UsageCommandRow[] {
  const programs = new Map<string, UsageCommandRow & { subcommands: { name: string; calls: number }[] }>();
  for (const row of scope.all(
    "t.program AS program,t.subcommand AS subcommand,SUM(t.calls) AS calls,SUM(t.failed) AS failed,SUM(t.duration_ms) AS duration_ms,SUM(t.duration_samples) AS duration_samples",
    "harness_bash_rollup",
    "GROUP BY 1,2",
  )) {
    const name = String(row.program);
    const program = programs.get(name) ?? {
      program: name,
      calls: 0,
      failed: 0,
      durationMs: 0,
      durationSamples: 0,
      subcommands: [],
    };
    program.calls += n(row.calls);
    program.failed += n(row.failed);
    program.durationMs += n(row.duration_ms);
    program.durationSamples += n(row.duration_samples);
    if (row.subcommand) program.subcommands.push({ name: String(row.subcommand), calls: n(row.calls) });
    programs.set(name, program);
  }
  for (const program of programs.values())
    program.subcommands.sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  return [...programs.values()]
    .filter((row) => row.calls > 0)
    .sort((a, b) => b.calls - a.calls || a.program.localeCompare(b.program));
}

function skillRows(scope: HarnessScope): UsageSkillRow[] {
  const files = new Map<string, { file: string; reads: number }[]>();
  for (const row of scope.all(
    "t.skill_id AS id,t.file AS file,SUM(t.reads) AS reads",
    "harness_skill_file",
    "GROUP BY 1,2",
  )) {
    files.set(String(row.id), [...(files.get(String(row.id)) ?? []), { file: String(row.file), reads: n(row.reads) }]);
  }
  return scope
    .all(
      "t.skill_id AS id,SUM(t.skill_reads) AS skill_reads,SUM(t.asset_reads) AS asset_reads,MAX(t.last_read_at) AS last_read_at",
      "harness_skill_rollup",
      "GROUP BY 1 HAVING SUM(t.skill_reads)+SUM(t.asset_reads)>0 ORDER BY 2 DESC, 3 DESC, 1",
    )
    .map((row) => ({
      skillId: String(row.id),
      skillReads: n(row.skill_reads),
      assetReads: n(row.asset_reads),
      lastReadAt: row.last_read_at ? String(row.last_read_at) : null,
      files: (files.get(String(row.id)) ?? [])
        .sort((a, b) => b.reads - a.reads || a.file.localeCompare(b.file))
        .slice(0, 6)
        .map((item) => item.file),
    }));
}

/**
 * 子 Agent：父会话的 requested 行带维度，终止状态与耗时可能来自子会话的事件，按 invocation 合并。
 * Token / 费用 = 该类型的子会话（去重）在范围内的模型请求合计。
 */
function subagentRows(database: DatabaseSync, scope: HarnessScope, since: string | undefined): UsageSubagentRow[] {
  const merged = new Map<string, Row>();
  for (const row of boundedRows(
    prepare(
      database,
      `SELECT d.invocation_id,d.preset_id,d.status,d.child_session_id,d.duration_ms FROM harness_delegation d WHERE d.invocation_id IN (SELECT t.invocation_id FROM harness_delegation t LEFT JOIN harness_session_meta m ON m.session_id=t.session_id WHERE ${scope.where})`,
    ).iterate(...scope.args),
  ) as Row[]) {
    const id = String(row.invocation_id);
    const current = merged.get(id) ?? {};
    for (const [key, value] of Object.entries(row))
      if (value !== null && value !== undefined && !(key === "status" && value === "running" && current.status))
        current[key] = value;
    merged.set(id, current);
  }
  const presets = new Map<string, UsageSubagentRow & { children: Set<string> }>();
  for (const row of merged.values()) {
    const preset = String(row.preset_id ?? "unknown");
    const item = presets.get(preset) ?? {
      preset,
      calls: 0,
      failed: 0,
      durationMs: 0,
      durationSamples: 0,
      totalTokens: 0,
      costUsd: 0,
      children: new Set<string>(),
    };
    item.calls++;
    if (row.status === "failed" || row.status === "error") item.failed++;
    if (row.duration_ms != null) {
      item.durationMs += n(row.duration_ms);
      item.durationSamples++;
    }
    if (typeof row.child_session_id === "string") item.children.add(row.child_session_id);
    presets.set(preset, item);
  }
  const children = [...new Set([...presets.values()].flatMap((item) => [...item.children]))];
  const usage = new Map<string, { tokens: number; cost: number }>();
  for (let index = 0; index < children.length; index += 500) {
    const chunk = children.slice(index, index + 500);
    const rows = prepare(
      database,
      `SELECT session_id,COALESCE(SUM(total_tokens),0) AS tokens,COALESCE(SUM(CASE WHEN cost_amount IS NOT NULL AND cost_currency='USD' THEN cost_amount ELSE 0 END),0) AS cost FROM usage_activity WHERE session_id IN (${chunk.map(() => "?").join(",")})${since ? " AND started_at>=?" : ""} GROUP BY session_id`,
    ).all(...chunk, ...(since ? [since] : [])) as Row[];
    for (const row of rows) usage.set(String(row.session_id), { tokens: n(row.tokens), cost: n(row.cost) });
  }
  return [...presets.values()]
    .map(({ children: ids, ...item }) => {
      for (const id of ids) {
        const used = usage.get(id);
        if (used) {
          item.totalTokens += used.tokens;
          item.costUsd += used.cost;
        }
      }
      return item;
    })
    .sort((a, b) => b.calls - a.calls || a.preset.localeCompare(b.preset));
}

/* ------------------------------ 工具函数 ------------------------------ */

function watermarks(database: DatabaseSync, scope: "session" | "global", sessionId?: string) {
  const query =
    "SELECT session_id,CAST(i.value AS INTEGER) AS revision FROM session_catalog JOIN index_state i ON i.key='session:'||session_id";
  const statement = prepare(
    database,
    query + (scope === "session" ? " WHERE session_id=?" : "") + " ORDER BY session_id LIMIT 501",
  );
  const rows = boundedRows(statement.iterate(...(scope === "session" ? [sessionId ?? ""] : []))) as {
    session_id: string;
    revision: number;
  }[];
  return {
    sourceWatermarks: rows
      .slice(0, 500)
      .map((row) => ({ sessionId: row.session_id, throughJournalSeq: row.revision }))
      .sort((a, b) => a.sessionId.localeCompare(b.sessionId)),
    ...(rows.length > 500 ? { sourceWatermarksTruncated: true } : {}),
  };
}

/** 本机时区偏移（分钟），限制在 ±14 小时；非法值按 UTC。 */
function utcOffset(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= 14 * 60 ? value : 0;
}
/** SQLite 日期修饰符；offset 已校验为整数，不含用户原文。 */
const shiftSql = (offset: number) => `'${offset >= 0 ? "+" : ""}${offset} minutes'`;
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const split = (value: unknown): string[] => (typeof value === "string" ? value.split("\u001f").filter(Boolean) : []);

export function toFtsQuery(value: string): string {
  // Treat operators as literal text; preserve explicitly quoted phrases.
  const tokens = value.trim().match(/"[^"]*"|[^\s"]+/g) ?? [];
  return tokens.map((token) => `"${token.replace(/^"|"$/g, "").replaceAll('"', '""')}"`).join(" AND ") || '""';
}
function encodeCursor(row: UsageActivityRow | undefined): string | null {
  return row
    ? Buffer.from(
        JSON.stringify({ startedAt: row.startedAt, sourceEventSeq: row.sourceEventSeq, activityId: row.activityId }),
        "utf8",
      ).toString("base64url")
    : null;
}
function decodeCursor(
  value: string | undefined,
): { startedAt: string; sourceEventSeq: number; activityId: string } | undefined {
  if (value === undefined) return undefined;
  try {
    if (!value || value.length > 2048) throw new Error();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed.startedAt !== "string" ||
      !Number.isSafeInteger(parsed.sourceEventSeq) ||
      typeof parsed.activityId !== "string"
    )
      throw new Error();
    return parsed;
  } catch {
    throw new Error("Usage cursor invalid; restart the query.");
  }
}

export function boundedInteger(value: number | undefined, fallback: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), max)) : fallback;
}

/** Stop before collecting an unbounded aggregate/dimension result in JS. */
export function boundedRows<T>(rows: Iterable<T>, budget = { bytes: 0, rows: 0 }): T[] {
  const result: T[] = [];
  for (const row of rows) {
    budget.bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
    if (budget.bytes > 1024 * 1024 || budget.rows >= 16_384)
      throw new Error("Usage result exceeds the query budget; narrow the query.");
    budget.rows++;
    result.push(row);
  }
  return result;
}

function parseArray(value: unknown): number[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as number[]) : [];
  } catch {
    return [];
  }
}
function parseObject(value: unknown): Record<string, number> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}
