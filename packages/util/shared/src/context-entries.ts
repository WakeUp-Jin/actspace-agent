/**
 * 上下文估算明细的唯一定义（规范 agent-spec-request-record.md §6.2）：哪些内容算一项、属于哪个分类、key 是什么、估多少。
 *
 * 引擎（面板「当前」、自动压缩）和日志折叠（contextEstimate 投影、SQLite 历史、Harness 统计）都调用这里，
 * 两边的数字因此一定相同。只返回明细与原文，预览、全文由调用方决定是否保留。
 */
import type { ContextPanelBucketKey, ContextPanelEntry } from "./context-panel";
import { MESSAGE_OVERHEAD, estimateBlock, estimateContent, estimateItem, estimateMessage } from "./token-estimate";

export type ContextSystemSectionInput = { readonly id: string; readonly owner: string; readonly order: number; readonly content: unknown };
export type ContextModelFactSource = { readonly id: string; readonly owner: string };
export type ContextSupplementInput = { readonly id: string; readonly owner: string; readonly text: string };
export type ContextToolInput = { readonly name: string; readonly pluginId?: string };
export type ContextSurfaceNodeInput = { readonly kind: string; readonly messageId: string; readonly callId?: string; readonly content: unknown };

/** 一项明细与它的原文（预览、全文从原文截取）。 */
export type DescribedContextEntry = { readonly entry: ContextPanelEntry; readonly text: string };

const SKILLS_OWNER = "actspace.context-skills";
const SKILLS_CATALOG_ID = "core/skills-catalog";
const RULE_OWNERS = new Set(["actspace.context-rules", "rules"]);

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function contextText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

export const contextEntryKey = (...parts: string[]): string => JSON.stringify(parts);

/** 系统提示词的拼接方式；引擎拼请求、轨迹显示都用它。 */
export function renderSystemPrompt(systemSections: readonly unknown[], modelFacts: readonly unknown[]): string {
  const sections = systemSections.map(value => typeof value === "string" ? value.trim() : JSON.stringify(value)).filter(section => section.length > 0);
  if (modelFacts.length > 0) sections.push(`<runtime_facts>\n${JSON.stringify(modelFacts)}\n</runtime_facts>`);
  return sections.join("\n\n");
}

/** 补充上下文发给模型时的文本（一条 user 消息）。 */
export function renderContextSupplement(supplement: ContextSupplementInput): string {
  return `<runtime_context owner=${JSON.stringify(supplement.owner)} id=${JSON.stringify(supplement.id)}>\n${supplement.text}\n</runtime_context>`;
}

export function sortSystemSections<T extends ContextSystemSectionInput>(sections: readonly T[]): T[] {
  return [...sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

type EntryBase = Omit<ContextPanelEntry, "estimatedTokens">;
function described(entry: EntryBase, value: unknown, price: (value: unknown) => number): DescribedContextEntry | null {
  const text = contextText(value);
  if (!text) return null;
  return { entry: { ...entry, title: entry.title.slice(0, 80), estimatedTokens: price(value) }, text };
}
function push(list: DescribedContextEntry[], item: DescribedContextEntry | null): void { if (item) list.push(item); }

/** 系统提示词各段、规则、技能、模型事实。 */
export function describeSystemEntries(input: { readonly sections: readonly ContextSystemSectionInput[]; readonly modelFacts: readonly unknown[]; readonly modelFactSources?: readonly (ContextModelFactSource | undefined)[] }): DescribedContextEntry[] {
  const list: DescribedContextEntry[] = [];
  for (const section of sortSystemSections(input.sections)) {
    const bucket: ContextPanelBucketKey = RULE_OWNERS.has(section.owner) ? "rules" : section.owner === SKILLS_OWNER ? "skills" : "systemPrompt";
    if (bucket === "skills" && Array.isArray(section.content) && section.content.every(value => typeof record(value).id === "string")) {
      for (const value of section.content) push(list, described({ key: contextEntryKey("skill", section.owner, section.id, String(record(value).id)), bucket, title: String(record(value).id), source: section.owner }, value, estimateItem));
      continue;
    }
    // 来源段落的 plugin/id 本身就是稳定身份；技能调用与目录用插件给的不同段落 id。
    push(list, described({ key: contextEntryKey("section", section.owner, section.id), bucket, title: section.id, source: section.owner }, typeof section.content === "string" ? section.content.trim() : section.content, estimateItem));
  }
  if (input.modelFacts.length) {
    const unknown: unknown[] = [];
    input.modelFacts.forEach((fact, index) => {
      const source = input.modelFactSources?.[index];
      if (source?.owner === SKILLS_OWNER && source.id === SKILLS_CATALOG_ID && Array.isArray(fact) && fact.every(value => typeof record(value).id === "string")) {
        for (const value of fact) push(list, described({ key: contextEntryKey("skill", source.owner, source.id, String(record(value).id)), bucket: "skills", title: String(record(value).name ?? record(value).id), source: source.owner }, value, estimateItem));
      } else unknown.push(fact);
    });
    push(list, described({ key: contextEntryKey("model-facts"), bucket: "systemPrompt", title: "模型运行信息" }, renderSystemPrompt([], unknown.length ? unknown : [[]]), estimateItem));
  }
  return list;
}

export function describeToolEntries(tools: readonly ContextToolInput[]): DescribedContextEntry[] {
  const list: DescribedContextEntry[] = [];
  for (const tool of tools) push(list, described({ key: contextEntryKey("tool", String(tool.pluginId ?? "tools"), tool.name), bucket: "tools", title: tool.name }, tool, estimateItem));
  return list;
}

/** 补充上下文：每条是一条单独的 user 消息，按消息计价。 */
export function describeSupplementEntry(supplement: ContextSupplementInput): DescribedContextEntry | null {
  return described({ key: contextEntryKey("supplement", supplement.owner, supplement.id), bucket: "systemPrompt", title: supplement.id, source: supplement.owner }, renderContextSupplement(supplement), estimateMessage);
}

export function describeSupplementEntries(supplements: readonly ContextSupplementInput[]): DescribedContextEntry[] {
  const list: DescribedContextEntry[] = [];
  for (const supplement of supplements) push(list, describeSupplementEntry(supplement));
  return list;
}

/** 非对话项：投影只保存这一部分。 */
export function describeStaticContextEntries(input: {
  readonly sections: readonly ContextSystemSectionInput[];
  readonly modelFacts: readonly unknown[];
  readonly modelFactSources?: readonly (ContextModelFactSource | undefined)[];
  readonly tools: readonly ContextToolInput[];
  readonly supplements: readonly ContextSupplementInput[];
}): DescribedContextEntry[] {
  return [...describeSystemEntries(input), ...describeToolEntries(input.tools), ...describeSupplementEntries(input.supplements)];
}

/**
 * 一个对话节点的明细。`summaryKey` 不为空时，这个节点是压缩摘要，key 用它（compactionId，旧数据用 messageId）。
 * 助手消息拆成正文、思考、工具调用几项；消息开销只记一次，依次落在第一个存在的项上。
 */
export function describeConversationNode(node: ContextSurfaceNodeInput, summaryKey?: string): DescribedContextEntry[] {
  const list: DescribedContextEntry[] = [];
  const summary = summaryKey !== undefined;
  const bucket: ContextPanelBucketKey = summary ? "summarizedConversation" : "conversation";
  const trajectoryRef = node.kind === "tool-result" ? { callId: String(node.callId) } : { messageId: node.messageId };
  if (node.kind === "assistant" && Array.isArray(node.content)) {
    let overhead = MESSAGE_OVERHEAD;
    const once = () => { const value = overhead; overhead = 0; return value; };
    const normal = node.content.filter(part => !["reasoning", "tool-call"].includes(String(record(part).type)));
    if (normal.length) push(list, described({ bucket, trajectoryRef, key: contextEntryKey("message", node.messageId), kind: "assistant", title: "模型回复" }, normal, value => estimateContent(value) + once()));
    const thinking = node.content.filter(part => record(part).type === "reasoning");
    if (thinking.length) push(list, described({ bucket, trajectoryRef, key: contextEntryKey("thinking", node.messageId), kind: "thinking", title: "思考" }, thinking, value => estimateContent(value) + once()));
    for (const call of node.content.filter(part => record(part).type === "tool-call")) {
      const block = record(call);
      push(list, described({ bucket, key: contextEntryKey("tool-call", String(block.callId)), kind: "tool-call", title: String(block.name ?? "工具调用"), trajectoryRef: { callId: String(block.callId) } }, call, value => estimateBlock(value) + once()));
    }
    return list;
  }
  const kind = node.kind === "user" || node.kind === "assistant" || node.kind === "tool-result" ? node.kind : undefined;
  push(list, described({
    bucket, trajectoryRef,
    key: contextEntryKey(node.kind === "tool-result" ? "tool-result" : summary ? "summary" : "message", node.kind === "tool-result" ? String(node.callId) : summaryKey ?? node.messageId),
    ...(kind ? { kind } : {}),
    title: summary ? "压缩摘要" : node.kind === "user" ? "用户消息" : node.kind === "assistant" ? "模型回复" : "工具结果",
  }, node.content, estimateMessage));
  return list;
}

/** 一个对话节点的估算合计（投影折叠 surface append 时用）。 */
export function estimateConversationNode(node: ContextSurfaceNodeInput, summaryKey?: string): number {
  return describeConversationNode(node, summaryKey).reduce((sum, item) => sum + item.entry.estimatedTokens, 0);
}

export function describeConversationEntries(nodes: readonly ContextSurfaceNodeInput[], summaryKeys: ReadonlyMap<string, string>): DescribedContextEntry[] {
  return nodes.flatMap(node => describeConversationNode(node, summaryKeys.get(node.messageId)));
}

/**
 * 压缩插件状态里的摘要：messageId → 摘要项 key（compactionId；只有 summaryIds 的旧状态用 messageId）。
 */
export function contextSummaryKeys(compactionState: unknown): Map<string, string> {
  const state = record(compactionState);
  const keys = new Map<string, string>();
  for (const id of Array.isArray(state.summaryIds) ? state.summaryIds : []) if (typeof id === "string") keys.set(id, id);
  for (const value of Array.isArray(state.summaries) ? state.summaries : []) {
    const summary = record(value);
    if (typeof summary.messageId === "string" && typeof summary.compactionId === "string") keys.set(summary.messageId, summary.compactionId);
  }
  return keys;
}

export function sumContextBuckets(entries: readonly ContextPanelEntry[]): Partial<Record<ContextPanelBucketKey, number>> {
  const buckets: Partial<Record<ContextPanelBucketKey, number>> = {};
  for (const entry of entries) buckets[entry.bucket] = (buckets[entry.bucket] ?? 0) + entry.estimatedTokens;
  return buckets;
}
