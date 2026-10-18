import type { CordisContext } from "@actspace/cordis-adapter";
import type { ContextSource } from "@actspace/context-engine";
import { contribute, publish, promptSourceKey, type SourceOptions } from "@actspace/prompt/source-support";
export function createRulesSource(options: SourceOptions): ContextSource {
  return { id: "context-rules", owner: "actspace.context-rules", order: 20, criticality: "required", fields: ["system"],
    cacheKey: promptSourceKey,
    get: (context, write) => contribute(options, context, "actspace.context-rules", item => item.id === "host/user-instructions" || item.id === "host/workspace-instructions", write) };
}
export function apply(ctx: CordisContext): void { publish(ctx, "rules", createRulesSource); }
