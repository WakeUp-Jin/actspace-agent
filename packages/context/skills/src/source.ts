import type { CordisContext } from "@actspace/cordis-adapter";
import type { ContextSource } from "@actspace/context-engine";
import { contribute, publish, promptSourceKey, type SourceOptions } from "@actspace/prompt/source-support";
export function createSkillsSource(options: SourceOptions): ContextSource {
  return { id: "context-skills", owner: "actspace.context-skills", order: 30, criticality: "required", fields: ["system"],
    cacheKey: promptSourceKey,
    get: (context, write) => contribute(options, context, "actspace.context-skills", item => item.id === "core/skills-catalog" || item.id === "core/selected-skills", write) };
}
export function apply(ctx: CordisContext): void { publish(ctx, "skills", createSkillsSource); }
