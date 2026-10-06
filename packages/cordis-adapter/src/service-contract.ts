import { Context as CordisContextClass, Service as CordisService } from "@deepseek-ai/cordis";
import type { Context as CordisServiceContext, Plugin as CordisPlugin } from "@deepseek-ai/cordis";
import { serviceId, type ServiceId } from "./identity.js";
import type { JsonValue } from "./plugin-contract.js";

/** The concrete Cordis context and Service base used by ActSpace providers. */
export { CordisContextClass, CordisService };
/** Short name used by domain packages when declaring a Cordis-owned class. */
export { CordisService as Service };
export type { CordisServiceContext, CordisPlugin };

/** Stable service names used by the current Cordis graph. */
export const ACTSPACE_SERVICE_IDS = Object.freeze({
  runtime: serviceId("actspace.runtime"),
  host: serviceId("actspace.host"),
  hostPrompt: serviceId("actspace.host.prompt"),
  hostSession: serviceId("actspace.host.session"),
  hostSessionCodecs: serviceId("actspace.host.session.codecs"),
  hostLlm: serviceId("actspace.host.llm"),
  hostAgent: serviceId("actspace.host.agent"),
  hostHeadless: serviceId("actspace.host.headless"),
  sessionJournal: serviceId("session.journal"),
  sessionStorage: serviceId("session.storage"),
  sessionProjection: serviceId("session.projection"),
  /** Canonical live-log owner; session.runtime remains the host controller facade. */
  sessionStore: serviceId("session.store"),
  sessionRuntime: serviceId("session.runtime"),
  sessionCheckpoint: serviceId("session.checkpoint"),
  llmRuntime: serviceId("llm.service"),
  toolsRuntime: serviceId("tools.runtime"),
  toolsApproval: serviceId("tools.approval"),
  contextEngine: serviceId("context.engine"),
  systemPrompt: serviceId("prompt.runtime"),
  compaction: serviceId("compaction.runtime"),
  filesystemRead: serviceId("tools.filesystem-read"),
  filesystemSearch: serviceId("tools.filesystem-search"),
  filesystemWrite: serviceId("tools.filesystem-write"),
  shellTools: serviceId("tools.shell-tools"),
  webTools: serviceId("tools.web-tools"),
  imageGeneration: serviceId("tools.image-generation"),
  imageInspection: serviceId("tools.image-inspection"),
  todoTools: serviceId("tools.todo"),
  browserTools: serviceId("tools.browser"),
  coreAgent: serviceId("core.agent"),
  coreAgentLoop: serviceId("core.agent-loop"),
  agentRegistry: serviceId("agent.registry"),
  agentFactory: serviceId("actspace.agent.factory"),
  agentLoop: serviceId("agent.loop"),
  subagent: serviceId("subagent.one-shot"),
  agentRuntime: serviceId("agent.runtime"),
  headlessRunner: serviceId("headless.runner"),
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

/** Constructor shape accepted by Cordis for a Service-owned plugin. */
export type CordisServiceClass<TService = unknown, TConfig = unknown> = {
  new (ctx: CordisServiceContext, config: TConfig): TService;
  readonly inject?: readonly string[] | Readonly<Record<string, unknown>>;
  readonly Config?: unknown;
  readonly provide?: string | readonly string[];
};

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

/** Audit metadata for selected capabilities; manifests and production interfaces remain authoritative. */
export const ACTSPACE_SERVICE_DEFINITIONS: Readonly<Record<string, ServiceDefinition>> = Object.freeze({
  sessionCheckpoint: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.sessionCheckpoint, owner: "@actspace/session-checkpoint-policy", scope: "root", description: "Required live Session durability barrier.", publicSurface: ["flush"] }),
  sessionJournal: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.sessionJournal, owner: "@actspace/session-journal", description: "Session event codecs, envelope validation and Journal replay owner.", publicSurface: ["registry", "append", "replay"] }),
  sessionStore: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.sessionStore, owner: "@actspace/session-persistence", scope: "session", description: "Session live log, surface and replay owner.", publicSurface: ["create", "open", "append", "flush", "close"] }),
  sessionStorage: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.sessionStorage, owner: "@actspace/session-jsonl", scope: "root", description: "Host-owned session storage provider.", publicSurface: ["create", "inspect", "open", "listSessionIds", "close"] }),
  sessionProjection: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.sessionProjection, owner: "@actspace/session-projection", scope: "session", required: false, description: "Read-only Session projection builder.", publicSurface: ["createRegistry", "registerContributor", "applyContributors"] }),
  llmRuntime: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.llmRuntime, owner: "@actspace/llm-service", description: "LLM route, provider and request lease owner.", publicSurface: ["complete", "stream", "models"] }),
  systemPrompt: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.systemPrompt, owner: "@actspace/prompt", description: "System prompt and contributor registry owner.", publicSurface: ["register", "assemble"] }),
  contextEngine: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.contextEngine, owner: "@actspace/context", description: "Context sources, conversion and compaction coordinator.", publicSurface: ["create", "compaction"] }),
  toolsRuntime: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.toolsRuntime, owner: "@actspace/tools-runtime", scope: "agent", description: "Tool policy, approval, scheduler and result event owner.", publicSurface: ["prepare", "execute", "dispose"] }),
  filesystemRead: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.filesystemRead, owner: "@actspace/tools-filesystem-read", scope: "agent", description: "filesystem-read contributions.", publicSurface: ["definitions", "registrations"] }),
  filesystemSearch: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.filesystemSearch, owner: "@actspace/tools-filesystem-search", scope: "agent", description: "filesystem-search contributions.", publicSurface: ["definitions", "registrations"] }),
  filesystemWrite: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.filesystemWrite, owner: "@actspace/tools-filesystem-write", scope: "agent", description: "filesystem-write contributions.", publicSurface: ["definitions", "registrations"] }),
  shellTools: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.shellTools, owner: "@actspace/tools-shell-tools", scope: "agent", description: "shell-tools contributions.", publicSurface: ["definitions", "registrations"] }),
  webTools: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.webTools, owner: "@actspace/tools-web-tools", scope: "agent", description: "web-tools contributions.", publicSurface: ["definitions", "registrations"] }),
  imageGeneration: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.imageGeneration, owner: "@actspace/tools-image-generation", scope: "agent", description: "image-generation contributions.", publicSurface: ["definitions", "registrations"] }),
  imageInspection: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.imageInspection, owner: "@actspace/tools-image-inspection", scope: "agent", description: "image-inspection contributions.", publicSurface: ["definitions", "registrations"] }),
  todoTools: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.todoTools, owner: "@actspace/tools-todo-tools", scope: "agent", description: "todo-tools contributions.", publicSurface: ["definitions", "registrations"] }),
  browserTools: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.browserTools, owner: "@actspace/browser-tools", scope: "agent", required: false, description: "Browser Bridge tool contributions.", publicSurface: ["definitions", "registrations"] }),
  agentRegistry: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.agentRegistry, owner: "@actspace/core-agent", scope: "root", description: "Live Agent identity, scope and registration owner.", publicSurface: ["register", "lookup", "dispose"] }),
  agentLoop: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.agentLoop, owner: "@actspace/core-agent-loop", scope: "agent", description: "Turn and step driver with Cordis intervention points.", publicSurface: ["followup", "abort", "waitForIdle"] }),
  compaction: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.compaction, owner: "@actspace/compaction", scope: "session", required: false, description: "Optional compaction policy and summarizer provider.", publicSurface: ["maybeCompact", "compact"] }),
  agentRuntime: defineServiceDefinition({ id: ACTSPACE_SERVICE_IDS.agentRuntime, owner: "@actspace/runtime", scope: "root", description: "Host execution and Harness lifetime owner.", publicSurface: ["runs", "subagents", "harnesses", "dispose"] }),
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
  serviceRole("sessionCheckpoint", "@actspace/session-checkpoint-policy", "session.checkpoint:default", ["agent.loop"]),
  serviceRole("sessionJournal", "@actspace/session-journal", "session.journal:default", []),
  serviceRole("sessionStore", "@actspace/session-persistence", "session.store:default", ["agent.runtime", "agent.loop", "session.runtime"]),
  serviceRole("sessionStorage", "@actspace/session-jsonl", "session.storage:jsonl", ["session.store", "session.runtime"]),
  serviceRole("sessionProjection", "@actspace/session-projection", "session.projection:default", ["session.runtime", "runtime.projection"]),
  serviceRole("llmRuntime", "@actspace/llm-service", "llm.service:default", ["agent.loop", "compaction.runtime"]),
  serviceRole("systemPrompt", "@actspace/prompt", "prompt.runtime:default", ["context.engine", "agent.loop"]),
  serviceRole("contextEngine", "@actspace/context", "context.engine:default", ["agent.loop", "compaction.runtime"]),
  serviceRole("toolsRuntime", "@actspace/tools-runtime", "tools.runtime:default", ["agent.loop", "subagent.one-shot"]),
  serviceRole("filesystemRead", "@actspace/tools-filesystem-read", "tools.filesystem-read:default", ["tools.runtime"]),
  serviceRole("filesystemSearch", "@actspace/tools-filesystem-search", "tools.filesystem-search:default", ["tools.runtime"]),
  serviceRole("filesystemWrite", "@actspace/tools-filesystem-write", "tools.filesystem-write:default", ["tools.runtime"]),
  serviceRole("shellTools", "@actspace/tools-shell-tools", "tools.shell-tools:default", ["tools.runtime"]),
  serviceRole("webTools", "@actspace/tools-web-tools", "tools.web-tools:default", ["tools.runtime"]),
  serviceRole("imageGeneration", "@actspace/tools-image-generation", "tools.image-generation:default", ["tools.runtime"]),
  serviceRole("imageInspection", "@actspace/tools-image-inspection", "tools.image-inspection:default", ["tools.runtime"]),
  serviceRole("todoTools", "@actspace/tools-todo-tools", "tools.todo:default", ["tools.runtime"]),
  serviceRole("browserTools", "@actspace/browser-tools", "tools.browser:default", ["tools.runtime"]),
  serviceRole("agentRegistry", "@actspace/core-agent", "agent.registry:default", ["agent.loop", "agent.runtime", "subagent.one-shot"]),
  serviceRole("agentLoop", "@actspace/core-agent-loop", "agent.loop:default", ["agent.runtime", "headless.runner"]),
  serviceRole("compaction", "@actspace/compaction", "compaction.runtime:default", ["agent.loop", "agent.runtime"]),
  serviceRole("agentRuntime", "@actspace/runtime", "agent.runtime:default", ["host.application", "desktop.app", "headless.runner"]),
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

/** Keep this export available to type-only consumers that need the branded key. */
export type { ServiceId };
