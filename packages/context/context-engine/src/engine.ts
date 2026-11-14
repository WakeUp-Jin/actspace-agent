import { contextEvents } from "./supplements.js";
import { renderContextSupplement, sortSystemSections } from "@actspace/shared";
import type { CompactionSession, ContextHydrator } from "./compaction.js";
import { ContextSupplements, type ContextSession } from "./supplements.js";
import type { ContextSourceRegistry, ContextSource } from "./registry.js";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { Context, ContextRequest, LlmInput, ArtifactResolver, ContextInstanceSnapshot } from "./types.js";
import { ContextInstanceRegistry, contextIdentity } from "./instances.js";
import type { ContextReducerRegistry } from "./reducers.js";
import { projectContext } from "./projection.js";
import type { ContextProjection } from "./types.js";
import { convertMessages, surfaceMessage } from "./conversion.js";
import { freezeRequest } from "./request-snapshot.js";
import { contextValue, freezeContextView, isCheckedContextValue } from "./context-snapshot.js";
import type { LlmMessage } from "@actspace/llm-service";
import { renderSystemPrompt } from "./system.js";

export type ContextEngineOptions = {
  readonly resolve: (request: ContextRequest) => Context | Promise<Context>;
  readonly disclosure?: ContextHydrator;
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
    const system = renderSystemPrompt(sortSystemSections(context.content.system.sections).map(section => section.content), context.content.system.modelFacts);
    const entries = context.content.conversation.entries;
    const insertions = new Map<number, typeof context.content.supplements[number][]>();
    for (const supplement of context.content.supplements) {
      let index = supplement.afterEventSeq === -1 ? -1 : entries.findIndex(entry => entry.sourceEventSeqs.includes(supplement.afterEventSeq));
      if (index < 0 && supplement.afterEventSeq !== -1) throw new Error(`Unknown supplement anchor ${supplement.afterEventSeq}.`);
      while (entries[index + 1]?.node.kind === "tool-result") index++;
      const group = insertions.get(index) ?? []; group.push(supplement); insertions.set(index, group);
    }
    const values: RuntimeJsonValue[] = [];
    const appendSupplements = (index: number) => {
      for (const supplement of (insertions.get(index) ?? []).sort((a, b) => a.sourceEventSeq - b.sourceEventSeq || a.id.localeCompare(b.id))) values.push({ role: "user", content: renderContextSupplement(supplement) });
    };
    appendSupplements(-1);
    entries.forEach((entry, index) => { values.push(surfaceMessage(entry.node)); appendSupplements(index); });
    const converted = await convertMessages(values, context.request.sessionId, this.options.resolveArtifact);
    const messages = [...(system ? [{ role: "system", content: system } as LlmMessage] : []), ...converted];
    // 不再整份序列化复制（agent-spec-context-trusted-surface.md §3.5）：消息由引擎新建，字段引用的是已检查、已冻结的
    // 对话节点、补充文字和系统提示词，外壳浅冻结即可。对话没经过日志或引擎检查（调用方直接传入的 Context）时，照旧整份检查、复制、冻结。
    const checked = isCheckedContextValue(context.content.conversation)
      ? Object.freeze(messages.map(freezeMessage))
      : freezeRequest(messages as unknown as RuntimeJsonValue) as unknown as readonly LlmMessage[];
    return Object.freeze({
      requestId: context.request.requestId, sessionId: context.request.sessionId, routeId: context.request.routeId, model: context.request.model,
      options: contextValue(context.request.options),
      messages: checked,
      tools: contextValue(context.content.tools),
    });
  }
}

/** 引擎新建的消息外壳、content 数组和块冻结；块里引用的对话数据已由日志冻结。 */
function freezeMessage(message: LlmMessage): LlmMessage {
  if (Array.isArray(message.content)) { for (const block of message.content) Object.freeze(block); Object.freeze(message.content); }
  return Object.freeze(message);
}
