import type { CordisContext } from "@actspace/cordis-adapter";
import { ContextSourceRegistry, type CompactionSession, type ContextSource } from "@actspace/context-engine";
import type { SourceFactory, SourceOptions } from "@actspace/prompt";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { CONTEXT_ASSEMBLY_SERVICE_ID, DEFAULT_REQUIRED_CONTEXT_KINDS } from "./manifest.js";

export type ContextAgentRole = "main" | "subagent" | "fork";
export const CONTEXT_AGENT_ROLES: readonly ContextAgentRole[] = Object.freeze(["main", "subagent", "fork"]);

/** One context source as its plugin registers it: which agents receive it, and how to build it for one agent scope. */
export type ContextSourceRegistration = {
  readonly kind: string;
  /** Agents that receive this source; every role when omitted. */
  readonly roles?: readonly ContextAgentRole[];
  readonly create: SourceFactory["create"];
};
export type ContextToolResultObserver = (session: CompactionSession, event: SessionEventEnvelopeV1) => Promise<void> | void;

export type ContextAssemblyService = {
  /** Kinds every agent must receive; `sourcesFor` throws when one is not registered for the role. */
  readonly requiredKinds: readonly string[];
  register(registration: ContextSourceRegistration): () => void;
  /** Runs after each tool result is journaled; registrants turn results into context state. */
  registerToolResultObserver(observer: ContextToolResultObserver): () => void;
  /** Kinds an agent of `role` receives (every registered kind without a role). */
  kinds(role?: ContextAgentRole): readonly string[];
  /** The sources of one agent in a registry owned by its scope; disposing the scope clears it. */
  sourcesFor(role: ContextAgentRole, options: SourceOptions): ContextSourceRegistry;
  observeToolResult(session: CompactionSession, event: SessionEventEnvelopeV1): Promise<void>;
};

export class ContextAssembly implements ContextAssemblyService {
  readonly requiredKinds: readonly string[];
  private readonly registrations = new Map<string, ContextSourceRegistration>();
  private readonly observers = new Set<ContextToolResultObserver>();
  constructor(requiredKinds: readonly string[] = DEFAULT_REQUIRED_CONTEXT_KINDS) {
    this.requiredKinds = Object.freeze([...requiredKinds]);
  }
  register(registration: ContextSourceRegistration): () => void {
    if (!registration.kind) throw new Error("A context source registration needs a kind.");
    if (this.registrations.has(registration.kind)) throw new Error(`Duplicate context source ${registration.kind}.`);
    for (const role of registration.roles ?? []) if (!CONTEXT_AGENT_ROLES.includes(role)) throw new Error(`Unknown agent role ${role} for context source ${registration.kind}.`);
    const frozen = Object.freeze({ ...registration, ...(registration.roles ? { roles: Object.freeze([...registration.roles]) } : {}) });
    this.registrations.set(registration.kind, frozen);
    return () => { if (this.registrations.get(registration.kind) === frozen) this.registrations.delete(registration.kind); };
  }
  registerToolResultObserver(observer: ContextToolResultObserver): () => void {
    this.observers.add(observer);
    return () => { this.observers.delete(observer); };
  }
  kinds(role?: ContextAgentRole): readonly string[] {
    return this.select(role).map(registration => registration.kind);
  }
  sourcesFor(role: ContextAgentRole, options: SourceOptions): ContextSourceRegistry {
    const selected = this.select(role);
    for (const kind of this.requiredKinds) if (!selected.some(registration => registration.kind === kind)) throw new Error(`Required context source ${kind} is unavailable.`);
    const sources: { readonly kind: string; readonly source: ContextSource }[] = selected.map(registration => ({ kind: registration.kind, source: registration.create(options) }));
    const registry = new ContextSourceRegistry(sources.filter(item => this.requiredKinds.includes(item.kind)).map(item => item.source.id));
    for (const item of sources) options.scope.disposer.add(registry.register(item.source));
    options.scope.disposer.add(() => registry.clear());
    return registry;
  }
  async observeToolResult(session: CompactionSession, event: SessionEventEnvelopeV1): Promise<void> {
    for (const observer of [...this.observers]) await observer(session, event);
  }
  private select(role?: ContextAgentRole): readonly ContextSourceRegistration[] {
    return [...this.registrations.values()].filter(registration => role === undefined || !registration.roles || registration.roles.includes(role));
  }
}

/**
 * Register a source plugin's factory for the loop and publish it as `context.source.<kind>`, the plugin's declared service.
 * Both end with the plugin: the registration is removed and the service disposed.
 */
export function publish(ctx: CordisContext, kind: string, create: SourceFactory["create"], roles?: readonly ContextAgentRole[]): void {
  const assembly = ctx.get?.(CONTEXT_ASSEMBLY_SERVICE_ID) as ContextAssemblyService | undefined;
  if (!assembly) throw new Error(`Context source ${kind} requires ${CONTEXT_ASSEMBLY_SERVICE_ID}.`);
  const remove = assembly.register({ kind, create, ...(roles ? { roles } : {}) });
  ctx.effect?.(() => remove, `context.source.${kind}`);
  ctx.provide?.(`context.source.${kind}`, Object.freeze({ create }));
}

function requiredKinds(config: unknown): readonly string[] {
  const required = config && typeof config === "object" && !Array.isArray(config) ? (config as { required?: unknown }).required : undefined;
  if (required === undefined) return DEFAULT_REQUIRED_CONTEXT_KINDS;
  if (!Array.isArray(required) || !required.every(value => typeof value === "string" && value)) throw new Error("context-assembly config.required must be a list of source kinds.");
  return required;
}

/** Harness entry: the one registry the loop reads sources and tool-result observers from. */
export function apply(ctx: CordisContext, config?: unknown): void {
  ctx.provide?.(CONTEXT_ASSEMBLY_SERVICE_ID, new ContextAssembly(requiredKinds(config)));
}
