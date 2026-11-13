import type {
  ModelPricingSnapshot,
  UsageActivityAggregate,
  UsageActivityRow,
  UsageActivitySnapshot,
  UsageStatisticsGetInput,
  UsageStatisticsRange,
} from "@actspace/shared";

/**
 * 浏览器 mock 下「使用统计」页的数据，取自已确认的 demo v4
 * （docs/design-docs/frontend/stats-redesign-demo.html，30 天口径）。
 * 时间范围按比例缩放；模型 / 提供商筛选只留对应模型；工作区筛选按 0.6 缩放。
 * `?mock=usage-stats` 直接打开到这个页面（见 components/harness-stats/dev-start.ts）。
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const RANGE_FACTOR: Record<UsageStatisticsRange, number> = { day: 0.04, week: 0.26, month: 1, total: 2.7 };

type ModelSeed = { model: string; provider: string; tok: number; cr: number; cw: number; out: number; think: number; cost: number; calls: number; fail: number; ttft: number; tps: number; rates: ModelPricingSnapshot["rates"] };
const MODELS: ModelSeed[] = [
  { model: "claude-opus-5-5", provider: "anthropic", tok: 214.6e6, cr: 171.2e6, cw: 14.1e6, out: 10.8e6, think: 3.9e6, cost: 131.2, calls: 1902, fail: 11, ttft: 2.4, tps: 58, rates: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { model: "claude-sonnet-5-5", provider: "anthropic", tok: 118.3e6, cr: 96.6e6, cw: 7.2e6, out: 5.9e6, think: 1.6e6, cost: 41.05, calls: 1398, fail: 7, ttft: 1.6, tps: 71, rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { model: "deepseek-v4", provider: "deepseek", tok: 29.1e6, cr: 18.9e6, cw: 2.4e6, out: 1.5e6, think: 0.6e6, cost: 8.9, calls: 390, fail: 4, ttft: 2.9, tps: 44, rates: { input: 0.6, output: 2.2, cacheRead: 0.06, cacheWrite: null } },
  { model: "claude-haiku-5-5", provider: "custom-relay", tok: 10.9e6, cr: 5.6e6, cw: 0.9e6, out: 0.4e6, think: 0.1e6, cost: 3.17, calls: 152, fail: 1, ttft: 0.9, tps: 112, rates: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 } },
];

const TOOLS = [
  ["bash", 3214, 171, 6.9, 41, 1200, { exit_nonzero: 142, timeout: 21, denied: 8 }],
  ["read_file", 463, 6, 0.1, 0.3, 2100, { not_found: 6 }],
  ["edit_file", 235, 9, 0.2, 0.5, 180, { no_match: 7, not_unique: 2 }],
  ["write_file", 67, 0, 0.1, 0.2, 40, {}],
  ["read_image", 56, 0, 3.4, 7.9, 620, {}],
  ["spawn_agent", 42, 2, 151, 420, 2100, { failed: 2 }],
  ["task_list", 34, 0, 0.05, 0.1, 210, {}],
  ["todo_write", 33, 0, 0.05, 0.1, 60, {}],
  ["grep", 28, 1, 0.4, 1.1, 900, { failed: 1 }],
  ["task_output", 18, 0, 0.1, 0.2, 1400, {}],
  ["web_fetch", 12, 3, 2.1, 6.4, 3800, { network: 2, timeout: 1 }],
  ["glob", 9, 0, 0.1, 0.2, 300, {}],
  ["web_search", 4, 0, 1.8, 2.4, 1100, {}],
  ["plugin_manager", 2, 1, 4.2, 6, 340, { failed: 1 }],
] as const;

const COMMANDS: [string, number, number, number, [string, number][]][] = [
  ["grep", 622, 41, 0.3, []], ["python3", 471, 38, 4.8, []], ["ls", 413, 3, 0.05, []], ["echo", 368, 0, 0.01, []], ["sed", 339, 7, 0.05, []],
  ["git", 214, 6, 0.4, [["status", 88], ["diff", 61], ["log", 33], ["commit", 18], ["push", 14]]],
  ["pnpm", 196, 39, 38, [["test", 97], ["build", 54], ["install", 21], ["typecheck", 24]]],
  ["cat", 145, 2, 0.02, []], ["node", 85, 9, 2.2, []], ["find", 72, 4, 0.6, []], ["curl", 41, 6, 1.9, []],
  ["gh", 23, 2, 1.4, [["pr", 15], ["api", 6], ["run", 2]]],
];

const SKILLS: [string, number, number, number, string[]][] = [
  ["baoyu-design", 3, 7, 1, ["SKILL.md", "references/palette.md", "templates/deck.html"]],
  ["meeting-task-agent", 1, 2, 5, ["SKILL.md", "prompts/summary.md"]],
  ["office-pptx", 1, 4, 9, ["SKILL.md", "scripts/build.py"]],
  ["office-xlsx", 1, 0, 17, ["SKILL.md"]],
  ["office-docx", 1, 0, 20, ["SKILL.md"]],
];

const SESSIONS = ["重构统计页", "侧边对话", "Bug 批次 1104", "性能第三轮"];

/** 确定的伪随机数，保证截图可复现。 */
function rng(seed: number) {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
}

const pad = (value: number) => String(value).padStart(2, "0");
const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function pricing(seed: ModelSeed): ModelPricingSnapshot {
  return { providerId: seed.provider, connectionId: null, modelKey: `${seed.provider}:${seed.model}`, apiModel: seed.model, currency: "USD", rates: seed.rates, multiplier: 1, source: "configured", contentHash: "mock", fetchedAt: "2026-11-01T00:00:00Z", capturedAt: "2026-11-01T00:00:00Z", unsupportedBilling: false };
}

function aggregate(key: string, label: string, providerId: string, seeds: ModelSeed[], f: number): UsageActivityAggregate {
  const sum = (pick: (seed: ModelSeed) => number) => Math.round(seeds.reduce((total, seed) => total + pick(seed), 0) * f);
  const calls = sum((seed) => seed.calls);
  const output = sum((seed) => seed.out);
  return {
    key, label, providerId, count: calls, errorCount: sum((seed) => seed.fail), unknownTokenRequestCount: 0, durationMs: sum((seed) => seed.calls * (seed.ttft + seed.out / seed.calls / seed.tps) * 1000),
    totalTokens: sum((seed) => seed.tok), inputTokens: sum((seed) => seed.tok - seed.cr - seed.cw - seed.out), outputTokens: output, cacheReadTokens: sum((seed) => seed.cr), cacheWriteTokens: sum((seed) => seed.cw), reasoningTokens: sum((seed) => seed.think),
    ttftMs: sum((seed) => seed.calls * seed.ttft * 1000), ttftSamples: calls, decodeMs: sum((seed) => (seed.out / seed.tps) * 1000), decodeTokens: output,
    costSummary: { costUsd: seeds.reduce((total, seed) => total + seed.cost, 0) * f, knownCostRequestCount: calls, unknownCostRequestCount: 0, unverifiedHistoricalRequestCount: 0 },
  };
}

function requestRows(models: ModelSeed[], count: number, now: number): UsageActivityRow[] {
  const random = rng(3);
  return Array.from({ length: count }, (_, index) => {
    const seed = models[Math.floor(random() * models.length)] ?? MODELS[0];
    const total = Math.round(18_000 + random() * 42_000);
    const cacheRead = index % 9 === 0 ? 0 : Math.round(total * (0.7 + random() * 0.15));
    const cacheWrite = index % 9 === 0 ? Math.round(total * 0.82) : index % 4 === 0 ? Math.round(total * 0.06) : 0;
    const output = Math.round(400 + random() * 2600);
    const input = Math.max(0, total - cacheRead - cacheWrite - output);
    const reasoning = Math.round(output * random() * 0.4);
    const rates = seed.rates;
    const cost = (cacheRead * (rates.cacheRead ?? 0) + cacheWrite * (rates.cacheWrite ?? rates.input ?? 0) + input * (rates.input ?? 0) + output * (rates.output ?? 0)) / 1e6;
    const ttftMs = Math.round(seed.ttft * (0.6 + random() * 0.8) * 1000);
    const decodeMs = Math.round((output / seed.tps) * 1000);
    const failed = random() < 0.04;
    const startedAt = new Date(now - index * 7 * 60_000 - 3 * 60_000).toISOString();
    const purpose = index % 11 === 5 ? "session-title" as const : undefined;
    return {
      activityId: `mock-${index}`, kind: "llm_request", sessionId: `mock-session-${index % SESSIONS.length}`, sessionTitle: SESSIONS[index % SESSIONS.length], agentRunId: "run", requestId: `req-${index}`,
      providerId: seed.provider, model: seed.model, startedAt, endedAt: startedAt, durationMs: ttftMs + decodeMs, ttftMs, decodeMs, ...(purpose ? { purpose } : {}),
      status: failed ? "error" : "success",
      tokens: failed ? { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, totalTokens: null } : { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, reasoningTokens: reasoning, totalTokens: total },
      costUsd: failed ? null : cost, costBasis: failed ? "unavailable" : "estimated", costAmount: failed ? null : cost, costCurrency: failed ? null : "USD",
      costProvenance: { version: 1, basis: failed ? "unknown" : "estimated", reason: null, pricingSnapshot: pricing(seed) },
      sourceEventSeq: index, relatedEventSeqs: [],
    } satisfies UsageActivityRow;
  });
}

function series(range: UsageStatisticsRange, totals: { tokens: number; cost: number; requests: number }, now: Date): UsageActivitySnapshot["series"] {
  const random = rng(7 + range.length);
  const unit = range === "day" ? "hour" : range === "total" ? "week" : "day";
  const n = range === "day" ? 24 : range === "week" ? 7 : range === "month" ? 30 : 14;
  const step = unit === "hour" ? HOUR_MS : unit === "day" ? DAY_MS : 7 * DAY_MS;
  const weights = Array.from({ length: n }, (_, index) => {
    const start = new Date(now.getTime() - (n - 1 - index) * step);
    const weekend = unit === "day" && (start.getDay() === 0 || start.getDay() === 6);
    const night = unit === "hour" && (start.getHours() < 9);
    return (0.35 + random() * 0.9) * (weekend || night ? 0.25 : 1) * (0.7 + index / (n * 2));
  });
  const sum = weights.reduce((total, value) => total + value, 0);
  const label = (date: Date) => (unit === "hour" ? `${localDay(date)} ${pad(date.getHours())}:00` : localDay(date));
  return {
    unit,
    firstAt: new Date(now.getTime() - (range === "total" ? 81 : range === "month" ? 30 : range === "week" ? 7 : 1) * DAY_MS).toISOString(),
    buckets: weights.map((weight, index) => {
      const share = weight / sum;
      return { start: label(new Date(now.getTime() - (n - 1 - index) * step)), tokens: totals.tokens * share, costUsd: totals.cost * share, requests: Math.round(totals.requests * share) };
    }),
  };
}

function heatmap(now: Date): UsageActivitySnapshot["heatmap"] {
  const random = rng(11);
  const days: NonNullable<UsageActivitySnapshot["heatmap"]>["days"] = [];
  for (let back = 97; back >= 0; back -= 1) {
    const date = new Date(now.getTime() - back * DAY_MS);
    const ramp = 0.35 + 0.65 * (97 - back) / 97;
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    if (random() >= (weekend ? 0.45 : 0.82) * ramp + 0.08) continue;
    const sessions = Math.round(random() ** 1.6 * 40 * ramp) + 1;
    days.push({ date: localDay(date), sessions, tokens: sessions * 310_000 });
  }
  return { days };
}

export function mockUsageActivity(input: UsageStatisticsGetInput = {}, nowValue: Date = new Date()): UsageActivitySnapshot {
  const range = input.range ?? "month";
  const models = MODELS.filter((seed) => (!input.model || seed.model === input.model) && (!input.providerId || seed.provider === input.providerId));
  const f = RANGE_FACTOR[range] * (input.workspaceRoot ? 0.6 : 1);
  const tf = f;
  const all = aggregate("all", "all", "", models, f);
  const providers = [...new Set(models.map((seed) => seed.provider))].map((provider) => aggregate(`${provider}/`, provider, provider, models.filter((seed) => seed.provider === provider), f));
  const modelRows = models.map((seed) => aggregate(`${seed.provider}//${seed.model}`, seed.model, seed.provider, [seed], f));
  const page = Math.max(1, input.requestRowsPage?.page ?? 1);
  const limit = input.requestRowsPage?.limit ?? 20;
  const totalRows = models.length ? Math.max(3, Math.round(all.count * 0.05)) : 0;
  const rows = requestRows(models, Math.min(totalRows, 200), nowValue.getTime()).slice((page - 1) * limit, page * limit);
  const scale = (value: number) => Math.round(value * tf);
  const failed = Math.round(models.reduce((total, seed) => total + seed.fail, 0) * f);
  return {
    schemaVersion: 1, scope: "global", sessionId: null, title: "使用统计", range, generatedAt: nowValue.toISOString(), sourceCount: 148, sourceWatermarks: [],
    readModel: { source: "sqlite", status: "ready" },
    summary: {
      activityCount: all.count, requestCount: all.count, failedRequestCount: failed, retryCount: scale(41), successCount: all.count - failed, errorCount: failed, abortedCount: 0, runningCount: 0, unknownCount: 0,
      inputTokens: all.inputTokens, outputTokens: all.outputTokens, cacheReadTokens: all.cacheReadTokens, cacheWriteTokens: all.cacheWriteTokens, reasoningTokens: all.reasoningTokens, totalTokens: all.totalTokens,
      unknownTokenRequestCounts: { input: failed, output: failed, cacheRead: failed, cacheWrite: failed, reasoning: failed, total: failed },
      costUsd: all.costSummary.costUsd, costUnavailableCount: 0,
    },
    costSummary: { ...all.costSummary, unknownCostRequestCount: scale(6) },
    aggregates: { providers, models: modelRows },
    timing: {
      ttftMs: all.ttftMs, ttftSamples: Math.max(0, all.count - scale(120)), decodeMs: all.decodeMs, decodeTokens: all.decodeTokens, untimedRequests: scale(120),
      toolMs: scale(22_320_000), toolSamples: scale(4400), approvalWaitMs: scale(2_460_000), approvalSamples: scale(312), auxiliaryMs: scale(1_080_000), auxiliaryCount: scale(240),
    },
    series: series(range, { tokens: all.totalTokens, cost: all.costSummary.costUsd, requests: all.count }, nowValue),
    heatmap: heatmap(nowValue),
    tools: TOOLS.map(([name, calls, failedCalls, avg, p95, output, codes]) => ({
      name, calls: scale(calls), failed: scale(failedCalls), failureCodes: Object.fromEntries(Object.entries(codes).map(([code, count]) => [code, scale(count)])),
      durationMs: scale(calls * avg * 1000), durationSamples: scale(calls), p95Ms: p95 * 1000, outputTokens: scale(calls * output), outputSamples: scale(calls),
    })).filter((tool) => tool.calls > 0),
    commands: COMMANDS.map(([program, calls, failedCalls, avg, subs]) => ({
      program, calls: scale(calls), failed: scale(failedCalls), durationMs: scale(calls * avg * 1000), durationSamples: scale(calls), subcommands: subs.map(([name, count]) => ({ name, calls: scale(count) })).filter((sub) => sub.calls > 0),
    })).filter((command) => command.calls > 0),
    skills: SKILLS.slice(0, range === "day" ? 1 : SKILLS.length).map(([skillId, reads, assets, daysAgo, files]) => ({
      skillId, skillReads: Math.max(1, Math.round(reads * Math.min(1, tf * 1.5))), assetReads: Math.round(assets * Math.min(1, tf * 1.5)), lastReadAt: new Date(nowValue.getTime() - daysAgo * DAY_MS).toISOString(), files,
    })),
    subagents: [
      { preset: "explore", calls: scale(28), failed: scale(1), durationMs: scale(28 * 102_000), durationSamples: scale(28), totalTokens: scale(11.4e6), costUsd: 5.9 * tf },
      { preset: "general", calls: scale(14), failed: scale(1), durationMs: scale(14 * 250_000), durationSamples: scale(14), totalTokens: scale(6.8e6), costUsd: 3.9 * tf },
    ].filter((row) => row.calls > 0),
    auxiliary: [
      { purpose: "session-title" as const, calls: scale(126), durationMs: scale(126 * 1800), totalTokens: scale(126 * 900), costUsd: 0.21 * tf },
      { purpose: "auto-review" as const, calls: scale(88), durationMs: scale(88 * 6200), totalTokens: scale(88 * 4200), costUsd: 0.52 * tf },
      { purpose: "compaction" as const, calls: scale(14), durationMs: scale(14 * 21_000), totalTokens: scale(14 * 38_000), costUsd: 0.31 * tf },
      { purpose: "image-inspection" as const, calls: scale(12), durationMs: scale(12 * 4300), totalTokens: scale(12 * 2600), costUsd: 0.08 * tf },
    ].filter((row) => row.calls > 0),
    filterOptions: { models: MODELS.map((seed) => seed.model), providers: [...new Set(MODELS.map((seed) => seed.provider))], workspaces: ["/Users/me/code/actspace-agent", "/Users/me/code/site", "/Users/me/notes"] },
    rows,
    rowsPage: { page, pageSize: limit, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / limit)) },
  };
}
