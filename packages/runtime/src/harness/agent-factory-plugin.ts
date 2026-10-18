import { ContextSourceRegistry, type ContextCompactionCoordinator } from "@actspace/context-engine";
import { createDisclosureSource, type ProgressiveDisclosure } from "@actspace/context-disclosure";
import type { ContributorRegistry, PromptContributor } from "@actspace/prompt";
import type { SourceFactory, PromptHostPort, PromptRuntimeService } from "@actspace/prompt";
import type { ContextEngine, ContextEngineOptions } from "@actspace/context-engine";
import type { RunFactory } from "@actspace/agent-service";
import { AgentLoop } from "@actspace/core-agent-loop";
import type { AgentLoopAssembly } from "@actspace/core-agent-loop";
import { MAIN_AGENT_DESCRIPTOR, MainAgentInbox, resolveMainAgentPreset, activateMainAgentFormTools, allowedAgentModeTools } from "@actspace/core-agent";
import type { AgentSubject } from "@actspace/core-agent";
import { AgentScope, scopeContext } from "@actspace/core-scope";
import type { LlmService } from "@actspace/llm-service";
import type { ToolRuntime } from "@actspace/tools-runtime";
import type { CompactionPlugin } from "@actspace/context-compaction";
import type { RuntimeSessionController } from "../session/session-controller.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import { resolveSessionWorkspaceRoot } from "@actspace/session-journal";
import { projectPermissionMode, applySessionGrantEvent } from "@actspace/session-projection";
import { AGENT_RUNTIME_HOST_PORT_ID, type AgentRuntimeHostPort } from "./agent-host-port.js";

export type AgentFactoryService = {
  readonly runFactory: RunFactory;
  readonly activeSessions: ReadonlyMap<string, import("@actspace/session-persistence").SessionHandle>;
  readonly createSubagentLoop: (input: {
    readonly session: import("@actspace/session-persistence").SessionHandle;
    readonly scope: AgentScope;
    readonly preset: import("@actspace/subagent").StaticAgentPreset;
    readonly allowedToolNames: readonly string[];
    readonly signal: AbortSignal;
    readonly agentId: string;
  }) => AgentLoop | Promise<AgentLoop>;
};

export const inject = Object.freeze([
  "actspace.host.agent",
  "agent.registry",
  "session.runtime",
  "llm.service",
  "tools.runtime",
  "prompt.runtime",
  "context.engine",
  "context.source.system",
  "context.source.conversation",
]);

export function apply(ctx: CordisContext): AgentFactoryService {
  const host = requireService<AgentRuntimeHostPort>(ctx, AGENT_RUNTIME_HOST_PORT_ID);
  const registry = requireService<import("@actspace/core-agent").AgentRegistry>(ctx, "agent.registry");
  const sessions = requireService<RuntimeSessionController>(ctx, "session.runtime");
  const llm = requireService<LlmService>(ctx, "llm.service");
  const tools = requireService<ToolRuntime>(ctx, "tools.runtime");
  const prompt = requireService<PromptRuntimeService>(ctx, "prompt.runtime");

  const engine = requireService<{ compaction: ContextCompactionCoordinator; create(options: ContextEngineOptions): ContextEngine }>(ctx, "context.engine");
  const getDisclosure = () => ctx.get?.("context.disclosure") as ProgressiveDisclosure | undefined;
  const activeSessions = new Map<string, import("@actspace/session-persistence").SessionHandle>();

  const createSources = (scope: AgentScope, agent: import("@actspace/core-agent").AgentDescriptor, workspaceRoot: string) => {
    const sources = new ContextSourceRegistry(["context-system", "context-conversation"]);
    for (const kind of ["system", "rules", "skills", "runtime", "conversation", "tools"]) {
      const factory = ctx.get?.(`context.source.${kind}`) as SourceFactory | undefined;
      if (!factory && (kind === "system" || kind === "conversation")) throw new Error(`Required context source ${kind} is unavailable.`);
      if (factory) scope.disposer.add(sources.register(factory.create({ scope, scopeId: scope.identity.scopeId, agent, host: host.host, workspaceRoot, prompt })));
    }
    if (getDisclosure()) scope.disposer.add(sources.register(createDisclosureSource()));
    scope.disposer.add(() => sources.clear());
    return sources;
  };
  const extensions = (sessionId: string, scopeId: string, kind: "main" | "subagent") => () => (ctx.get?.("actspace.host.prompt") as PromptHostPort | undefined)?.extensions?.list(sessionId, scopeId, kind) ?? [];

  const toolEnvironmentFor = (session: import("@actspace/session-persistence").SessionHandle) => {
    activeSessions.set(session.header.sessionId, session);
    const configuredMode = host.toolEnvironment.permissionMode;
    return Object.freeze({
      ...host.toolEnvironment,
      contextGeneration: session.journal.surface.replaceGeneration,
      workspaceRoot: resolveSessionWorkspaceRoot(session.header, session.journal, host.workspaceRoot),
      permissionMode: () => host.toolEnvironment.permissionModeExplicit
        ? (typeof configuredMode === "function" ? configuredMode() : configuredMode ?? "default")
        : projectPermissionMode(session.journal.latestEvents(["permission/mode-set"])),
      subscribePermissionMode: (listener: () => void) => host.toolEnvironment.permissionModeExplicit
        ? (host.toolEnvironment.subscribePermissionMode?.(listener) ?? (() => undefined))
        : sessions.subscribeProjection(update => {
          if (update.sessionId === session.header.sessionId && update.event.type === "permission/mode-set") listener();
        }),
      sessionGrants: () => host.toolEnvironment.sessionGrantCapability ? session.journal.project(SESSION_GRANTS, () => [], applySessionGrantEvent).flatMap(item => item.grant && item.revokedAt === null ? [item.grant] : []) : [],
    });
  };

  const createLoop = async ({ session, scope, descriptor, allowedToolNames, signal, agentId }: {
    readonly session: import("@actspace/session-persistence").SessionHandle;
    readonly scope: AgentScope;
    readonly descriptor: import("@actspace/core-agent").AgentDescriptor;
    readonly allowedToolNames?: readonly string[];
    readonly signal?: AbortSignal;
    readonly agentId?: string;
  }): Promise<AgentLoop> => {
    scope.disposer.add(sessions.registerExternal(session));
    scope.disposer.add(() => { activeSessions.delete(session.header.sessionId); });
    const workspaceRoot = resolveSessionWorkspaceRoot(session.header, session.journal, host.workspaceRoot);
    const subject: AgentSubject = Object.freeze({ agentId: agentId ?? scope.agentId, scopeId: scope.identity.scopeId, descriptorId: descriptor.id });
    const scopedToolEnvironment = descriptor.kind === "subagent"
      ? (activeSession: import("@actspace/session-persistence").SessionHandle) => ({ ...toolEnvironmentFor(activeSession), sessionGrantCapability: false, sessionGrants: [] })
      : toolEnvironmentFor;
    const binding = tools.bindAgentScope(session.header.sessionId, subject.agentId, () => new Set(allowedToolNames ?? []));
    scope.disposer.add(binding.dispose);
    const disclosure = getDisclosure();
    const loop = new AgentLoop({ contextSources: createSources(scope, descriptor, workspaceRoot), contextExtensions: extensions(session.header.sessionId, scope.identity.scopeId, descriptor.kind), observeContextToolResult: disclosure ? (session, event) => disclosure.observe(session, event) : undefined, createContextEngine: options => engine.create({ ...options, disclosure }), descriptor, scope, agentSubject: subject, session, inbox: new MainAgentInbox(session), llm, tools, toolEnvironment: scopedToolEnvironment, toolScopeToken: binding.token, compositionDigest: host.compositionDigest, hostCapabilityDigest: host.hostCapabilityDigest, host: host.host, ...(allowedToolNames === undefined ? {} : { allowedToolNames: new Set(allowedToolNames) }), compaction: engine.compaction, onLiveEvent: host.onLiveEvent, context: scopeContext(ctx, scope.scopeKey, scope.disposer) });
    if (signal !== undefined) {
      const abort = () => loop.abort(typeof signal.reason === "string" ? signal.reason : "parent-abort");
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
      scope.disposer.add(() => signal.removeEventListener("abort", abort));
    }
    return loop;
  };

  const createMainAgent = async (session: import("@actspace/session-persistence").SessionHandle, run: {
    readonly scope: AgentScope;
    readonly budget?: Parameters<RunFactory["create"]>[0]["budget"];
    readonly inputSource: import("@actspace/core-agent-loop").LoopInputSource;
    readonly mode: import("@actspace/shared/runtime-v2").RuntimeV2AgentMode;
  }): Promise<AgentLoopAssembly> => {
    resolveMainAgentPreset(session.header.createdWith.presetId);
    const descriptor = Object.freeze({ ...MAIN_AGENT_DESCRIPTOR, routeId: llm.routes.list()[0]?.routeId ?? MAIN_AGENT_DESCRIPTOR.routeId });
    const agentId = `main:${session.header.sessionId}`;
    const scope = run.scope.child(agentId);
    try {
      activateMainAgentFormTools(scope, tools);
      for (const definition of tools.registry.listDefinitions()) {
        if (definition.pluginId === "actspace.plugin-manager" || definition.pluginId.startsWith("actspace.evolved.")) scope.tools.register({ id: definition.name, owner: definition.pluginId, value: definition.pluginId });
      }
      const binding = tools.bindAgentScope(session.header.sessionId, agentId, () => {
        const mode = run.mode;
        const names = scope.tools.entries().map(entry => entry.id);
        return allowedAgentModeTools(mode, names, tools.registry.listDefinitions().filter(d => d.pluginId.startsWith("actspace.evolved.")).map(d => d.name));
      });
      scope.disposer.add(binding.dispose);
      const subject: AgentSubject = Object.freeze({ agentId, scopeId: scope.identity.scopeId, descriptorId: descriptor.id });
      const inbox = new MainAgentInbox(session);
      const workspaceRoot = resolveSessionWorkspaceRoot(session.header, session.journal, host.workspaceRoot);
      const disclosure = getDisclosure();
      const loop = new AgentLoop({ contextSources: createSources(scope, descriptor, workspaceRoot), contextExtensions: extensions(session.header.sessionId, scope.identity.scopeId, descriptor.kind), observeContextToolResult: disclosure ? (session, event) => disclosure.observe(session, event) : undefined, createContextEngine: options => engine.create({ ...options, disclosure }), descriptor, scope, agentSubject: subject, session, inbox, inputSource: run.inputSource, modeRuntime: async mode => { const compaction = ctx.get?.("compaction.runtime") as CompactionPlugin | undefined; return { compaction: mode === "chat" && compaction ? engine.compaction.withStrategy(compaction.withTriggerRatio(host.chatCompactionTriggerRatio ?? (() => 0.8))) : engine.compaction }; }, llm, tools, toolEnvironment: activeSession => {
        const environment = toolEnvironmentFor(activeSession);
        const broker = environment.approvalBroker;
        return !broker || !run.budget ? environment : { ...environment, approvalBroker: {
          requestApproval: async (request, signal) => {
            run.budget!.waitForApproval(request.requestId);
            try { return await broker.requestApproval(request, signal); }
            finally { run.budget!.settleApproval(request.requestId); }
          },
        } };
      }, toolScopeToken: binding.token, compositionDigest: host.compositionDigest, hostCapabilityDigest: host.hostCapabilityDigest, host: host.host, onLiveEvent: host.onLiveEvent, context: scopeContext(ctx, scope.scopeKey, scope.disposer) });
      activeSessions.set(session.header.sessionId, session);
      const unpublish = registry.publish({ agentId: `main:${session.header.sessionId}`, descriptor, scope, session, dispose: async () => { loop.quiesce(); activeSessions.delete(session.header.sessionId); await scope.dispose(); } });
      return Object.freeze({ descriptor, scope, subject, session, inbox, loop, dispose: async () => { unpublish(); loop.quiesce(); activeSessions.delete(session.header.sessionId); await scope.dispose(); } });
    } catch (error) {
      activeSessions.delete(session.header.sessionId);
      await scope.dispose().catch(() => undefined);
      throw error;
    }
  };

  const runFactory: RunFactory = {
    create: async input => {
      const assembly = await createMainAgent(input.session, { scope: input.scope, mode: input.configuration.mode, budget: input.budget, inputSource: {
        hasPending: () => input.hasPendingSupplements(),
        claim: async () => {
          const consumed = await input.claimSupplements();
          return { messageIds: consumed.tasks.map(task => task.taskId), configuration: consumed.configuration };
        },
      } });
      const abort = () => assembly.loop.abort(typeof input.signal.reason === "string" ? input.signal.reason : "host-abort");
      input.signal.addEventListener("abort", abort);
      return {
        execute: async () => {
          input.signal.throwIfAborted();
          const result = await assembly.loop.runTurn({ ...input.configuration, content: taskContent(input.initial.content), messageId: input.initial.taskId, agentRunId: input.runId });
          return { outcome: result.reason === "aborted" ? "cancelled" : result.reason === "completed" ? "completed" : "failed", value: result };
        },
        dispose: async () => {
          input.signal.removeEventListener("abort", abort);
          assembly.loop.quiesce();
          await assembly.loop.waitForIdle();
          await assembly.dispose();
        },
      };
    },
  };

  const service: AgentFactoryService = Object.freeze({
    runFactory,
    activeSessions,
    createSubagentLoop: ({ session, scope, preset, allowedToolNames, signal, agentId }) => createLoop({ session, scope, signal, agentId, allowedToolNames, descriptor: Object.freeze({ id: preset.id, version: preset.version, kind: "subagent", description: `One-shot ${preset.id} child Agent`, presetId: preset.id, routeId: preset.routeId, model: preset.model, maxSteps: preset.maxSteps }) }),
  });
  ctx.provide?.("actspace.agent.factory", service);
  return service;
}

export function createModeContributorActivation(
  scope: AgentScope,
  registry: ContributorRegistry,
  resolve: (key: "chat" | "workspace") => Promise<readonly PromptContributor[]>,
): (mode: "chat" | "plan" | "agent") => Promise<void> {
  let active: { key: "chat" | "workspace"; remove: readonly (() => void)[]; values: readonly PromptContributor[] } | undefined;
  return async mode => {
    const key = mode === "chat" ? "chat" : "workspace";
    if (active?.key === key) return;
    const values = await resolve(key);
    const previous = active;
    for (const remove of previous?.remove ?? []) remove();
    const remove: Array<() => void> = [];
    try {
      for (const contributor of values) remove.push(registry.register(scope, contributor));
      active = { key, remove, values };
    } catch (error) {
      for (const undo of remove.reverse()) undo();
      if (previous !== undefined) active = { ...previous, remove: previous.values.map(value => registry.register(scope, value)) };
      throw error;
    }
  };
}

function requireService<T>(ctx: CordisContext, id: string): T {
  const value = ctx.get?.(id) as T | undefined;
  if (value === undefined) throw new Error(`Agent factory plugin requires ${id}.`);
  return value;
}

/** Harness entry: publish the structural one-Run factory from this isolated service tree. */
export function applyRunFactory(ctx: CordisContext): void {
  const factory = apply(ctx);
  ctx.provide?.("agent.run-factory", factory.runFactory);
}

function taskContent(content: import("@actspace/shared/runtime-v2").RuntimeV2JsonValue) {
  return content && typeof content === "object" && !Array.isArray(content) && "kind" in content && content.kind === "composer-task" ? content.prepared : content;
}

const SESSION_GRANTS = Symbol("session-grants");
