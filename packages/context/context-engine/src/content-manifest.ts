import type { ContextContentManifest, DescribedContextEntry } from "@actspace/shared";
import { ESTIMATOR_VERSION, contextSummaryKeys, describeConversationEntries, describeStaticContextEntries, sumContextBuckets } from "@actspace/shared";
import type { Context } from "./types.js";

export { contextEntryKey, contextText } from "@actspace/shared";
export const CONTEXT_ESTIMATOR_VERSION = ESTIMATOR_VERSION;

/** 引擎实例的全部明细：分类与估算来自 @actspace/shared 的唯一定义，这里只补预览与全文。 */
export function describeContextContent(context: Context): { manifest: ContextContentManifest; text: ReadonlyMap<string, string> } {
  const items: DescribedContextEntry[] = [
    ...describeStaticContextEntries({ ...context.content.system, tools: context.content.tools, supplements: context.content.supplements }),
    ...describeConversationEntries(context.content.conversation.entries.map(entry => entry.node), contextSummaryKeys(context.status.plugins["actspace.context.compaction"])),
  ];
  const texts = new Map<string, string>();
  const entries = items.map(({ entry, text }) => {
    const previewable = entry.bucket !== "conversation";
    const browseable = previewable && entry.bucket !== "summarizedConversation";
    if (browseable) texts.set(entry.key, text);
    return { ...entry, ...(previewable ? { preview: text.slice(0, 600) } : {}), ...(browseable ? { fullTextAvailable: true } : {}) };
  });
  return { manifest: { schemaVersion: 1, estimatorVersion: CONTEXT_ESTIMATOR_VERSION, comparable: true, totalEstimatedTokens: entries.reduce((sum, entry) => sum + entry.estimatedTokens, 0), buckets: sumContextBuckets(entries), entries }, text: texts };
}
