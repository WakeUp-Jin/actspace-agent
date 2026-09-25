import { createHash, randomUUID } from "node:crypto";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { createCompactionTransaction } from "@actspace/session-journal";
import type { SessionHandle } from "@actspace/session-persistence";
import { chooseCompactionRegion } from "./region.js";
import type { CompactionPolicy, TokenUsage } from "./policy.js";
import { shouldCompact } from "./policy.js";
import type { CompactionSummarizer } from "./summarizer.js";
import { Service } from "@actspace/cordis-adapter";
import type { CordisContext, CordisServiceContext } from "@actspace/cordis-adapter";
import type { LlmService } from "@actspace/llm-service";
import { DEFAULT_COMPACTION_POLICY } from "./policy.js";
import { LlmCompactionSummarizer } from "./summarizer.js";

export type CompactionPluginConfig = { readonly routeId?: string; readonly model?: string };

/** Cordis owner for compaction policy and summarizer resources. */
export class CompactionService extends Service {
  static inject = Object.freeze(["llm.service"]);
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
    const routeId = config.routeId ?? llm.routes.list()[0]?.routeId;
    if (routeId === undefined) throw new Error("Compaction Service requires an active LLM route.");
    this.runtime = new CompactionPlugin(DEFAULT_COMPACTION_POLICY, new LlmCompactionSummarizer({ llm, routeId, model: config.model ?? "default" }));
    ctx.effect(() => () => undefined, "compaction.runtime");
  }

  maybeCompact(session: SessionHandle, usage: TokenUsage): Promise<boolean> { return this.runtime.maybeCompact(session, usage); }
  compact(session: SessionHandle): Promise<boolean> { return this.runtime.compact(session); }
}

export function apply(ctx: CordisContext, config: CompactionPluginConfig = {}): void {
  const service = new CompactionService(ctx as never, config);
  ctx.provide?.("compaction.surface", Object.freeze({ CompactionPlugin, CompactionService, service: service.runtime, runtime: service }));
}

export class CompactionPlugin {
  constructor(
    private readonly policy: CompactionPolicy,
    private readonly summarizer: CompactionSummarizer,
    private readonly triggerRatioResolver?: () => number,
  ) {}

  withTriggerRatio(triggerRatio: number | (() => number)): CompactionPlugin {
    const resolver = typeof triggerRatio === "function" ? triggerRatio : () => triggerRatio;
    return new CompactionPlugin(this.policy, this.summarizer, resolver);
  }

  async maybeCompact(session: SessionHandle, usage: TokenUsage): Promise<boolean> {
    let resolved: number | undefined;
    try { resolved = this.triggerRatioResolver?.(); } catch { resolved = undefined; }
    const triggerRatio = typeof resolved === "number" && Number.isFinite(resolved) && resolved > 0 && resolved <= 1
      ? resolved
      : this.policy.triggerRatio;
    if (!shouldCompact(usage, { ...this.policy, triggerRatio })) return false;
    return this.compact(session);
  }

  async compact(session: SessionHandle): Promise<boolean> {
    const region = chooseCompactionRegion(session.projection.surface, this.policy);
    if (region === null) return false;
    const entries = session.projection.surface.entries.slice(region.start, region.end);
    await session.flush();
    const summary = await this.summarizer.summarize(entries, { sessionId: session.header.sessionId });
    const content: RuntimeV2JsonValue = summary.metadata === undefined ? summary.content : { text: summary.content, metadata: summary.metadata };
    const transaction = createCompactionTransaction({
      surface: session.projection.surface,
      start: region.start,
      end: region.end,
      summary: { kind: "user", messageId: `compaction-${randomUUID()}`, content },
      compactionId: randomUUID(),
      contributorIds: ["core/compaction"],
      summaryDigest: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
    });
    await session.appendMany(transaction);
    await session.flush();
    return true;
  }
}

export function activate() {
  return { services: { "compaction.surface": Object.freeze({ CompactionPlugin, CompactionService }) }, dispose: () => undefined };
}
