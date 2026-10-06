import type { CompactionSession } from "./compaction.js";
import { ContextSupplements, type ContextSession } from "./supplements.js";
import type { ContextSourceRegistry, ContextSource } from "./registry.js";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { Context, ContextRequest, LlmInput, ArtifactResolver } from "./types.js";
import { convertMessages, surfaceMessage } from "./conversion.js";
import { freezeRequest } from "./request-snapshot.js";
import { renderSystemPrompt } from "./system.js";

export type ContextEngineOptions = {
  readonly resolve: (request: ContextRequest) => Context | Promise<Context>;
  readonly disclosure?: { hydrate(context: Context, session: CompactionSession): Promise<Context> };
  readonly extensions?: () => readonly ContextSource[];
  readonly session?: ContextSession;
  readonly sources?: ContextSourceRegistry;
  readonly resolveArtifact?: ArtifactResolver;
};

export class ContextEngine {
  constructor(private readonly options: ContextEngineOptions) {}

  async getContext(request: ContextRequest): Promise<Context> {
    let base = await this.options.resolve(request);
    if (this.options.sources) base = { ...base, status: { ...base.status, plugins: { ...base.status.plugins, "actspace.context.owners": [...this.options.sources.owners(), ...(this.options.extensions?.() ?? []).map(source => source.owner)] } } };
    if (this.options.disclosure && this.options.session) base = await this.options.disclosure.hydrate(base, this.options.session as CompactionSession);
    let context = this.options.sources ? await this.options.sources.apply(base, this.options.extensions?.()) : base;
    if (context.request.sessionId !== request.sessionId || context.request.requestId !== request.requestId) throw new Error("Context identity does not match the request.");
    if (this.options.session && this.options.sources) {
      const supplements = new ContextSupplements(this.options.session);
      const owners = new Set([...this.options.sources.owners(), ...(this.options.extensions?.() ?? []).map(source => source.owner)]);
      for (const value of context.content.supplements) if (!value.text) await supplements.remove(value.owner, value.id); else await supplements.put({ op: "add", id: value.id, owner: value.owner, text: value.text, lifetime: "persistent", afterEventSeq: supplements.tailAnchor() });
      await supplements.refresh(owners);
      context = { ...context, content: { ...context.content, supplements: supplements.get(request, owners) }, status: { ...context.status, throughJournalSeq: this.options.session.lastSeq } };
    }
    return freezeRequest(context as unknown as RuntimeV2JsonValue) as unknown as Context;
  }

  async bindRequest(context: Context): Promise<void> {
    if (this.options.session) await new ContextSupplements(this.options.session).bind(context.request, context.content.supplements);
  }

  async insert(owner: string, id: string, text: string, lifetime: "turn" | "request", turnId: string): Promise<void> {
    if (!this.options.session || !this.options.sources?.owners().has(owner)) throw new Error("Context slot owner is not registered.");
    const supplements = new ContextSupplements(this.options.session);
    await supplements.put({ op: "add", owner, id, text, lifetime, turnId, afterEventSeq: supplements.tailAnchor() });
  }

  async remove(owner: string, id: string): Promise<void> {
    if (!this.options.session || !this.options.sources?.owners().has(owner)) throw new Error("Context slot owner is not registered.");
    await new ContextSupplements(this.options.session).remove(owner, id);
  }

  /** Conversion never writes Session or derives model-visible content from management state. */
  async toLlmInput(context: Context): Promise<LlmInput> {
    const sections = [...context.content.system.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const system = renderSystemPrompt(sections.map(section => section.content), context.content.system.modelFacts);
    const entries = context.content.conversation.entries;
    const insertions = new Map<number, typeof context.content.supplements[number][]>();
    for (const supplement of context.content.supplements) {
      let index = supplement.afterEventSeq === -1 ? -1 : entries.findIndex(entry => entry.sourceEventSeqs.includes(supplement.afterEventSeq));
      if (index < 0 && supplement.afterEventSeq !== -1) throw new Error(`Unknown supplement anchor ${supplement.afterEventSeq}.`);
      while (entries[index + 1]?.node.kind === "tool-result") index++;
      const group = insertions.get(index) ?? []; group.push(supplement); insertions.set(index, group);
    }
    const values: RuntimeV2JsonValue[] = [];
    const appendSupplements = (index: number) => {
      for (const supplement of (insertions.get(index) ?? []).sort((a, b) => a.sourceEventSeq - b.sourceEventSeq || a.id.localeCompare(b.id))) {
        values.push({ role: "user", content: `<runtime_context owner=${JSON.stringify(supplement.owner)} id=${JSON.stringify(supplement.id)}>\n${supplement.text}\n</runtime_context>` });
      }
    };
    appendSupplements(-1);
    entries.forEach((entry, index) => { values.push(surfaceMessage(entry.node)); appendSupplements(index); });
    const messages = await convertMessages(values, context.request.sessionId, this.options.resolveArtifact);
    return freezeRequest({ requestId: context.request.requestId, sessionId: context.request.sessionId, routeId: context.request.routeId, model: context.request.model, options: context.request.options, messages: [...(system ? [{ role: "system", content: system }] : []), ...messages], tools: context.content.tools } as unknown as RuntimeV2JsonValue) as unknown as LlmInput;
  }
}
