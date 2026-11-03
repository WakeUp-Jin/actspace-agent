/**
 * Harness 统计的共享契约：设置页「Harness 统计」、Desktop 主进程汇总 Worker，
 * 以及第二期 Agent 查询工具共用同一套类型、规则阈值和分档。
 * 设计见 docs/design-docs/自进化的方案设计/11-Harness统计设计.md。
 *
 * 单位约定：名字以 Rate / Share 结尾的字段，以及上下文窗口占比（window.p50 / p95、triggerWindowP50）都是 0–1 的小数，
 * 没有样本时为 null；*Ms 是毫秒；*Tokens 是估算 token。
 */

export const HARNESS_STATS_TABS = ["overview", "plugins", "tools", "context", "disclosure", "runtime", "versions"] as const;
export type HarnessStatsTab = (typeof HARNESS_STATS_TABS)[number];
/** 顶部指标卡与筛选选项也走按需查询，但不是 tab。 */
export type HarnessStatsQueryKind = HarnessStatsTab | "summary" | "options";

export type HarnessStatsRange = "day" | "week" | "month" | "total";
export type HarnessStatsSessionKind = "main" | "child" | "side" | "all";

/** 版本键：`<harnessId>@<revision>`；没有版本信息的旧记录为 `unknown`。 */
export type HarnessRevisionKey = string;
export const HARNESS_UNKNOWN_REVISION = "unknown";

export type HarnessStatsFilter = {
  readonly range: HarnessStatsRange;
  readonly mode?: string;
  readonly model?: string;
  readonly workspaceRoot?: string;
  readonly sessionKind: HarnessStatsSessionKind;
  readonly revision?: HarnessRevisionKey;
};

export type HarnessStatsQueryInput = {
  readonly requestId: string;
  readonly kind: HarnessStatsQueryKind;
  readonly filter: HarnessStatsFilter;
  /** 只用于 versions：对比的两个版本；缺省为最近两个有数据的版本。 */
  readonly compare?: { readonly from: HarnessRevisionKey; readonly to: HarnessRevisionKey };
};

export type HarnessStatsSyncStatus = {
  /** idle：没有在补数据；syncing：正在读会话日志或统计文件；failed：上次同步失败。 */
  readonly phase: "idle" | "syncing" | "failed";
  readonly completedSessions: number;
  readonly totalSessions: number;
  readonly eventsRead: number;
  /** 每次同步提交新数据后递增；页面据此判断缓存是否过期。 */
  readonly dataVersion: number;
  readonly error?: string;
  /** 读取失败、被跳过的会话数。 */
  readonly failedSessions: number;
};

export type HarnessStatsStatusInput = { readonly consumerId: string };

export type HarnessStatsQueryResult = {
  readonly requestId: string;
  readonly kind: HarnessStatsQueryKind;
  readonly generatedAt: string;
  readonly dataVersion: number;
  readonly sync: HarnessStatsSyncStatus;
  readonly data: HarnessStatsData;
};

export type HarnessStatsData =
  | { readonly kind: "summary"; readonly value: HarnessStatsSummary }
  | { readonly kind: "options"; readonly value: HarnessStatsOptions }
  | { readonly kind: "overview"; readonly value: HarnessStatsOverview }
  | { readonly kind: "plugins"; readonly value: HarnessStatsPlugins }
  | { readonly kind: "tools"; readonly value: HarnessStatsTools }
  | { readonly kind: "context"; readonly value: HarnessStatsContext }
  | { readonly kind: "disclosure"; readonly value: HarnessStatsDisclosure }
  | { readonly kind: "runtime"; readonly value: HarnessStatsRuntime }
  | { readonly kind: "versions"; readonly value: HarnessStatsVersions };

export type HarnessPluginSource = "builtin" | "user" | "evolved" | "unknown";

export type HarnessStatsSummary = {
  readonly plugins: { readonly loaded: number; readonly withTools: number; readonly evolved: number; readonly user: number };
  readonly toolCalls: { readonly calls: number; readonly failureRate: number | null; readonly tools: number };
  readonly context: { readonly avgEstimatedTokens: number | null; readonly toolsShare: number | null };
  readonly compaction: { readonly count: number; readonly activeHitRate: number | null };
  readonly requests: number;
};

export type HarnessStatsOptions = {
  readonly modes: readonly string[];
  readonly models: readonly string[];
  readonly workspaces: readonly string[];
  readonly revisions: readonly HarnessRevisionInfo[];
  readonly currentRevision: HarnessRevisionKey | null;
};

export type HarnessRevisionInfo = {
  readonly key: HarnessRevisionKey;
  readonly harnessId: string | null;
  readonly revision: number | null;
  readonly description: string | null;
  /** 首次 / 最后一次出现在数据里的时间（ISO）。 */
  readonly firstSeenAt: string | null;
  readonly lastSeenAt: string | null;
  readonly requests: number;
};

export type HarnessFlagLevel = "warn" | "error" | "info";
export type HarnessFlagRuleId =
  | "tool-costly-unused"
  | "plugin-costly-unused"
  | "tool-failure-rate"
  | "plugin-load-failure"
  | "listener-errors"
  | "service-never-called"
  | "skill-never-read"
  | "compaction-reread"
  | "mis-sleep"
  | "background-unread"
  | "step-limit"
  | "context-churn";

export type HarnessFlag = {
  readonly rule: HarnessFlagRuleId;
  readonly level: HarnessFlagLevel;
  readonly title: string;
  readonly detail: string;
  /** 卡片右侧的分类说明，例如「工具 · 成本 vs 使用」。 */
  readonly category: string;
  /**
   * 点击后跳到哪个 tab、定位哪一行。key 按 tab 取：tools → 工具名；plugins → pluginId；
   * context → 上下文来源的 entry key 或 Skill id；没有 key 表示只跳 tab（例如合并后的多条同类提醒）。
   */
  readonly target: { readonly tab: HarnessStatsTab; readonly key?: string };
};

export type HarnessDailyCount = { readonly day: string; readonly value: number };
export type HarnessBucketAverage = { readonly bucket: string; readonly avgTokens: number };

export type HarnessStatsOverview = {
  readonly flags: readonly HarnessFlag[];
  readonly dailyToolCalls: readonly HarnessDailyCount[];
  readonly buckets: readonly HarnessBucketAverage[];
  readonly avgEstimatedTokens: number | null;
  readonly harness: {
    readonly currentRevision: HarnessRevisionKey | null;
    readonly currentSince: string | null;
    readonly plugins: number;
    readonly toolPlugins: number;
    readonly tools: number;
    readonly statsFileBytes: number;
    readonly statsWriteFailures: number;
    readonly lastRebuildAt: string | null;
  };
};

export type HarnessPluginRow = {
  readonly pluginId: string;
  readonly source: HarnessPluginSource;
  readonly tools: number;
  readonly toolCalls: number;
  readonly toolFailures: number;
  /** 这个插件的工具定义平均每次请求占多少 token。 */
  readonly contextTokens: number | null;
  readonly services: number;
  readonly serviceCalls: number;
  readonly listeners: number;
  readonly listenerCalls: number;
  readonly listenerErrors: number;
  /** 这个插件写入会话日志的事件数（source.ownerPluginId）。 */
  readonly journalEvents: number;
  readonly loads: number;
  readonly loadFailures: number;
  readonly loadP50Ms: number | null;
  readonly lastLoadError: string | null;
};
export type HarnessServiceRow = {
  readonly providerPluginId: string | null;
  readonly service: string;
  readonly method: string;
  readonly calls: number;
  readonly errors: number;
  readonly avgMs: number | null;
  readonly p95Ms: number | null;
};
export type HarnessDependencyRow = { readonly caller: string; readonly callee: string; readonly service: string; readonly calls: number };
export type HarnessListenerRow = { readonly pluginId: string; readonly event: string; readonly calls: number; readonly errors: number; readonly avgMs: number | null };

export type HarnessStatsPlugins = {
  readonly rows: readonly HarnessPluginRow[];
  readonly services: readonly HarnessServiceRow[];
  readonly dependencies: readonly HarnessDependencyRow[];
  readonly listeners: readonly HarnessListenerRow[];
  /** 选了模式、模型、工作区或会话类型时为 true：服务、监听、加载只按时间和版本统计。 */
  readonly runtimeFilterLimited: boolean;
  /** 统计文件里还没有任何运行时数据（例如统计刚开启或被关闭）。 */
  readonly runtimeEmpty: boolean;
};

export type HarnessToolRow = {
  readonly name: string;
  readonly pluginId: string | null;
  /** 出现在多少次模型请求里。 */
  readonly exposures: number;
  readonly calls: number;
  readonly completed: number;
  readonly failed: number;
  readonly denied: number;
  readonly aborted: number;
  readonly unknownOutcome: number;
  readonly failureCodes: readonly { readonly code: string; readonly count: number }[];
  /** 工具定义平均 token。 */
  readonly schemaTokens: number | null;
  readonly outputTokensAvg: number | null;
  readonly outputTokensP95: number | null;
  readonly durationP50Ms: number | null;
  readonly durationP95Ms: number | null;
  readonly truncated: number;
  readonly repeatedSameArgs: number;
  readonly retryAfterFailure: number;
  readonly foldedOutputs: number;
  readonly foldedTokens: number;
  readonly lastUsedAt: string | null;
};

export type HarnessStatsTools = {
  readonly rows: readonly HarnessToolRow[];
  readonly approvals: {
    readonly asked: number;
    readonly userApproved: number;
    readonly userDenied: number;
    readonly timedOut: number;
    readonly autoApproved: number;
    readonly autoDeclined: number;
    readonly sessionGrantUsed: number;
    readonly scopeDenied: number;
    readonly avgWaitMs: number | null;
  };
  readonly bash: { readonly sandboxed: number; readonly unsandboxed: number; readonly unknownEnvironment: number; readonly escalations: number; readonly foreground: number; readonly background: number };
  readonly waste: { readonly repeatedSameArgs: number; readonly retryAfterFailure: number; readonly truncated: number; readonly foldedOutputs: number; readonly foldedTokens: number };
};

export type HarnessSourceRow = {
  readonly key: string;
  readonly kind: "tools" | "skills" | "section" | "supplement" | "model-facts" | "other";
  readonly owner: string | null;
  readonly id: string;
  readonly appearances: number;
  readonly avgTokens: number;
  readonly maxTokens: number;
  /** 与同一会话上一次请求相比内容（token 数）变了的比例。 */
  readonly changeRate: number | null;
};
export type HarnessSkillRow = {
  readonly id: string;
  readonly source: string | null;
  readonly listed: number;
  readonly selected: number;
  readonly skillReads: number;
  readonly assetReads: number;
  readonly lastReadAt: string | null;
};

export type HarnessStatsContext = {
  readonly requests: number;
  readonly incompleteRequests: number;
  readonly buckets: readonly HarnessBucketAverage[];
  readonly avgEstimatedTokens: number | null;
  readonly window: { readonly p50: number | null; readonly p95: number | null; readonly overThreshold: number };
  readonly estimate: { readonly deltaRate: number | null; readonly worstModel: string | null; readonly worstDeltaRate: number | null; readonly samples: number };
  readonly cache: { readonly hitRate: number | null; readonly systemChanges: number; readonly runtimeChanges: number };
  readonly sources: readonly HarnessSourceRow[];
  readonly skills: readonly HarnessSkillRow[];
  readonly skillsCatalogTokens: number | null;
};

export type HarnessStatsDisclosure = {
  readonly cycles: number;
  readonly activeHitRate: number | null;
  readonly sleepingReads: number;
  readonly wakeShare: number | null;
  readonly avgSleepCycles: number | null;
  readonly misSleepRate: number | null;
  readonly sleepingPaths: number;
  readonly indexTokensAvg: number | null;
  readonly indexReads: number;
  readonly indexConversions: number;
  readonly capHits: number;
  /** 11 档：0–9、10–19 … 90–99、100。 */
  readonly activeHistogram: readonly number[];
  /** 6 档：睡 1、2、3、4、5、6+ 个周期后被唤醒。 */
  readonly sleepHistogram: readonly number[];
  readonly topPaths: readonly { readonly path: string; readonly reads: number }[];
  readonly compaction: {
    readonly count: number;
    readonly auto: number;
    readonly manual: number;
    readonly failed: number;
    readonly avgBeforeTokens: number | null;
    readonly avgAfterTokens: number | null;
    readonly avgDurationMs: number | null;
    readonly rereadRate: number | null;
    readonly triggerWindowP50: number | null;
    /** 9 档：<10、10–19 … 70–79、80+ 步。 */
    readonly stepsBetweenHistogram: readonly number[];
    readonly foldedOutputs: number;
    readonly foldedTokens: number;
    readonly failureReasons: readonly { readonly code: string; readonly count: number }[];
  };
};

export type HarnessStatsRuntime = {
  readonly turns: number;
  readonly avgSteps: number | null;
  readonly stepLimitHits: number;
  /** 11 档：1、2–3、4–5、6–8、9–12、13–16、17–24、25–32、33–48、49–64、65+。 */
  readonly stepsHistogram: readonly number[];
  readonly endReasons: { readonly completed: number; readonly aborted: number; readonly failed: number; readonly stepLimit: number; readonly other: number };
  readonly retries: { readonly total: number; readonly byCode: readonly { readonly code: string; readonly count: number }[] };
  readonly interventions: { readonly aborted: number; readonly steering: number; readonly queued: number };
  /** 子智能体：新会话每次激活一行（`subagent/activation`，presetId 为 `actspace.subagent.<preset>`），老会话每次委托一行（`delegation/*`）。 */
  readonly delegations: { readonly byPreset: readonly { readonly presetId: string; readonly count: number }[]; readonly failed: number; readonly avgSteps: number | null; readonly avgDurationMs: number | null; readonly avgReturnTokens: number | null };
  readonly background: { readonly byKind: readonly { readonly kind: string; readonly count: number }[]; readonly completed: number; readonly failed: number; readonly stopped: number; readonly avgDurationMs: number | null; readonly unread: number };
  readonly sideChats: { readonly sessions: number; readonly avgTurns: number | null };
  readonly modeSwitches: number;
  readonly modeShare: readonly { readonly mode: string; readonly requests: number }[];
  readonly auxiliary: readonly { readonly purpose: string; readonly calls: number; readonly failed: number; readonly avgMs: number | null }[];
};

export type HarnessCompareFormat = "count" | "rate" | "tokens" | "number" | "ms";
export type HarnessCompareRow = {
  readonly id: string;
  readonly label: string;
  readonly from: number | null;
  readonly to: number | null;
  readonly better: "lower" | "higher";
  readonly format: HarnessCompareFormat;
};

export type HarnessStatsVersions = {
  readonly revisions: readonly HarnessRevisionInfo[];
  readonly from: HarnessRevisionKey | null;
  readonly to: HarnessRevisionKey | null;
  readonly compare: readonly HarnessCompareRow[];
  /** 对比的任一版本样本少于 HARNESS_COMPARE_MIN_REQUESTS 时为 true。 */
  readonly lowSample: boolean;
  readonly evolutionOps: readonly { readonly action: string; readonly count: number; readonly failed: number }[];
  readonly evolvedPlugins: readonly { readonly pluginId: string; readonly calls: number; readonly failures: number; readonly sessions: number }[];
};

/* ---------------------------- 分档与规则 ---------------------------- */

/** 16 档对数直方图：耗时从 1ms 起每档 ×2，输出 token 从 16 起每档 ×2。最后一档收所有更大的值。 */
export const HARNESS_HISTOGRAM_BUCKETS = 16;
export const HARNESS_DURATION_BASE_MS = 1;
export const HARNESS_TOKEN_BASE = 16;

export function harnessHistogramIndex(value: number, base: number): number {
  if (!Number.isFinite(value) || value <= base) return 0;
  return Math.min(HARNESS_HISTOGRAM_BUCKETS - 1, Math.ceil(Math.log2(value / base)));
}
/** 档位上界（含）。P50 / P95 取所在档的上界，页面写「约」。 */
export function harnessHistogramUpperBound(index: number, base: number): number {
  return base * 2 ** index;
}
export function harnessHistogramQuantile(histogram: readonly number[], q: number, base: number): number | null {
  const total = histogram.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  const target = Math.max(1, Math.ceil(total * q));
  let seen = 0;
  for (let index = 0; index < histogram.length; index++) {
    seen += histogram[index] ?? 0;
    if (seen >= target) return harnessHistogramUpperBound(index, base);
  }
  return harnessHistogramUpperBound(histogram.length - 1, base);
}
export function emptyHarnessHistogram(): number[] { return Array.from({ length: HARNESS_HISTOGRAM_BUCKETS }, () => 0); }
export function addHarnessHistograms(target: number[], source: readonly number[]): number[] {
  for (let index = 0; index < HARNESS_HISTOGRAM_BUCKETS; index++) target[index] = (target[index] ?? 0) + (source[index] ?? 0);
  return target;
}

/** 「值得关注」规则阈值。改阈值只改这里；第二期 Agent 查询引用同一张表。 */
export const HARNESS_FLAG_RULES = {
  toolCostlyUnused: { maxCallRate: 0.01, minSchemaTokens: 300, minExposures: 200 },
  pluginCostlyUnused: { maxCallRate: 0.01, minSchemaTokens: 500, minExposures: 200 },
  toolFailureRate: { minFailureRate: 0.05, minCalls: 30 },
  pluginLoadFailure: { minFailures: 1 },
  listenerErrors: { minErrors: 1 },
  serviceNeverCalled: { minRangeDays: 7 },
  skillNeverRead: { minListed: 200 },
  compactionReread: { minRate: 0.2, minCompactions: 10 },
  misSleep: { minRate: 0.1, minSleepingPaths: 50 },
  backgroundUnread: { minUnread: 1 },
  stepLimit: { minRate: 0.02, minTurns: 50 },
  contextChurn: { minChangeRate: 0.2, minAppearances: 200 },
} as const;

/** 压缩后多少步内重读算“压缩后重读”；查索引后多少步内读了索引里的文件算“索引转化”。 */
export const HARNESS_REREAD_WINDOW_STEPS = 5;
export const HARNESS_INDEX_CONVERSION_STEPS = 5;
/** 披露活跃集合上限，与 selectNextActivePathIds 一致。 */
export const HARNESS_ACTIVE_PATH_LIMIT = 100;
/** 版本对比时样本少于这个请求数就提示「偏少，仅供参考」。 */
export const HARNESS_COMPARE_MIN_REQUESTS = 200;

/* ---------------------------- 统计文件 ---------------------------- */

/** `<dataRoot>/harness-stats/YYYY-MM.jsonl` 的一行：小时级运行时累计值。 */
export type HarnessRuntimeStatLine = {
  readonly v: 1;
  readonly t: "runtime";
  /** 小时起点 ISO，例如 2026-11-01T09:00:00.000Z。 */
  readonly hour: string;
  readonly revision: HarnessRevisionKey;
  readonly kind: "service" | "listener" | "dependency";
  /** service / listener：插件 entry id（调用方或监听方）；dependency：调用方。 */
  readonly plugin: string;
  /** service：服务名；listener：事件名；dependency：被调用方插件。 */
  readonly name: string;
  /** service：方法名；dependency：服务名；listener：空串。 */
  readonly method: string;
  /** service：提供该服务的插件；其他为 null。 */
  readonly provider: string | null;
  readonly calls: number;
  readonly errors: number;
  readonly totalMs: number;
  readonly histogram: readonly number[];
};

/** 每次挂载一个 Harness 版本写一条；工具归属在插件注册工具时追加。 */
export type HarnessInventoryLine = {
  readonly v: 1;
  readonly t: "inventory";
  readonly at: string;
  readonly revision: HarnessRevisionKey;
  readonly plugin: string;
  readonly source: HarnessPluginSource;
  readonly provides: readonly string[];
  readonly loadMs: number | null;
  readonly ok: boolean;
  readonly error: string | null;
};
export type HarnessToolOwnerLine = {
  readonly v: 1;
  readonly t: "tool-owner";
  readonly at: string;
  readonly revision: HarnessRevisionKey;
  /** 注册工具的插件 entry id。 */
  readonly plugin: string;
  /** 工具定义上的 pluginId（会话日志 tool/call.pluginId 用的就是它）。 */
  readonly toolPluginId: string | null;
  readonly tool: string;
};
/** writeFailures 是增量：自上一条 health 行以来新增的写入失败次数，读取方直接累加。 */
export type HarnessHealthLine = { readonly v: 1; readonly t: "health"; readonly at: string; readonly writeFailures: number };
export type HarnessStatsFileLine = HarnessRuntimeStatLine | HarnessInventoryLine | HarnessToolOwnerLine | HarnessHealthLine;

export function harnessRevisionKey(harnessId: string | null | undefined, revision: number | null | undefined): HarnessRevisionKey {
  return typeof harnessId === "string" && harnessId && typeof revision === "number" && Number.isFinite(revision) ? `${harnessId}@${revision}` : HARNESS_UNKNOWN_REVISION;
}
