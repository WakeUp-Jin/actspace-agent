import { ContextCompactionCoordinator, type Context, type CompactionRegion, type ContextCompactionStrategy } from "@actspace/context-engine";
import type { SessionHandle } from "@actspace/session-persistence";
import { chooseCompactionRegion } from "./region.js";
import type { CompactionPolicy, TokenUsage } from "./policy.js";
import { compactionThreshold } from "./policy.js";
import type { CompactionSummarizer } from "./summarizer.js";
import { Service } from "@actspace/cordis-adapter";
import type { CordisContext, CordisServiceContext } from "@actspace/cordis-adapter";
import type { LlmService } from "@actspace/llm-service";
import { DEFAULT_COMPACTION_POLICY } from "./policy.js";
import { LlmCompactionSummarizer } from "./summarizer.js";

export type CompactionPluginConfig = { readonly routeId?: string; readonly model?: string };
/** Notified once a region is chosen and summarizing is about to start; skipped compactions never notify. */
export type CompactionObserver = import("@actspace/context-engine").CompactionObserver;

/** Cordis owner for compaction policy and summarizer resources. */
export class CompactionService extends Service {
  static inject = Object.freeze(["llm.service", "context.engine"]);
  static Config = {
    "~standard": {
      version: 1,
      vendor: "actspace",
      validate(value: unknown) {
        if (value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value))) return { value: value ?? {} };
        return { issues: [{ message: "Compaction config must be an object." }] };
      },
    },
  };

  readonly runtime: CompactionPlugin;

  constructor(ctx: CordisServiceContext, config: CompactionPluginConfig = {}) {
    super(ctx, "compaction.runtime");
    const llmValue = ctx.get("llm.service") as (LlmService & { readonly runtime?: LlmService }) | undefined;
    if (llmValue === undefined) throw new Error("Compaction Service requires llm.service.");
    const llm = llmValue.runtime ?? llmValue;
    const routes = llm.routes.list();
    const routeId = config.routeId ?? routes.find(route => route.routeId === "utility")?.routeId ?? routes[0]?.routeId;
    if (routeId === undefined) throw new Error("Compaction Service requires an active LLM route.");
    this.runtime = new CompactionPlugin(DEFAULT_COMPACTION_POLICY, new LlmCompactionSummarizer({ llm, routeId, model: config.model ?? "default" }));
  }

  withTriggerRatio(triggerRatio: number | (() => number)): CompactionPlugin { return this.runtime.withTriggerRatio(triggerRatio); }
  maybeCompact(session: SessionHandle, usage: TokenUsage, observer?: CompactionObserver): Promise<boolean> { return this.runtime.maybeCompact(session, usage, observer); }
  compact(session: SessionHandle, observer?: CompactionObserver): Promise<boolean> { return this.runtime.compact(session, observer); }
}

export function apply(ctx: CordisContext, config: CompactionPluginConfig = {}): void {
  const service = new CompactionService(ctx as never, config);
  const engine = ctx.get?.("context.engine") as { compaction: ContextCompactionCoordinator } | undefined;
  if (!engine) throw new Error("Compaction requires context.engine.");
  const remove = engine.compaction.register(service.runtime);
  ctx.effect?.(() => remove);
  ctx.provide?.("compaction.surface", Object.freeze({ CompactionPlugin, CompactionService, service: service.runtime, runtime: service }));
}

export class CompactionPlugin implements ContextCompactionStrategy {
  private readonly coordinator = new ContextCompactionCoordinator();
  constructor(
    private readonly policy: CompactionPolicy,
    private readonly summarizer: CompactionSummarizer,
    private readonly triggerRatioResolver?: () => number,
  ) {}

  withTriggerRatio(triggerRatio: number | (() => number)): CompactionPlugin {
    const resolver = typeof triggerRatio === "function" ? triggerRatio : () => triggerRatio;
    return new CompactionPlugin(this.policy, this.summarizer, resolver);
  }

  threshold(capacity: number | null): number | null {
    let resolved: number | undefined;
    try { resolved = this.triggerRatioResolver?.(); } catch { resolved = undefined; }
    const triggerRatio = typeof resolved === "number" && Number.isFinite(resolved) && resolved > 0 && resolved <= 1 ? resolved : this.policy.triggerRatio;
    return compactionThreshold(capacity, { ...this.policy, triggerRatio });
  }
  shouldCompact(usage: TokenUsage): boolean { const threshold = this.threshold(usage.contextWindow); return threshold !== null && usage.inputTokens + usage.outputTokens >= threshold; }
  select(context: Context): CompactionRegion | null { return chooseCompactionRegion(context.content.conversation, this.policy); }
  summarize(context: Context, region: CompactionRegion, signal?: AbortSignal) {
    const summaryIds = (context.status.plugins["actspace.context.compaction"] as { summaryIds?: string[] } | undefined)?.summaryIds ?? [];
    return this.summarizer.summarize(context.content.conversation.entries.slice(region.start, region.end), { sessionId: context.request.sessionId, turnId: context.request.turnId, summaryIds, signal });
  }
  // Compatibility for direct package callers; production uses the Harness engine coordinator.
  async maybeCompact(session: SessionHandle, usage: TokenUsage, observer?: CompactionObserver): Promise<boolean> {
    return this.shouldCompact(usage) ? this.compact(session, observer) : false;
  }
  async compact(session: SessionHandle, observer?: CompactionObserver): Promise<boolean> {
    return this.coordinator.withStrategy(this).compact(session, observer);
  }
}
