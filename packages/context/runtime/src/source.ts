import type { CordisContext } from "@actspace/cordis-adapter";
import type { ContextSource } from "@actspace/context-engine";
import { contribute, publish, promptSourceKey, runtimeInfo, type SourceOptions } from "@actspace/prompt/source-support";
export function createRuntimeSource(options: SourceOptions): ContextSource {
  let turn: string | undefined; let date = "";
  return { id: "context-runtime", owner: "actspace.context-runtime", order: 10, criticality: "required", fields: ["system", "supplements"],
    cacheKey: promptSourceKey,
    get: async (context, write) => {
      await contribute(options, context, "actspace.context-runtime", item => item.kind === "model-fact" && item.id !== "core/skills-catalog", write);
      if (turn !== context.request.turnId || !date) { turn = context.request.turnId; date = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
      const text = `Current runtime state: mode=${runtimeInfo(context).mode}; date=${date}; timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}. A later runtime state supersedes this state.`;
      write({ supplements: [{ id: "runtime-state", owner: "actspace.context-runtime", text, sourceEventSeq: -1, afterEventSeq: -1 }] });
    } };
}
export function apply(ctx: CordisContext): void { publish(ctx, "runtime", createRuntimeSource); }
