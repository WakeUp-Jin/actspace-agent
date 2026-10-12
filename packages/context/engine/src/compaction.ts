import { createHash, randomUUID } from "node:crypto";
import { createCompactionTransaction, type SessionEventCandidateV1, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { Context } from "./types.js";
import type { ContextSession } from "./supplements.js";

export interface CompactionSession extends ContextSession {
  appendMany(events: readonly SessionEventCandidateV1[]): Promise<readonly SessionEventEnvelopeV1[]>;
}
export type CompactionRegion = { readonly start: number; readonly end: number };
export type CompactionResult = { readonly content: string; readonly metadata?: RuntimeV2JsonValue; readonly pathlist?: readonly string[] };
export type CompactionObserver = { readonly onStarted?: (info: { readonly entryCount: number }) => void; readonly signal?: AbortSignal };
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
    return { threshold: capacity => strategy.threshold?.(capacity) ?? null, compact: (session, observer) => this.perform(session, strategy, observer), maybeCompact: (session, usage, observer) => strategy.shouldCompact(usage) ? this.perform(session, strategy, observer) : Promise.resolve(false) };
  }
  threshold(capacity: number | null): number | null { return this.strategy?.threshold?.(capacity) ?? null; }
  async maybeCompact(session: CompactionSession, usage: CompactionUsage, observer?: CompactionObserver): Promise<boolean> {
    return this.strategy?.shouldCompact(usage) ? this.perform(session, this.strategy, observer) : false;
  }
  async compact(session: CompactionSession, observer?: CompactionObserver): Promise<boolean> {
    if (!this.strategy) throw new Error("Context compaction capability is unavailable.");
    return this.perform(session, this.strategy, observer);
  }
  private perform(session: CompactionSession, strategy: ContextCompactionStrategy, observer?: CompactionObserver): Promise<boolean> {
    const previous = this.pending.get(session) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (await this.disclosure?.recover(session)) return true;
      observer?.signal?.throwIfAborted();
      const surface = session.journal.surface;
      const context: Context = { request: { sessionId: session.header.sessionId, requestId: `compaction:${randomUUID()}`, routeId: "utility", model: "default", options: {} },
        content: { system: { sections: [], modelFacts: [] }, conversation: surface, supplements: [], tools: [] },
        status: { throughJournalSeq: session.lastSeq, cycle: 0, paths: [], facts: [], plugins: { "actspace.context.compaction": { summaryIds: session.journal.events.filter(event => event.type === "surface/replaced" && event.surface?.kind === "replace").map(event => event.surface!.node.messageId) } } },
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
      const transaction = createCompactionTransaction({ surface, ...region, summary: { kind: "user", messageId: `compaction-${randomUUID()}`, content }, compactionId,
        contributorIds: ["core/compaction"], summaryDigest: createHash("sha256").update(JSON.stringify(content)).digest("hex"), durationMs: Math.max(0, Date.now() - started) });
      await session.appendMany(transaction);
      await session.flush();
      await this.disclosure?.applied(session, compactionId);
      return true;
    });
    const settled = next.catch(() => {});
    this.pending.set(session, settled);
    void settled.then(() => { if (this.pending.get(session) === settled) this.pending.delete(session); });
    return next;
  }
}
