/**
 * 上下文估算的日志折叠（规范 agent-spec-request-record.md §6.3）。
 *
 * 会话投影 `contextEstimate`、主进程 SQLite 历史、Harness 统计都用这一个折叠，不再读日志里存的估算数。
 * 状态大小只取决于系统提示词、工具、补充上下文的项数和压缩次数，不随消息数增长：
 * 对话只保存两个合计，逐条明细需要时用 `describeConversationEntries` 对当前对话现算（§6.3.2）。
 *
 * 状态是纯 JSON（投影注册表会冻结、checkpoint 会序列化）；可选字段不写 undefined。
 */
import type { ContextPanelBucketKey, ContextPanelEntry, ContextPanelModel } from "./context-panel";
import type { ContextState, ContextStateEntry, ContextUsageBucket, ContextUsageSnapshot } from "./session";
import { CONTEXT_BUCKET_REGISTRY } from "./context-buckets";
import { describeSupplementEntry, describeSystemEntries, describeToolEntries, estimateConversationNode, type ContextSurfaceNodeInput } from "./context-entries";
import { REQUEST_SYSTEM_PROMPT_EVENT, REQUEST_TOOLS_EVENT } from "./request-record";
import { ESTIMATOR_VERSION } from "./token-estimate";
import { surfaceNode, type SurfaceNodeSource } from "./runtime-v2/session-events";

export const CONTEXT_SUPPLEMENT_EVENT = "plugin/actspace.context/supplement";

/** 折叠需要的事件字段（日志信封的子集）。 */
export type ContextEstimateEvent = {
  readonly seq: number;
  readonly type: string;
  readonly time: string;
  readonly data: unknown;
  readonly surface?: unknown;
};

/** 一条补充上下文：投影按引擎的可见规则（supplements.ts）跟踪它何时消失。 */
export type ContextEstimateSupplement = {
  readonly owner: string;
  readonly id: string;
  readonly lifetime: "persistent" | "turn" | "request";
  readonly afterEventSeq: number;
  /** 只有 request 生命周期、已绑定到某个 step 时才有。 */
  readonly stepId?: string;
  readonly entry: ContextPanelEntry;
};

/** 当前对话里的压缩摘要：替换事件 seq → 摘要项 key。再被压缩时按 seq 删掉。 */
export type ContextEstimateSummary = { readonly seq: number; readonly messageId: string; readonly compactionId: string };

export type ContextEstimateState = {
  readonly schemaVersion: 1;
  readonly estimatorVersion: string;
  /** 最近一条 `request/system-prompt` 折出的系统提示词、规则、技能、模型事实。 */
  readonly prompt: readonly ContextPanelEntry[];
  /** 最近一条 `request/tools` 折出的工具。 */
  readonly tools: readonly ContextPanelEntry[];
  readonly supplements: readonly ContextEstimateSupplement[];
  readonly summaries: readonly ContextEstimateSummary[];
  readonly conversation: number;
  readonly summarizedConversation: number;
  readonly contextWindow: number | null;
  readonly model: ContextPanelModel | null;
  /** 最近一次请求；还没有请求时为 null。 */
  readonly requestId: string | null;
  /** 最近一次改变估算的事件。 */
  readonly throughJournalSeq: number;
  readonly updatedAt: string | null;
};

export type ContextEstimateBuckets = Readonly<Record<ContextPanelBucketKey, number>>;

/** 对外的估算：总数、六个分类、上下文窗口、非对话明细。 */
export type ContextEstimateView = {
  readonly schemaVersion: 1;
  readonly estimatorVersion: string;
  readonly totalEstimatedTokens: number;
  readonly buckets: ContextEstimateBuckets;
  readonly contextWindow: number | null;
  readonly model: ContextPanelModel | null;
  /** 0–100；窗口未知时为 0。 */
  readonly percentUsed: number;
  /** 非对话明细（系统提示词、规则、技能、工具、补充上下文），不含预览。 */
  readonly entries: readonly ContextPanelEntry[];
  /** 当前对话里的压缩摘要（messageId → 摘要项 key），对话明细现算时用。 */
  readonly summaries: readonly { readonly messageId: string; readonly compactionId: string }[];
  readonly requestId: string | null;
  readonly throughJournalSeq: number;
  readonly updatedAt: string | null;
};

export function initialContextEstimate(): ContextEstimateState {
  return { schemaVersion: 1, estimatorVersion: ESTIMATOR_VERSION, prompt: [], tools: [], supplements: [], summaries: [], conversation: 0, summarizedConversation: 0, contextWindow: null, model: null, requestId: null, throughJournalSeq: -1, updatedAt: null };
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const count = (value: unknown): number => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
const windowOf = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;

/** 只保留明细字段：预览、全文不进投影。 */
const entryOf = (entry: ContextPanelEntry): ContextPanelEntry => ({ key: entry.key, bucket: entry.bucket, title: entry.title, estimatedTokens: entry.estimatedTokens, ...(entry.source === undefined ? {} : { source: entry.source }) });

/** `request/system-prompt` 的数据 → 系统提示词各项。 */
export function describeRequestSystemPrompt(data: unknown): ContextPanelEntry[] {
  const value = record(data);
  const sections = array(value.sections).map(record).filter(section => typeof section.id === "string" && typeof section.owner === "string")
    .map(section => ({ id: section.id as string, owner: section.owner as string, order: typeof section.order === "number" ? section.order : 0, content: section.content }));
  const facts = array(value.modelFacts).map(record);
  return describeSystemEntries({
    sections,
    modelFacts: facts.map(fact => fact.content),
    modelFactSources: facts.map(fact => typeof fact.owner === "string" && typeof fact.id === "string" ? { owner: fact.owner, id: fact.id } : undefined),
  }).map(item => entryOf(item.entry));
}

/** `request/tools` 的数据 → 工具各项。 */
export function describeRequestTools(data: unknown): ContextPanelEntry[] {
  const tools = array(record(data).tools).map(record).filter(tool => typeof tool.name === "string") as unknown as { name: string; pluginId?: string }[];
  return describeToolEntries(tools).map(item => entryOf(item.entry));
}

function surfaceOf(event: ContextEstimateEvent): { kind: "append"; node: ContextSurfaceNodeInput } | { kind: "replace"; node: ContextSurfaceNodeInput; sourceEventSeqs: readonly number[] } | null {
  const surface = record(event.surface);
  // 节点从 data 推出，surface 只是标记（agent-spec-surface-derived.md §4.2）。
  const node = event.surface ? surfaceNode(event as unknown as SurfaceNodeSource) : null;
  if (!node) return null;
  const input = node as unknown as ContextSurfaceNodeInput;
  if (surface.kind === "append") return { kind: "append", node: input };
  if (surface.kind === "replace") return { kind: "replace", node: input, sourceEventSeqs: array(surface.sourceEventSeqs).filter((seq): seq is number => typeof seq === "number") };
  return null;
}

/**
 * 折叠一条事件。和估算无关的事件返回原状态（同一引用），投影注册表因此不重建、不推送。
 */
export function applyContextEstimate(state: ContextEstimateState, event: ContextEstimateEvent): ContextEstimateState {
  const changed = (next: Partial<ContextEstimateState>): ContextEstimateState => ({ ...state, ...next, throughJournalSeq: event.seq, updatedAt: event.time });
  const data = record(event.data);
  switch (event.type) {
    case REQUEST_SYSTEM_PROMPT_EVENT: return changed({ prompt: describeRequestSystemPrompt(data) });
    case REQUEST_TOOLS_EVENT: return changed({ tools: describeRequestTools(data) });
    case "request/header": {
      const requestId = text(data.requestId) ?? null;
      const contextWindow = windowOf(data.contextWindow) ?? state.contextWindow;
      return requestId === state.requestId && contextWindow === state.contextWindow ? state : changed({ requestId, contextWindow });
    }
    case "request/context": {
      const model = record(record(data.snapshot).contextModel);
      if (typeof model.modelKey !== "string") return state;
      const next: ContextPanelModel = { modelKey: model.modelKey, label: typeof model.label === "string" ? model.label : model.modelKey, contextWindow: windowOf(model.contextWindow), autoCompactAtTokens: windowOf(model.autoCompactAtTokens) };
      const prior = state.model;
      if (prior && prior.modelKey === next.modelKey && prior.label === next.label && prior.contextWindow === next.contextWindow && prior.autoCompactAtTokens === next.autoCompactAtTokens) return state;
      return changed({ model: next, contextWindow: next.contextWindow ?? state.contextWindow });
    }
    case CONTEXT_SUPPLEMENT_EVENT: return applySupplement(state, data, changed);
    case "step/end": {
      // request 生命周期的补充只对绑定的那个 step 可见。
      const stepId = text(data.stepId);
      const supplements = state.supplements.filter(value => !(value.lifetime === "request" && value.stepId !== undefined && value.stepId === stepId));
      return supplements.length === state.supplements.length ? state : changed({ supplements });
    }
    case "turn/end": {
      const supplements = state.supplements.filter(value => value.lifetime === "persistent");
      return supplements.length === state.supplements.length ? state : changed({ supplements });
    }
  }
  const surface = surfaceOf(event);
  if (!surface) return state;
  if (surface.kind === "append") {
    // 锚在空对话（-1）上的补充，一旦有了消息就不再可见（supplements.ts `retained`）。
    const supplements = state.supplements.some(value => value.afterEventSeq === -1) ? state.supplements.filter(value => value.afterEventSeq !== -1) : state.supplements;
    return changed({ conversation: state.conversation + estimateConversationNode(surface.node), supplements });
  }
  // 压缩替换：减去事件里记的被替换估算（§6.3.1），加上摘要节点。旧事件没有这两个数时按 0。
  const replaced = record(data.replacedTokens);
  const shadowed = new Set(surface.sourceEventSeqs);
  const compactionId = text(data.compactionId) ?? surface.node.messageId;
  return changed({
    conversation: Math.max(0, state.conversation - count(replaced.conversation)),
    summarizedConversation: Math.max(0, state.summarizedConversation - count(replaced.summarizedConversation)) + estimateConversationNode(surface.node, compactionId),
    summaries: [...state.summaries.filter(summary => !shadowed.has(summary.seq)), { seq: event.seq, messageId: surface.node.messageId, compactionId }],
    supplements: state.supplements.filter(value => !shadowed.has(value.afterEventSeq)),
  });
}

function applySupplement(state: ContextEstimateState, data: Record<string, unknown>, changed: (next: Partial<ContextEstimateState>) => ContextEstimateState): ContextEstimateState {
  const owner = text(data.owner); const id = text(data.id);
  if (!owner || !id) return state;
  const others = state.supplements.filter(value => value.owner !== owner || value.id !== id);
  if (data.op === "remove") return others.length === state.supplements.length ? state : changed({ supplements: others });
  if (data.op === "bind") {
    const stepId = text(data.stepId);
    if (!stepId) return state;
    return changed({ supplements: state.supplements.map(value => value.owner === owner && value.id === id && value.lifetime === "request" ? { ...value, stepId } : value) });
  }
  if (data.op !== "add" || typeof data.text !== "string") return state;
  const lifetime = data.lifetime === "turn" || data.lifetime === "request" ? data.lifetime : "persistent";
  const described = describeSupplementEntry({ owner, id, text: data.text });
  if (!described) return others.length === state.supplements.length ? state : changed({ supplements: others });
  const afterEventSeq = typeof data.afterEventSeq === "number" ? data.afterEventSeq : -1;
  return changed({ supplements: [...others, { owner, id, lifetime, afterEventSeq, entry: entryOf(described.entry) }] });
}

/** 依次折叠一段事件。 */
export function foldContextEstimate(events: Iterable<ContextEstimateEvent>, state = initialContextEstimate()): ContextEstimateState {
  for (const event of events) state = applyContextEstimate(state, event);
  return state;
}

/** 非对话明细：系统提示词、规则、技能、模型事实、工具、补充上下文。 */
export function contextEstimateEntries(state: ContextEstimateState): ContextPanelEntry[] {
  return [...state.prompt, ...state.tools, ...state.supplements.map(value => value.entry)];
}

export function contextEstimateBuckets(state: ContextEstimateState): ContextEstimateBuckets {
  const buckets = Object.fromEntries(CONTEXT_BUCKET_REGISTRY.map(bucket => [bucket.key, 0])) as Record<ContextPanelBucketKey, number>;
  for (const entry of contextEstimateEntries(state)) buckets[entry.bucket] += entry.estimatedTokens;
  buckets.conversation += state.conversation;
  buckets.summarizedConversation += state.summarizedConversation;
  return buckets;
}

/** 摘要节点 messageId → 摘要项 key，供对话明细现算时传给 `describeConversationEntries`。 */
export function contextEstimateSummaryKeys(state: Pick<ContextEstimateState, "summaries"> | Pick<ContextEstimateView, "summaries">): Map<string, string> {
  return new Map(state.summaries.map(summary => [summary.messageId, summary.compactionId]));
}

export function viewContextEstimate(state: ContextEstimateState): ContextEstimateView {
  const buckets = contextEstimateBuckets(state);
  const totalEstimatedTokens = Object.values(buckets).reduce((sum, value) => sum + value, 0);
  return {
    schemaVersion: 1, estimatorVersion: state.estimatorVersion, totalEstimatedTokens, buckets,
    contextWindow: state.contextWindow, model: state.model,
    percentUsed: state.contextWindow ? Math.min(100, totalEstimatedTokens / state.contextWindow * 100) : 0,
    entries: contextEstimateEntries(state), summaries: state.summaries.map(({ messageId, compactionId }) => ({ messageId, compactionId })), requestId: state.requestId, throughJournalSeq: state.throughJournalSeq, updatedAt: state.updatedAt,
  };
}

const STATE_KIND: Record<ContextPanelBucketKey, ContextStateEntry["kind"]> = {
  systemPrompt: "systemPrompt", tools: "toolDefinitions", rules: "rules", skills: "skills", summarizedConversation: "summarizedConversation", conversation: "conversation",
};

function usageBuckets(view: ContextEstimateView): ContextUsageBucket[] {
  return CONTEXT_BUCKET_REGISTRY.map(bucket => ({ key: bucket.key, name: bucket.key, label: bucket.label, tokens: view.buckets[bucket.key] }));
}

/** 输入框圆环、悬停预览、Web 百分比用的用量快照。累计用量、压缩次数来自会话快照。 */
export function contextEstimateUsage(view: ContextEstimateView, session?: { readonly usage: { readonly totalTokens: number; readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens: number; readonly cacheWriteTokens: number }; readonly activity: { readonly compactionCount: number } }): ContextUsageSnapshot {
  return {
    throughJournalSeq: view.throughJournalSeq, ...(view.requestId ? { requestId: view.requestId } : {}),
    totalTokens: view.totalEstimatedTokens, maxTokens: view.contextWindow ?? 0, percentUsed: view.percentUsed,
    estimator: { name: "context-estimate", version: view.estimatorVersion }, buckets: usageBuckets(view),
    ...(session ? { compressionCount: session.activity.compactionCount, cumulativeTokens: session.usage.totalTokens,
      cumulativeUsage: { inputTokens: session.usage.inputTokens, outputTokens: session.usage.outputTokens, cacheReadTokens: session.usage.cacheReadTokens, cacheWriteTokens: session.usage.cacheWriteTokens } } : {}),
  };
}

/** 弹窗、右侧面板沿用的 ContextState 形状；明细只有非对话项。 */
export function contextEstimateState(view: ContextEstimateView, sessionId: string): ContextState {
  return {
    sessionId, throughJournalSeq: view.throughJournalSeq, updatedAt: view.updatedAt ?? "", ...(view.requestId ? { requestId: view.requestId } : {}),
    estimator: { name: "context-estimate", version: view.estimatorVersion },
    totalEstimatedTokens: view.totalEstimatedTokens, maxTokens: view.contextWindow ?? 0, percentUsed: view.percentUsed,
    buckets: usageBuckets(view),
    entries: view.entries.map(entry => ({ id: entry.key, kind: STATE_KIND[entry.bucket], title: entry.title, estimatedTokens: entry.estimatedTokens, included: true })),
  };
}
