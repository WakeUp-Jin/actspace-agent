import type { CordisContext } from "@actspace/cordis-adapter";
import { contribute, publish, type SourceOptions } from "@actspace/prompt/source-support";
import type { ContextSource } from "@actspace/context-engine";
export function createSystemSource(options: SourceOptions): ContextSource {
  return { id: "context-system", owner: "actspace.context-system", order: 0, criticality: "required", fields: ["system"],
    get: async (context, write) => {
      const selected = options.prompt.selectSystem?.(context.request);
      if (selected !== undefined) write({ system: { sections: [{ id: "model-prompt", owner: "actspace.context-system", order: 0, content: selected }], modelFacts: [] } });
      else await contribute(options, context, "actspace.context-system", item => item.id === "core/identity" || item.id === "core/safety", write);
    } };
}
export function apply(ctx: CordisContext): void { publish(ctx, "system", createSystemSource); }
