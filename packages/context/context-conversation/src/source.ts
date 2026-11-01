import type { CordisContext } from "@actspace/cordis-adapter";
import type { ContextSource } from "@actspace/context-engine";
export function createConversationSource(): ContextSource {
  return { id: "context-conversation", owner: "actspace.context-conversation", order: 40, criticality: "required", fields: ["conversation"], cacheKey: context => JSON.stringify(context.content.conversation), get: (context, write) => write({ conversation: context.content.conversation }) };
}
export function apply(ctx: CordisContext): void { ctx.provide?.("context.source.conversation", Object.freeze({ create: createConversationSource })); }
