import { createHash, randomUUID } from "node:crypto";
import { createCompactionTransaction, type SessionEventCandidateV1, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { Context } from "./types.js";
import { contextEvents, latestContextEvent, type ContextSession } from "./supplements.js";
import { estimateContextTokens } from "./content-manifest.js";

export interface CompactionSession extends ContextSession {
  appendMany(events: readonly SessionEventCandidateV1[]): Promise<readonly SessionEventEnvelopeV1[]>;
}
export type CompactionRegion = { readonly start: number; readonly end: number };
export type CompactionResult = { readonly content: string; readonly metadata?: RuntimeV2JsonValue; readonly pathlist?: readonly string[] };
export type CompactionTrigger = "manual" | "auto";
/** What a committed compaction recorded on `compaction/end`. Tokens are absent when no request usage exists yet. */
export type CompactionOutcome = {
  readonly compactionId: string;
  readonly trigger: CompactionTrigger;
  readonly entryCount: number;
  readonly durationMs: number;
  readonly beforeTokens?: number;
  readonly afterTokens?: number;
};
export type CompactionObserver = {
  readonly onStarted?: (info: { readonly entryCount: number }) => void;
  readonly onFinished?: (outcome: CompactionOutcome) => void;
  readonly signal?: AbortSignal;
};
/** Input includes the disjoint cache-read/cache-write buckets exactly once. */
export type CompactionUsage = { readonly inputTokens: number; readonly outputTokens: number; readonly contextWindow: number | null };
export interface ContextCompactionStrategy {
  threshold?(contextWindow: number | null): number | null;
  shouldCompact(usage: CompactionUsage): boolean;
  select(context: Context): CompactionRegion | null;
  summarize(context: Context, region: CompactionRegion, signal?: AbortSignal): Promise<CompactionResult>;
}
export interface ContextCompactor {
  threshold?(contextWindow: number | null): number | null;
  compact(session: CompactionSession, observer?: CompactionObserver): Promise<boolean>;
  maybeCompact(session: CompactionSession, usage: CompactionUsage, observer?: CompactionObserver): Promise<boolean>;
}
export interface CompactionDisclosure {
  recover(session: CompactionSession): Promise<boolean | void>;
  prepare(session: CompactionSession, context: Context, region: CompactionRegion, result: CompactionResult, compactionId: string): Promise<void>;
  applied(session: CompactionSession, compactionId: string): Promise<void>;
}

/** The sole owner of summary commits. Strategies never mutate Session. */
export class ContextCompactionCoordinator implements ContextCompactor {
  private strategy?: ContextCompactionStrategy;
  private disclosure?: CompactionDisclosure;
  private readonly pending = new WeakMap<CompactionSession, Promise<unknown>>();

  register(strategy: ContextCompactionStrategy): () => void {
    if (this.strategy) throw new Error("A compaction strategy is already registered.");
    this.strategy = strategy;
    return () => { if (this.strategy === strategy) this.strategy = undefined; };
  }
  registerDisclosure(disclosure: CompactionDisclosure): () => void {
    if (this.disclosure) throw new Error("A disclosure strategy is already registered.");
    this.disclosure = disclosure;
    return () => { if (this.disclosure === disclosure) this.disclosure = undefined; };
  }
  withStrategy(strategy: ContextCompactionStrategy): ContextCompactor {
    return { threshold: capacity => strategy.threshold?.(capacity) ?? null, compact: (session, observer) => this.perform(session, strategy, observer, { trigger: "manual" }), maybeCompact: (session, usage, observer) => strategy.shouldCompact(usage) ? this.perform(session, strategy, observer, { trigger: "auto", usage }) : Promise.resolve(false) };
  }
  threshold(capacity: number | null): number | null { return this.strategy?.threshold?.(capacity) ?? null; }
  async maybeCompact(session: CompactionSession, usage: CompactionUsage, observer?: CompactionObserver): Promise<boolean> {
    return this.strategy?.shouldCompact(usage) ? this.perform(session, this.strategy, observer, { trigger: "auto", usage }) : false;
  }
  async compact(session: CompactionSession, observer?: CompactionObserver): Promise<boolean> {
    if (!this.strategy) throw new Error("Context compaction capability is unavailable.");
    return this.perform(session, this.strategy, observer, { trigger: "manual" });
  }
  private perform(session: CompactionSession, strategy: ContextCompactionStrategy, observer: CompactionObserver | undefined, cause: { readonly trigger: CompactionTrigger; readonly usage?: CompactionUsage }): Promise<boolean> {
    const previous = this.pending.get(session) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (await this.disclosure?.recover(session)) return true;
      observer?.signal?.throwIfAborted();
      const surface = session.journal.surface;
      const context: Context = { request: { sessionId: session.header.sessionId, requestId: `compaction:${randomUUID()}`, routeId: "utility", model: "default", options: {} },
        content: { system: { sections: [], modelFacts: [] }, conversation: surface, supplements: [], tools: [] },
        status: { throughJournalSeq: session.lastSeq, cycle: 0, paths: [], facts: [], plugins: { "actspace.context.compaction": { summaryIds: surface.entries.flatMap(entry => { const seq = entry.sourceEventSeqs.reduce((a, b) => Math.max(a, b), -1); const event = contextEvents(session, seq, seq + 1).next().value; return event?.surface?.kind === "replace" ? [entry.node.messageId] : []; }) } } },
      };
      const region = strategy.select(context);
      if (!region) return false;
      const started = Date.now();
      try { observer?.onStarted?.({ entryCount: region.end - region.start }); } catch { /* Progress observers cannot change durability. */ }
      await session.flush();
      const result = await strategy.summarize(context, region, observer?.signal);
      observer?.signal?.throwIfAborted();
      if (!result.content.trim()) throw new Error("Compaction returned an empty summary.");
      if (surface.replaceGeneration !== session.journal.surface.replaceGeneration || JSON.stringify(surface.entries) !== JSON.stringify(session.journal.surface.entries)) return false;
      const content: RuntimeV2JsonValue = result.metadata === undefined ? result.content : { text: result.content, metadata: result.metadata };
      const compactionId = randomUUID();
      await this.disclosure?.prepare(session, context, region, result, compactionId);
      if (surface.replaceGeneration !== session.journal.surface.replaceGeneration || JSON.stringify(surface.entries) !== JSON.stringify(session.journal.surface.entries)) return false;
      const durationMs = Math.max(0, Date.now() - started);
      const stats = { trigger: cause.trigger, ...compactionTokens(cause.usage ?? latestRequestUsage(session), surface.entries.slice(region.start, region.end).map(entry => entry.node.content), content) };
      const transaction = createCompactionTransaction({ surface, ...region, summary: { kind: "user", messageId: `compaction-${randomUUID()}`, content }, compactionId,
        contributorIds: ["core/compaction"], summaryDigest: createHash("sha256").update(JSON.stringify(content)).digest("hex"), durationMs, stats });
      await session.appendMany(transaction);
      await session.flush();
      await this.disclosure?.applied(session, compactionId);
      try { observer?.onFinished?.({ compactionId, entryCount: region.end - region.start, durationMs, ...stats }); } catch { /* Progress observers cannot change durability. */ }
      return true;
    });
    const settled = next.catch(() => {});
    this.pending.set(session, settled);
    void settled.then(() => { if (this.pending.get(session) === settled) this.pending.delete(session); });
    return next;
  }
}

/** Measured context size of the latest request (input incl. cache buckets, plus output); null before any request. */
function latestRequestUsage(session: ContextSession): CompactionUsage | null {
  const usage = latestContextEvent(session, "assistant/message")?.data;
  const record = usage !== null && typeof usage === "object" && !Array.isArray(usage) ? (usage as Record<string, unknown>).usage : undefined;
  if (record === null || typeof record !== "object" || Array.isArray(record)) return null;
  const value = (key: string) => { const number = (record as Record<string, unknown>)[key]; return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : 0; };
  const inputTokens = value("inputTokens") + value("cacheReadTokens") + value("cacheWriteTokens");
  const outputTokens = value("outputTokens");
  return inputTokens + outputTokens > 0 ? { inputTokens, outputTokens, contextWindow: null } : null;
}

/** Before is measured; after swaps the replaced entries' estimate for the summary's, so it is available at commit time. */
function compactionTokens(usage: CompactionUsage | null, replaced: readonly unknown[], summary: unknown): { beforeTokens?: number; afterTokens?: number } {
  if (usage === null) return {};
  const beforeTokens = usage.inputTokens + usage.outputTokens;
  const removed = replaced.reduce<number>((sum, value) => sum + estimateContextTokens(value), 0);
  return { beforeTokens, afterTokens: Math.max(0, beforeTokens - removed + estimateContextTokens(summary)) };
}
