import { Context as CordisContextClass, Service as CordisService } from "@deepseek-ai/cordis";
import type { Context as CordisServiceContext, Plugin as CordisPlugin } from "@deepseek-ai/cordis";
import { serviceId, type ServiceId } from "./identity.js";
import type { JsonValue } from "./plugin-contract.js";
import type { PluginManifest } from "./manifest.js";

/** The concrete Cordis context and Service base used by ActSpace providers. */
export { CordisContextClass, CordisService };
/** Short name used by domain packages when declaring a Cordis-owned class. */
export { CordisService as Service };
export type { CordisServiceContext, CordisPlugin };

/** Stable service names used by the current Cordis graph. */
export const ACTSPACE_SERVICE_IDS = Object.freeze({
  runtime: serviceId("actspace.runtime"),
  host: serviceId("actspace.host"),
  hostServices: serviceId("actspace.host.services"),
  hostPrompt: serviceId("actspace.host.prompt"),
  hostSession: serviceId("actspace.host.session"),
  hostSessionCodecs: serviceId("actspace.host.session.codecs"),
  hostLlm: serviceId("actspace.host.llm"),
  hostToolsCore: serviceId("actspace.host.tools.core"),
  hostAgent: serviceId("actspace.host.agent"),
  hostHeadless: serviceId("actspace.host.headless"),
  sessionJournal: serviceId("session.journal"),
  sessionPersistence: serviceId("session.persistence"),
  sessionJsonl: serviceId("session.jsonl"),
  sessionProjection: serviceId("session.projection"),
  /** Canonical live-log owner; session.runtime remains the host controller facade. */
  sessionStore: serviceId("session.store"),
  sessionRuntime: serviceId("session.runtime"),
  llmRuntime: serviceId("llm.service"),
  toolsRuntime: serviceId("tools.runtime"),
  toolsApproval: serviceId("tools.approval"),
  contextAssembler: serviceId("context.assembly"),
  systemPrompt: serviceId("prompt.runtime"),
  promptAssembly: serviceId("prompt.assembly"),
  compaction: serviceId("compaction.runtime"),
  coreTools: serviceId("tools.core"),
  browserTools: serviceId("tools.browser"),
  coreAgent: serviceId("core.agent"),
  coreAgentLoop: serviceId("core.agent-loop"),
  agentRegistry: serviceId("agent.registry"),
  agentFactory: serviceId("actspace.agent.factory"),
  agentLoop: serviceId("agent.loop"),
  subagent: serviceId("subagent.one-shot"),
  agentRuntime: serviceId("agent.runtime"),
  headlessRunner: serviceId("headless.runner"),
  facadeSessions: serviceId("actspace.runtime.sessions"),
  facadeRuns: serviceId("actspace.runtime.runs"),
  facadeCompaction: serviceId("actspace.runtime.compaction"),
  facadeLlm: serviceId("actspace.runtime.llm"),
} as const);

/** A public role-independent contract for one replaceable runtime capability. */
export type ServiceDefinition<TService = unknown, TConfig = unknown, TId extends string = string> = Readonly<{
  readonly kind: "actspace.service-definition";
  readonly id: ServiceId & TId;
  readonly abiVersion: number;
  readonly owner: string;
  readonly scope: "root" | "agent" | "session" | "invocation";
  readonly required: boolean;
  readonly description: string;
  readonly configSchema: JsonValue;
  readonly errors: readonly string[];
  readonly publicSurface: readonly string[];
  readonly service?: TService;
  readonly config?: TConfig;
}>;

/** A provider creates one implementation and owns its provider-side resources. */
export type ServiceProvider<TService = unknown, TConfig = unknown, TId extends string = string> = Readonly<{
  readonly kind: "actspace.service-provider";
  readonly providerId: string;
  readonly definition: ServiceDefinition<TService, TConfig, TId>;
  readonly create: (ctx: CordisServiceContext, config: TConfig) => TService | Promise<TService>;
  readonly apply: (ctx: CordisServiceContext, config: TConfig) => ProviderHandle<TService> | Promise<ProviderHandle<TService>>;
  readonly dispose?: () => void | Promise<void>;
}>;

/** Provider-owned service instance and an idempotent lifecycle disposer. */
export type ProviderHandle<TService = unknown> = Readonly<{
  readonly service: TService;
  readonly dispose: () => void | Promise<void>;
}>;

/** A consumer depends on a Definition, never on a provider's private class. */
export type ServiceConsumer<TService = unknown, TId extends string = string> = Readonly<{
  readonly kind: "actspace.service-consumer";
  readonly consumerId: string;
  readonly definition: ServiceDefinition<TService, unknown, TId>;
  readonly requires: readonly ServiceId[];
  readonly consume: (service: TService, ctx: CordisServiceContext) => void | Promise<void>;
}>;

/** Constructor shape accepted by Cordis for a Service-owned plugin. */
export type CordisServiceClass<TService = unknown, TConfig = unknown> = {
  new (ctx: CordisServiceContext, config: TConfig): TService;
  readonly inject?: readonly string[] | Readonly<Record<string, unknown>>;
  readonly Config?: unknown;
  readonly provide?: string | readonly string[];
};

/** The small context surface needed by a Definition consumer or facade. */
export type ServiceLookupContext = Pick<CordisServiceContext, "get">;

/** Build a frozen Definition and validate its id at the public boundary. */
export function defineServiceDefinition<TService = unknown, TConfig = unknown, TId extends string = string>(input: {
  readonly id: TId;
  readonly description: string;
  readonly abiVersion?: number;
  readonly owner?: string;
  readonly scope?: ServiceDefinition["scope"];
  readonly required?: boolean;
  readonly configSchema?: JsonValue;
  readonly errors?: readonly string[];
  readonly publicSurface?: readonly string[];
}): ServiceDefinition<TService, TConfig, TId> {
  return Object.freeze({
    kind: "actspace.service-definition" as const,
    id: serviceId(input.id) as ServiceId & TId,
    abiVersion: input.abiVersion ?? 1,
    owner: input.owner ?? "@actspace/core",
    scope: input.scope ?? "root",
    required: input.required ?? true,
    description: input.description,
    configSchema: input.configSchema ?? { type: "object" },
    errors: Object.freeze([...(input.errors ?? [])]),
    publicSurface: Object.freeze([...(input.publicSurface ?? [])]),
  });
}

/** Build a provider record without hiding its Definition behind a central registry. */
export function defineServiceProvider<TService, TConfig, TId extends string = string>(input: {
  readonly definition: ServiceDefinition<TService, TConfig, TId>;
  readonly providerId?: string;
  readonly create: ServiceProvider<TService, TConfig, TId>["create"];
  readonly dispose?: ServiceProvider<TService, TConfig, TId>["dispose"];
}): ServiceProvider<TService, TConfig, TId> {
  const providerId = input.providerId ?? `${input.definition.id}:default`;
  const apply = async (ctx: CordisServiceContext, config: TConfig): Promise<ProviderHandle<TService>> => ({ service: await input.create(ctx, config), dispose: input.dispose ?? (() => undefined) });
  return Object.freeze({ kind: "actspace.service-provider" as const, providerId, definition: input.definition, create: input.create, apply, ...(input.dispose === undefined ? {} : { dispose: input.dispose }) });
}

/** Build a consumer record with an explicit dependency list. */
export function defineServiceConsumer<TService, TId extends string = string>(input: {
  readonly definition: ServiceDefinition<TService, unknown, TId>;
  readonly consumerId?: string;
  readonly requires: readonly (ServiceId | string)[];
  readonly consume: ServiceConsumer<TService, TId>["consume"];
}): ServiceConsumer<TService, TId> {
  return Object.freeze({
    kind: "actspace.service-consumer" as const,
    consumerId: input.consumerId ?? `${input.definition.id}:consumer`,
    definition: input.definition,
    requires: Object.freeze(input.requires.map((id) => serviceId(id))),
    consume: input.consume,
  });
}

/** Fail closed when a required service is not visible in the current Context. */
export function requireService<T>(ctx: ServiceLookupContext, id: ServiceId | string): T {
  const value = ctx.get(id);
  if (value === undefined) throw new Error(`Required service "${id}" is unavailable.`);
  return value as T;
}

/** Validate the static metadata before a Definition enters a manifest. */
export function validateServiceDefinition(definition: ServiceDefinition): ServiceDefinition {
  serviceId(definition.id);
  if (!Number.isSafeInteger(definition.abiVersion) || definition.abiVersion < 1) throw new Error(`Invalid ABI version for service ${definition.id}.`);
  if (!definition.owner.trim()) throw new Error(`Service ${definition.id} must declare an owner.`);
  if (!definition.description.trim()) throw new Error(`Service ${definition.id} must declare a description.`);
  if (!isJsonValue(definition.configSchema)) throw new Error(`Service ${definition.id} configSchema must be JSON-safe.`);
  if (new Set(definition.errors).size !== definition.errors.length) throw new Error(`Service ${definition.id} has duplicate error categories.`);
  if (new Set(definition.publicSurface).size !== definition.publicSurface.length) throw new Error(`Service ${definition.id} has duplicate public surface entries.`);
  return definition;
}

/** Fail closed on duplicate providers and unresolved required consumers. */
export function validateServiceGraph(input: {
  readonly definitions: readonly ServiceDefinition[];
  readonly providers: readonly ServiceProvider[];
  readonly consumers?: readonly ServiceConsumer[];
}): void {
  const definitions = new Map<string, ServiceDefinition>();
  for (const definition of input.definitions) {
    validateServiceDefinition(definition);
    if (definitions.has(definition.id)) throw new Error(`Duplicate service definition ${definition.id}.`);
    definitions.set(definition.id, definition);
  }
  const providers = new Map<string, ServiceProvider>();
  for (const provider of input.providers) {
    validateServiceDefinition(provider.definition);
    if (!definitions.has(provider.definition.id)) throw new Error(`Provider ${provider.providerId} has no declared definition ${provider.definition.id}.`);
    if (providers.has(provider.definition.id)) throw new Error(`Multiple active providers for ${provider.definition.id}.`);
    providers.set(provider.definition.id, provider);
  }
  for (const consumer of input.consumers ?? []) {
    validateServiceDefinition(consumer.definition);
    for (const required of consumer.requires) if (!definitions.has(required)) throw new Error(`Consumer ${consumer.consumerId} requires unknown service ${required}.`);
  }
  for (const definition of definitions.values()) if (definition.required && !providers.has(definition.id)) throw new Error(`Required service ${definition.id} has no provider.`);
}

/** Check the static manifest declaration against the behavior's service ABI. */
export function validateManifestServiceConsistency(manifest: PluginManifest): void {
  const declared = new Set(manifest.contributions.services.map(String));
  for (const behavior of manifest.behaviors) {
    const provided = new Set((behavior.provides ?? []).map(String));
    const injected = new Set((behavior.injects ?? []).map(String));
    for (const id of provided) if (!declared.has(id)) throw new Error(`Manifest ${manifest.pluginId} behavior ${behavior.entryId} provides undeclared service ${id}.`);
    for (const id of declared) if (!provided.has(id) && !injected.has(id)) throw new Error(`Manifest ${manifest.pluginId} declares service ${id} without a matching behavior provide/inject entry.`);
    if (provided.size !== (behavior.provides ?? []).length) throw new Error(`Manifest ${manifest.pluginId} behavior ${behavior.entryId} repeats a provided service.`);
    if (injected.size !== (behavior.injects ?? []).length) throw new Error(`Manifest ${manifest.pluginId} behavior ${behavior.entryId} repeats an injected service.`);
  }
}

/** Definitions for the long-lived capabilities being migrated to Cordis ownership. */
export const ACTSPACE_SERVICE_DEFINITIONS: Readonly<Record<string, ServiceDefinition>> = Object.freeze({
  sessionJournal: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.sessionJournal, owner: "@actspace/session-journal", description: "Session event codecs, envelope validation and Journal replay owner.", publicSurface: ["registry", "append", "replay"] }),
  sessionStore: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.sessionStore, owner: "@actspace/session-persistence", scope: "session", description: "Session live log, surface and replay owner.", publicSurface: ["create", "open", "append", "flush", "close"] }),
  sessionPersistence: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.sessionPersistence, owner: "@actspace/session-persistence", scope: "session", description: "Durability provider for session checkpoints and recovery.", publicSurface: ["create", "inspect", "open", "fork"] }),
  sessionProjection: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.sessionProjection, owner: "@actspace/session-projection", scope: "session", required: false, description: "Read-only Session projection builder.", publicSurface: ["project"] }),
  llmRuntime: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.llmRuntime, owner: "@actspace/llm-service", description: "LLM route, provider and request lease owner.", publicSurface: ["complete", "stream", "models"] }),
  systemPrompt: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.systemPrompt, owner: "@actspace/prompt", description: "System prompt and contributor registry owner.", publicSurface: ["register", "assemble"] }),
  contextAssembler: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.contextAssembler, owner: "@actspace/context", description: "Context assembly definition and contributor seam.", publicSurface: ["assemble"] }),
  toolsRuntime: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.toolsRuntime, owner: "@actspace/tools-runtime", scope: "agent", description: "Tool policy, approval, scheduler and result event owner.", publicSurface: ["prepare", "execute", "dispose"] }),
  coreTools: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.coreTools, owner: "@actspace/core-tools", scope: "agent", description: "ActSpace core tool contributions.", publicSurface: ["definitions", "registrations"] }),
  browserTools: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.browserTools, owner: "@actspace/browser-tools", scope: "agent", required: false, description: "Browser Bridge tool contributions.", publicSurface: ["definitions", "registrations"] }),
  agentRegistry: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.agentRegistry, owner: "@actspace/core-agent", scope: "root", description: "Agent identity, scope, inbox and lifecycle owner.", publicSurface: ["register", "lookup", "dispose"] }),
  agentLoop: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.agentLoop, owner: "@actspace/core-agent-loop", scope: "agent", description: "Turn and step driver with Cordis intervention points.", publicSurface: ["followup", "abort", "waitForIdle"] }),
  compaction: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.compaction, owner: "@actspace/compaction", scope: "session", required: false, description: "Optional compaction policy and summarizer provider.", publicSurface: ["maybeCompact", "compact"] }),
  agentRuntime: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.agentRuntime, owner: "@actspace/runtime", scope: "root", description: "Run, followup, abort and quiescence orchestration owner.", publicSurface: ["run", "followup", "flush", "dispose"] }),
});

export type ServiceRoleMetadata = Readonly<{
  readonly definitionId: ServiceId;
  readonly definitionOwner: string;
  readonly providerId: string;
  readonly providerOwner: string;
  readonly consumerIds: readonly string[];
}>;

/** Static role inventory consumed by composition checks and the P2 matrix. */
export const ACTSPACE_SERVICE_ROLE_METADATA: readonly ServiceRoleMetadata[] = Object.freeze([
  serviceRole("sessionJournal", "@actspace/session-journal", "session.journal:default", []),
  serviceRole("sessionStore", "@actspace/session-persistence", "session.store:default", ["agent.runtime", "agent.loop", "session.runtime"]),
  serviceRole("sessionPersistence", "@actspace/session-persistence", "session.persistence:jsonl", ["session.store", "session.runtime"]),
  serviceRole("sessionProjection", "@actspace/session-projection", "session.projection:default", ["session.runtime", "runtime.projection"]),
  serviceRole("llmRuntime", "@actspace/llm-service", "llm.service:default", ["agent.loop", "compaction.runtime"]),
  serviceRole("systemPrompt", "@actspace/prompt", "prompt.runtime:default", ["context.assembly", "agent.loop"]),
  serviceRole("contextAssembler", "@actspace/context", "context.assembly:default", ["prompt.runtime", "agent.loop"]),
  serviceRole("toolsRuntime", "@actspace/tools-runtime", "tools.runtime:default", ["agent.loop", "subagent.one-shot"]),
  serviceRole("coreTools", "@actspace/core-tools", "tools.core:default", ["tools.runtime"]),
  serviceRole("browserTools", "@actspace/browser-tools", "tools.browser:default", ["tools.runtime"]),
  serviceRole("agentRegistry", "@actspace/core-agent", "agent.registry:default", ["agent.loop", "agent.runtime", "subagent.one-shot"]),
  serviceRole("agentLoop", "@actspace/core-agent-loop", "agent.loop:default", ["agent.runtime", "headless.runner"]),
  serviceRole("compaction", "@actspace/compaction", "compaction.runtime:default", ["agent.loop", "agent.runtime"]),
  serviceRole("agentRuntime", "@actspace/runtime", "agent.runtime:default", ["runtime.handle", "headless.runner"]),
]);

function serviceRole(key: keyof typeof ACTSPACE_SERVICE_DEFINITIONS, providerOwner: string, providerId: string, consumerIds: readonly string[]): ServiceRoleMetadata {
  const definition = ACTSPACE_SERVICE_DEFINITIONS[key];
  return Object.freeze({
  definitionId: definition.id,
  definitionOwner: definition.owner,
  providerId,
  providerOwner,
  consumerIds: Object.freeze([...consumerIds]),
  });
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

/** Keep this export available to type-only consumers that need the branded key. */
export type { ServiceId };
