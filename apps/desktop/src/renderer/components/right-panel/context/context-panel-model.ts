import { CONTEXT_BUCKET_REGISTRY, getContextBucketDisplay, type ContextPanelBucketKey, type ContextPanelConversationKind, type ContextPanelEntry, type ContextPanelTrendPoint, type ContextPanelUsage, type ContextPanelView, type ContextState, type ContextStateEntry } from "@actspace/shared";
import type { RuntimeV2SessionActivity, RuntimeV2UsageSummary } from "@actspace/shared/runtime-v2";

/**
 * Context 面板的纯数据逻辑（见 `front-右侧面板与文件渲染规范.md`「Context 面板」）。
 * `source: "interim"` 表示后端 `describeContextPanel` 还没实现，视图由 describeContext + 会话 projection 拼成：
 * 没有对比基准、趋势和事件，会话条目也没有子类型和轨迹身份。
 */
export type ContextPanelData = { view: ContextPanelView; source: "backend" | "interim" };

const STATE_KIND_TO_BUCKET: Record<ContextStateEntry["kind"], ContextPanelBucketKey> = {
  systemPrompt: "systemPrompt",
  toolDefinitions: "tools",
  rules: "rules",
  skills: "skills",
  summarizedConversation: "summarizedConversation",
  conversation: "conversation",
};

export function buildInterimPanelView(input: {
  sessionId: string;
  contextState: ContextState | null;
  activity: RuntimeV2SessionActivity | null;
  usage: RuntimeV2UsageSummary | null;
}): ContextPanelData {
  const { contextState, activity, usage } = input;
  const entries: ContextPanelEntry[] = (contextState?.entries ?? []).map((entry) => ({
    key: entry.id,
    bucket: STATE_KIND_TO_BUCKET[entry.kind] ?? "conversation",
    title: entry.title,
    estimatedTokens: entry.estimatedTokens,
    ...(entry.kind === "conversation" ? {} : { preview: entry.preview }),
  }));
  const buckets: ContextPanelView["current"]["buckets"] = {};
  for (const bucket of contextState?.buckets ?? []) {
    const key = bucket.key ?? bucket.name;
    if (key) buckets[key] = bucket.tokens;
  }
  const hasUsage = usage !== null && usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens > 0;
  return {
    source: "interim",
    view: {
      schemaVersion: 2,
      sessionId: input.sessionId,
      logicalAgentScopeId: "main",
      contextRevision: contextState?.throughJournalSeq ?? 0,
      throughJournalSeq: contextState?.throughJournalSeq ?? 0,
      model: contextState && contextState.maxTokens > 0
        ? { modelKey: "", label: "", contextWindow: contextState.maxTokens, autoCompactAtTokens: null }
        : null,
      current: {
        totalEstimatedTokens: contextState?.totalEstimatedTokens ?? 0,
        buckets,
        entries,
        status: contextState ? "ready" : "unavailable",
      },
      previous: null,
      stats: {
        turnCount: activity?.turnCount ?? 0,
        stepCount: activity?.stepCount ?? 0,
        compactionCount: activity?.compactionCount ?? 0,
        cumulativeUsage: hasUsage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens, cacheWriteTokens: usage.cacheWriteTokens } : null,
        costUsd: usage?.costUsd ?? null,
      },
      trend: [],
      events: [],
    },
  };
}

export type CategoryEntry = ContextPanelEntry & { isNew: boolean; tokenDelta: number; removed?: false };
export type RemovedEntry = { key: string; bucket: ContextPanelBucketKey; estimatedTokens: number; removed: true };

export type ContextCategory = {
  key: string;
  colorVar: string;
  totalTokens: number;
  entries: CategoryEntry[];
  /** 上次请求里有、本次没有；不对比或没有基准时为空。 */
  removed: RemovedEntry[];
  /** 不对比或没有基准时为 0。 */
  itemDelta: number;
  tokenDelta: number;
};

/** 按 registry 顺序列出分类；registry 之外的分类兜底排末尾。 */
export function buildCategories(view: ContextPanelView, options: { compare: boolean }): ContextCategory[] {
  const previous = options.compare && view.previous?.comparable !== false ? view.previous : null;
  const previousTokens = new Map(previous?.entries.map((entry) => [entry.key, entry.estimatedTokens]) ?? []);
  const currentKeys = new Set(view.current.entries.map((entry) => entry.key));
  const keys: string[] = CONTEXT_BUCKET_REGISTRY.map((bucket) => bucket.key);
  for (const entry of view.current.entries) if (!keys.includes(entry.bucket)) keys.push(entry.bucket);

  return keys.map((key) => {
    const entries: CategoryEntry[] = view.current.entries.filter((entry) => entry.bucket === key).map((entry) => {
      const before = previousTokens.get(entry.key);
      return { ...entry, isNew: previous !== null && before === undefined, tokenDelta: previous && before !== undefined ? entry.estimatedTokens - before : 0 };
    });
    const removed: RemovedEntry[] = (previous?.entries ?? [])
      .filter((entry) => entry.bucket === key && !currentKeys.has(entry.key))
      .map((entry) => ({ ...entry, removed: true }));
    const bucketTokens = view.current.buckets[key as ContextPanelBucketKey];
    const totalTokens = bucketTokens ?? entries.reduce((sum, entry) => sum + entry.estimatedTokens, 0);
    const previousTotal = previous ? previous.buckets[key as ContextPanelBucketKey] ?? 0 : totalTokens;
    const previousCount = previous ? previous.entries.filter((entry) => entry.bucket === key).length : entries.length;
    return {
      key,
      colorVar: getContextBucketDisplay(key).colorVar,
      totalTokens,
      entries,
      removed,
      itemDelta: entries.length - previousCount,
      tokenDelta: totalTokens - previousTotal,
    };
  });
}

export type ConversationFilter = "user" | "assistant" | "tool-call" | "tool-result";
export const CONVERSATION_FILTERS: readonly ConversationFilter[] = ["user", "assistant", "tool-call", "tool-result"];

/** 思考段归到「助手」筛选里。 */
export function conversationFilterOf(kind: ContextPanelConversationKind | undefined): ConversationFilter | null {
  if (!kind) return null;
  return kind === "thinking" ? "assistant" : kind;
}

/** 按类型过滤，最新在前（后端按上下文顺序返回，越靠后越新）。 */
export function conversationRows<T extends ContextPanelEntry>(entries: readonly T[], filters: readonly ConversationFilter[]): T[] {
  const kept = filters.length === 0 ? entries : entries.filter((entry) => {
    const filter = conversationFilterOf(entry.kind);
    return filter !== null && filters.includes(filter);
  });
  return [...kept].reverse();
}

/** 缓存读 ÷（缓存读 + 未命中输入）；没有输入时为 null。 */
export function cacheHitRate(usage: ContextPanelUsage | null): number | null {
  if (!usage) return null;
  const denominator = usage.cacheReadTokens + usage.inputTokens;
  return denominator > 0 ? usage.cacheReadTokens / denominator : null;
}

export function cumulativeTokens(usage: ContextPanelUsage | null): number | null {
  if (!usage) return null;
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

export type TrendColumn = {
  point: ContextPanelTrendPoint;
  /** 柱高占图表高度的比例。 */
  height: number;
  /** 柱内自下而上的分段，比例相对柱高。 */
  segments: { key: string; colorVar: string; share: number }[];
  /** 这根柱之前发生过压缩。 */
  compactedBefore: boolean;
};

export function trendLayout(points: readonly ContextPanelTrendPoint[]): TrendColumn[] {
  const peak = Math.max(0, ...points.map((point) => point.estimatedTokens));
  return points.map((point) => {
    const total = Object.values(point.buckets).reduce((sum, value) => sum + (value ?? 0), 0);
    const segments = CONTEXT_BUCKET_REGISTRY
      .map((bucket) => ({ key: bucket.key, colorVar: bucket.colorVar, share: total > 0 ? (point.buckets[bucket.key] ?? 0) / total : 0 }))
      .filter((segment) => segment.share > 0);
    return { point, height: peak > 0 ? point.estimatedTokens / peak : 0, segments, compactedBefore: point.compactedBefore !== undefined };
  });
}
