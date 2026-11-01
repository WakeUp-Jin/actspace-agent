import { contextEvents } from "./supplements.js";
import { contextEntryKey, rememberInputManifest } from "./content-manifest.js";
import type { CompactionSession } from "./compaction.js";
import { ContextSupplements, type ContextSession } from "./supplements.js";
import type { ContextSourceRegistry, ContextSource } from "./registry.js";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { Context, ContextRequest, LlmInput, ArtifactResolver, ContextInstanceSnapshot } from "./types.js";
import { ContextInstanceRegistry, contextIdentity } from "./instances.js";
import type { ContextReducerRegistry } from "./reducers.js";
import { projectContext } from "./projection.js";
import type { ContextProjection } from "./types.js";
import { convertMessages, surfaceMessage } from "./conversion.js";
import { freezeRequest } from "./request-snapshot.js";
import { freezeContextView } from "./context-snapshot.js";
import { renderSystemPrompt } from "./system.js";

export type ContextEngineOptions = {
  readonly resolve: (request: ContextRequest) => Context | Promise<Context>;
  readonly disclosure?: { hydrate(context: Context, session: CompactionSession): Promise<Context> };
  readonly extensions?: () => readonly ContextSource[];
  readonly session?: ContextSession;
  readonly sources?: ContextSourceRegistry;
  readonly resolveArtifact?: ArtifactResolver;
  /** Shared by the Harness so engine facades created per Step reuse Context instances. */
  readonly instances?: ContextInstanceRegistry;
  /** Fallback logical identity for callers that do not put it on the request. */
  readonly logicalAgentScopeId?: string;
  readonly reducers?: ContextReducerRegistry;
};

export class ContextEngine {
  readonly #instances: ContextInstanceRegistry;
  constructor(private readonly options: ContextEngineOptions) { this.#instances = options.instances ?? new ContextInstanceRegistry(); }

  async getContext(request: ContextRequest): Promise<Context> {
    const context = await this.#assemble(request);
    return this.#instances.commit(context, request.logicalAgentScopeId ?? this.options.logicalAgentScopeId);
  }

  /**
   * Replay accepted Session facts after their durability barrier. Reducers are
   * applied in registration order and can only replace their owned slices.
   */
  async reconcile(request: ContextRequest, throughJournalSeq = this.options.session?.lastSeq ?? -1): Promise<Context> {
    const session = this.options.session;
    if (session === undefined || this.options.reducers === undefined) return this.getContext(request);
    if (throughJournalSeq > session.lastSeq) throw new Error(`Cannot reconcile unknown Journal seq ${throughJournalSeq}.`);
    if (session.durableSeq !== undefined && session.durableSeq !== null && session.durableSeq < throughJournalSeq) throw new Error(`Context reconcile requires a durable Journal checkpoint at seq ${throughJournalSeq}.`);
    let context = await this.#assemble(request);
    const previous = this.#instances.get(request.sessionId, request.logicalAgentScopeId ?? this.options.logicalAgentScopeId);
    const from = previous?.view.status.throughJournalSeq ?? -1;
    if (previous !== undefined) context = this.options.reducers.restore(previous.view, context);
    for (const event of contextEvents(session, from + 1, throughJournalSeq + 1)) context = await this.options.reducers.apply(context, event);
    context = { ...context, status: { ...context.status, throughJournalSeq: throughJournalSeq } };
    const frozen = freezeContextView(context);
    return this.#instances.commit(frozen, request.logicalAgentScopeId ?? this.options.logicalAgentScopeId);
  }

  async #assemble(request: ContextRequest): Promise<Context> {
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
    return freezeContextView(context);
  }

  getInstance(request: ContextRequest): ContextInstanceSnapshot | undefined {
    return this.#instances.get(request.sessionId, request.logicalAgentScopeId ?? this.options.logicalAgentScopeId);
  }

  getProjection(request: ContextRequest, basis: ContextProjection["basis"] = "current-context"): ContextProjection | undefined {
    const instance = this.getInstance(request);
    return instance === undefined ? undefined : projectContext(instance.view, basis);
  }

  bind(request: ContextRequest): ContextInstanceSnapshot | undefined {
    return this.#instances.bind(request.sessionId, request.logicalAgentScopeId ?? this.options.logicalAgentScopeId);
  }

  release(request: ContextRequest): ContextInstanceSnapshot | undefined {
    return this.#instances.release(request.sessionId, request.logicalAgentScopeId ?? this.options.logicalAgentScopeId);
  }

  evict(request: ContextRequest): boolean {
    const identity = contextIdentity(request.sessionId, request.logicalAgentScopeId ?? this.options.logicalAgentScopeId);
    return this.#instances.evict(identity.sessionId, identity.logicalAgentScopeId);
  }

  async recordPrepared(context: Context, model: import("@actspace/shared").ContextPanelModel): Promise<Context> {
    return this.#instances.commit({ ...context, status: { ...context.status, requestModel: model } });
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
    const origins: { messageId?: string; supplementKey?: string }[] = [];
    const appendSupplements = (index: number) => {
      for (const supplement of (insertions.get(index) ?? []).sort((a, b) => a.sourceEventSeq - b.sourceEventSeq || a.id.localeCompare(b.id))) {
        origins.push({ supplementKey: contextEntryKey("supplement", supplement.owner, supplement.id) });
        values.push({ role: "user", content: `<runtime_context owner=${JSON.stringify(supplement.owner)} id=${JSON.stringify(supplement.id)}>\n${supplement.text}\n</runtime_context>` });
      }
    };
    appendSupplements(-1);
    entries.forEach((entry, index) => { origins.push({ messageId: entry.node.messageId }); values.push(surfaceMessage(entry.node)); appendSupplements(index); });
    const converted: { message: import("@actspace/llm-service").LlmMessage; origin: typeof origins[number] | null }[] = [];
    const messages = await convertMessages(values, context.request.sessionId, this.options.resolveArtifact, (message, index) => converted.push({ message, origin: index === null ? null : origins[index]! }));
    const input = freezeRequest({ requestId: context.request.requestId, sessionId: context.request.sessionId, routeId: context.request.routeId, model: context.request.model, options: context.request.options, messages: [...(system ? [{ role: "system", content: system }] : []), ...messages], tools: context.content.tools } as unknown as RuntimeV2JsonValue) as unknown as LlmInput;
    rememberInputManifest(context, input, converted);
    return input;
  }
}
