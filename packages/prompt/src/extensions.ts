import type { ContextSource } from "@actspace/context-engine";

/** Host-owned registrations. Session registrations require an explicit main-Agent reader. */
export class PromptExtensionRegistry {
  private readonly entries = new Map<object, { sessionId: string; scopeId: string | null; source: ContextSource }>();
  registerMainSession(sessionId: string, source: ContextSource): () => void {
    if ([...this.entries.values()].some(value => value.sessionId === sessionId && value.source.id === source.id)) throw new Error(`Duplicate prompt extension ${source.id}.`);
    const key = {}; this.entries.set(key, { sessionId, scopeId: null, source });
    return () => { this.entries.delete(key); };
  }
  register(sessionId: string, scopeId: string, source: ContextSource): () => void {
    if (this.list(sessionId, scopeId).some(value => value.id === source.id)) throw new Error(`Duplicate prompt extension ${source.id}.`);
    const key = {}; this.entries.set(key, { sessionId, scopeId, source });
    return () => { this.entries.delete(key); };
  }
  list(sessionId: string, scopeId: string, agentKind?: "main" | "subagent"): readonly ContextSource[] {
    return [...this.entries.values()].filter(value => value.sessionId === sessionId && (value.scopeId === scopeId || (value.scopeId === null && agentKind === "main"))).map(value => value.source);
  }
}
