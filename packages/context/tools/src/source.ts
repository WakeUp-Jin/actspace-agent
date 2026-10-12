import type { CordisContext } from "@actspace/cordis-adapter";
import type { ContextSource } from "@actspace/context-engine";
export function createToolsSource(): ContextSource {
  return { id: "context-tools", owner: "actspace.context-tools", order: 50, criticality: "required", fields: ["tools"], get: (context, write) => write({ tools: context.content.tools }) };
}
export function apply(ctx: CordisContext): void { ctx.provide?.("context.source.tools", Object.freeze({ create: createToolsSource })); }
