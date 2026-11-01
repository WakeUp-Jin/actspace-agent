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
/**
 * What a committed compaction recorded on `compaction/end`. Tokens are absent when no measured baseline exists yet;
 * `beforeEstimated` marks a before count that includes estimates (content appended after the last measured request).
 */
export type CompactionOutcome = {
  readonly compactionId: string;
  readonly trigger: CompactionTrigger;
  readonly entryCount: number;
  readonly durationMs: number;
  readonly beforeTokens?: number;
  readonly afterTokens?: number;
  readonly beforeEstimated?: true;
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
    return { threshold: capacity => strategy.threshold?.(capacity) ?? null, compact: (session, observer) => this.perform(session, strategy, observer, "manual"), maybeCompact: (session, usage, observer) => strategy.shouldCompact(usage) ? this.perform(session, strategy, observer, "auto") : Promise.resolve(false) };
  }
  threshold(capacity: number | null): number | null { return this.strategy?.threshold?.(capacity) ?? null; }
  async maybeCompact(session: CompactionSession, usage: CompactionUsage, observer?: CompactionObserver): Promise<boolean> {
    return this.strategy?.shouldCompact(usage) ? this.perform(session, this.strategy, observer, "auto") : false;
  }
  async compact(session: CompactionSession, observer?: CompactionObserver): Promise<boolean> {
    if (!this.strategy) throw new Error("Context compaction capability is unavailable.");
    return this.perform(session, this.strategy, observer, "manual");
  }
  private perform(session: CompactionSession, strategy: ContextCompactionStrategy, observer: CompactionObserver | undefined, trigger: CompactionTrigger): Promise<boolean> {
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
      // The trigger's pressure value mixes estimates, so both manual and auto runs recount from the journal.
      const stats = { trigger, ...compactionTokens(session, surface.entries, region, content) };
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

/** The newest token count the journal can vouch for: a request's reported usage, or a later compaction's after count. */
function tokenBaseline(session: ContextSession): { readonly tokens: number; readonly seq: number; readonly estimated: boolean } | null {
  let request: { tokens: number; seq: number } | null = null;
  for (let event = latestContextEvent(session, "assistant/message"); event; event = latestContextEvent(session, "assistant/message", event.seq - 1)) {
    const tokens = requestTokens(event.data);
    if (tokens > 0) { request = { tokens, seq: event.seq }; break; }
  }
  const compaction = latestContextEvent(session, "compaction/end");
  if (compaction && compaction.seq > (request?.seq ?? -1)) {
    const after = record(compaction.data)?.afterTokens;
    return typeof after === "number" && Number.isFinite(after) && after >= 0 ? { tokens: after, seq: compaction.seq, estimated: true } : null;
  }
  return request && { ...request, estimated: false };
}

/** Measured context size of one request: input incl. cache buckets, plus output. Missing or unknown usage counts as 0. */
function requestTokens(data: unknown): number {
  const usage = record(record(data)?.usage);
  if (!usage) return 0;
  const value = (key: string) => { const number = usage[key]; return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : 0; };
  return value("inputTokens") + value("cacheReadTokens") + value("cacheWriteTokens") + value("outputTokens");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/**
 * Before = baseline + estimate of entries appended after it (tool results the model has not seen yet), flagged when
 * any estimate is included. After swaps the replaced entries' estimate for the summary's, so it is available at commit time.
 */
function compactionTokens(session: ContextSession, entries: ContextSession["journal"]["surface"]["entries"], region: CompactionRegion, summary: unknown): { beforeTokens?: number; afterTokens?: number; beforeEstimated?: true } {
  const baseline = tokenBaseline(session);
  if (baseline === null) return {};
  const appended = entries.filter(entry => entry.sourceEventSeqs.some(seq => seq > baseline.seq)).reduce((sum, entry) => sum + estimateContextTokens(entry.node.content), 0);
  const beforeTokens = baseline.tokens + appended;
  const removed = entries.slice(region.start, region.end).reduce((sum, entry) => sum + estimateContextTokens(entry.node.content), 0);
  return { beforeTokens, afterTokens: Math.max(0, beforeTokens - removed + estimateContextTokens(summary)), ...(baseline.estimated || appended > 0 ? { beforeEstimated: true as const } : {}) };
}
