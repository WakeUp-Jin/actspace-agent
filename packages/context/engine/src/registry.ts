import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { Context } from "./types.js";
import { freezeRequest } from "./request-snapshot.js";

type ContentField = keyof Context["content"];
export type ContextSource = {
  readonly id: string;
  readonly owner: string;
  readonly order: number;
  readonly criticality: "required" | "optional";
  readonly fields: readonly ContentField[];
  readonly get: (context: Context, contribute: (content: Partial<Context["content"]>) => void) => void | Promise<void>;
};

/** One registry per Agent scope; callbacks receive only detached read-only views. */
export class ContextSourceRegistry {
  constructor(private readonly requiredIds: readonly string[] = []) {}
  private readonly sources = new Map<string, ContextSource>();

  register(source: ContextSource): () => void {
    if (!source.id || !source.owner || !Number.isFinite(source.order)) throw new Error("Invalid context source identity.");
    if (this.sources.has(source.id)) throw new Error(`Duplicate context source ${source.id}.`);
    this.sources.set(source.id, Object.freeze({ ...source, fields: Object.freeze([...source.fields]) }));
    const registered = this.sources.get(source.id);
    return () => { if (this.sources.get(source.id) === registered) this.sources.delete(source.id); };
  }

  clear(): void { this.sources.clear(); }
  owners(): ReadonlySet<string> { return new Set([...this.sources.values()].map(source => source.owner)); }

  async apply(base: Context, extensions: readonly ContextSource[] = []): Promise<Context> {
    let current = immutable(base);
    const diagnostics: RuntimeV2JsonValue[] = [];
    let toolsProvided = false;
    const all = [...this.sources.values(), ...extensions];
    for (const id of this.requiredIds) if (!all.some(source => source.id === id)) throw new Error(`Required context source ${id} is unavailable.`);
    if (new Set(all.map(source => source.id)).size !== all.length) throw new Error("Duplicate context source extension.");
    for (const source of all.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
      let pending = current;
      let sourceTools = false;
      let open = true;
      try {
        await source.get(current, content => {
          if (!open) throw new Error(`Context source ${source.id} wrote after completion.`);
          for (const field of Object.keys(content)) if (!source.fields.includes(field as ContentField)) throw new Error(`Context source ${source.id} cannot write ${field}.`);
          for (const fact of content.system?.modelFactSources ?? []) if (fact.owner !== source.owner) throw new Error(`Context source ${source.id} cannot impersonate ${fact.owner}.`);
          for (const section of content.system?.sections ?? []) if (section.owner !== source.owner) throw new Error(`Context source ${source.id} cannot impersonate ${section.owner}.`);
          for (const supplement of content.supplements ?? []) if (supplement.owner !== source.owner) throw new Error(`Context source ${source.id} cannot impersonate ${supplement.owner}.`);
          if (content.tools !== undefined) sourceTools = true;
          pending = immutable({ ...pending, content: { ...pending.content, ...content,
            system: content.system ? { sections: [...pending.content.system.sections, ...content.system.sections], modelFacts: [...pending.content.system.modelFacts, ...content.system.modelFacts], modelFactSources: [...(pending.content.system.modelFactSources ?? pending.content.system.modelFacts.map((_, i) => ({ id: `unknown:${i}`, owner: "unknown" }))), ...(content.system.modelFactSources ?? content.system.modelFacts.map((_, i) => ({ id: `${source.id}:${i}`, owner: source.owner })))] } : pending.content.system,
            supplements: [...pending.content.supplements, ...(content.supplements ?? [])],
          } });
        });
        current = pending;
        toolsProvided ||= sourceTools;
        diagnostics.push({ contributorId: source.id, ownerPluginId: source.owner, order: source.order });
      } catch (error) {
        if (source.criticality === "required") throw new Error(`Required context source ${source.id} failed.`, { cause: error });
        diagnostics.push({ contributorId: source.id, ownerPluginId: source.owner, skipped: true, reason: "resolve-failed" });
      } finally { open = false; }
    }
    if (!toolsProvided && all.some(source => source.fields.includes("tools") || source.fields.includes("conversation"))) current = { ...current, content: { ...current.content, tools: [] } };
    return immutable({ ...current, status: { ...current.status, plugins: { ...current.status.plugins, "actspace.context.sources": diagnostics } } });
  }
}

function immutable(context: Context): Context { return freezeRequest(context as unknown as RuntimeV2JsonValue) as unknown as Context; }
