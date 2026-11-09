import type { AutoReviewer } from "@actspace/auto-review";
import { reviewSessionAction } from "./review-session-action.js";
import { ContextSourceRegistry, type ContextCompactionCoordinator } from "@actspace/context-engine";
import { createDisclosureSource, type ProgressiveDisclosure } from "@actspace/context-disclosure";
import type { ContributorRegistry, PromptContributor } from "@actspace/prompt";
import type { SourceFactory, PromptHostPort, PromptRuntimeService } from "@actspace/prompt";
import type { ContextEngine, ContextEngineOptions } from "@actspace/context-engine";
import type { RunFactory } from "@actspace/agent-service";
import { AgentLoop } from "@actspace/agent-loop";
import type { AgentLoopAssembly } from "@actspace/agent-loop";
import { MAIN_AGENT_DESCRIPTOR, MainAgentInbox, resolveMainAgentPreset, activateAgentFormTools, allowedAgentModeTools, isEvolvedPluginId } from "@actspace/agent";
import type { AgentSubject } from "@actspace/agent";
import { type AgentScope, scopeContext } from "@actspace/scope";
import type { LlmService } from "@actspace/llm-service";
import type { ToolRuntime } from "@actspace/tool-runtime";
import type { CompactionPlugin } from "@actspace/context-compaction";
import type { RuntimeSessionController } from "../session/session-controller.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import { resolveSessionWorkspaceRoot } from "@actspace/session-journal";
import { isBashLogReadPath, isSessionTranscriptReadPath } from "@actspace/session-transcript";
import type { SessionHandle } from "@actspace/session-persistence";
import { HOST_READABLE_FILES_SERVICE_ID, HostReadableFiles } from "@actspace/tool-runtime";
import { projectPermissionMode, applySessionGrantEvent } from "@actspace/session-projection";
import { isBackgroundWake } from "@actspace/shared/runtime-v2";
import { AGENT_RUNTIME_HOST_PORT_ID, type AgentRuntimeHostPort } from "./agent-host-port.js";
import { blockedTool, isExternalRecordPath, isSubagentBlockedTool, SUBAGENT_APPROVAL_UNAVAILABLE, type ChildLoopInput } from "@actspace/subagent";

const PURPOSE_ROUTE_IDS = new Set(["utility", "auto-review"]);
type AgentRole = "main" | "subagent" | "fork";

export type AgentFactoryService = {
  readonly runFactory: RunFactory;
  readonly activeSessions: ReadonlyMap<string, import("@actspace/session-persistence").SessionHandle>;
  readonly createSubagentLoop: (input: ChildLoopInput) => AgentLoop | Promise<AgentLoop>;
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

/**
 * Files an agent may read without a workspace-scope approval: Session transcripts,
 * background Bash logs, and the exact files another plugin added (external subagent records).
 * Journals and the directories around these files stay gated.
 */
export function composeHostReadablePath(dataRoot: string | undefined, files: HostReadableFiles): (canonicalPath: string) => boolean {
  return canonicalPath => (dataRoot !== undefined && (isSessionTranscriptReadPath(dataRoot, canonicalPath) || isBashLogReadPath(dataRoot, canonicalPath))) || files.has(canonicalPath);
}

/**
 * Per Session: the Host-readable files plus the session logs of the external subagents in its tree,
 * read from the main Session's subagent records (a subagent's own Session has none), so they survive
 * a Harness reload or an app restart.
 */
export function composeSessionReadablePath(
  isHostReadablePath: (canonicalPath: string) => boolean,
  getOpen: (sessionId: string) => SessionHandle | undefined,
  isRecordPath: (root: SessionHandle, canonicalPath: string) => boolean = isExternalRecordPath,
): (session: SessionHandle) => (canonicalPath: string) => boolean {
  return session => canonicalPath => {
    if (isHostReadablePath(canonicalPath)) return true;
    const lineage = session.header.lineage;
    const root = lineage?.origin === "delegation" ? getOpen(lineage.parentSessionId) : session;
    return root !== undefined && isRecordPath(root, canonicalPath);
  };
}

function createAgentFactory(ctx: CordisContext, hostReadableFiles: HostReadableFiles): AgentFactoryService {
  const host = requireService<AgentRuntimeHostPort>(ctx, AGENT_RUNTIME_HOST_PORT_ID);
  const registry = requireService<import("@actspace/agent").AgentRegistry>(ctx, "agent.registry");
  const sessions = requireService<RuntimeSessionController>(ctx, "session.runtime");
  const llm = requireService<LlmService>(ctx, "llm.service");
  const tools = requireService<ToolRuntime>(ctx, "tools.runtime");
  const prompt = requireService<PromptRuntimeService>(ctx, "prompt.runtime");

  const engine = requireService<{ compaction: ContextCompactionCoordinator; create(options: ContextEngineOptions): ContextEngine }>(ctx, "context.engine");
  const getDisclosure = () => ctx.get?.("context.disclosure") as ProgressiveDisclosure | undefined;
  const activeSessions = new Map<string, import("@actspace/session-persistence").SessionHandle>();

  const createSources = (scope: AgentScope, agent: import("@actspace/agent").AgentDescriptor, workspaceRoot: string, role: AgentRole) => {
    const sources = new ContextSourceRegistry(["context-system", "context-conversation"]);
    // 后台任务与运行中子智能体清单只给主 Agent：子智能体（含 fork）不能发起后台任务，也不能再派子智能体。
    for (const kind of ["system", "rules", "skills", "runtime", "conversation", "tools", ...(role === "main" ? ["background-tasks", "subagents"] : [])]) {
      const factory = ctx.get?.(`context.source.${kind}`) as SourceFactory | undefined;
      if (!factory && (kind === "system" || kind === "conversation")) throw new Error(`Required context source ${kind} is unavailable.`);
      if (factory) scope.disposer.add(sources.register(factory.create({ scope, scopeId: scope.identity.scopeId, agent, host: host.host, workspaceRoot, prompt })));
    }
    if (getDisclosure()) scope.disposer.add(sources.register(createDisclosureSource()));
    scope.disposer.add(() => sources.clear());
    return sources;
  };
  const extensions = (sessionId: string, scopeId: string, kind: "main" | "subagent") => () => (ctx.get?.("actspace.host.prompt") as PromptHostPort | undefined)?.extensions?.list(sessionId, scopeId, kind) ?? [];
  // A fork keeps its parent's system prompt (design 02 §8.4): the sections plugins registered for the parent main session,
  // plus whatever is registered for the fork's own scope.
  const forkExtensions = (session: import("@actspace/session-persistence").SessionHandle, scopeId: string) => {
    const parentId = session.header.lineage?.parentSessionId ?? session.header.sessionId;
    const parent = extensions(parentId, scopeId, "main"), own = extensions(session.header.sessionId, scopeId, "subagent");
    return () => [...parent(), ...own()];
  };

  const sessionDataRoot = (ctx.get?.("actspace.host.session") as { readonly dataRoot?: string } | undefined)?.dataRoot;
  const isHostReadablePath = composeHostReadablePath(sessionDataRoot, hostReadableFiles);
  const readableFor = composeSessionReadablePath(isHostReadablePath, id => sessions.getOpen(id));
  const toolEnvironmentFor = (session: import("@actspace/session-persistence").SessionHandle) => {
    activeSessions.set(session.header.sessionId, session);
    const configuredMode = host.toolEnvironment.permissionMode;
    return Object.freeze({
      ...host.toolEnvironment,
      isHostReadablePath: readableFor(session),
      autoReview: async (input: import("@actspace/tool-runtime").AutoReviewInput) => {
        const reviewer = ctx.get?.("approval.auto-review") as AutoReviewer | undefined;
        if (!reviewer) throw new Error("Auto reviewer unavailable");
        return reviewSessionAction(session, reviewer, input);
      },
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
      sessionGrants: () => host.toolEnvironment.sessionGrantCapability ? activeGrants(session) : [],
    });
  };

  if (host.agentForm === undefined) throw new Error("Agent factory plugin requires actspace.host.agent.agentForm.");
  // The main agent's tools in its scope: the Host-declared form members and evolved plugins.
  const registerMainTools = (scope: AgentScope) => {
    activateAgentFormTools(host.agentForm, scope, tools);
    for (const definition of tools.registry.listDefinitions()) {
      if (isEvolvedPluginId(definition.pluginId)) scope.tools.register({ id: definition.name, owner: definition.pluginId, value: definition.pluginId });
    }
  };

  /**
   * A child Loop. `subagent`: its own descriptor, child prompt extensions and every allowed tool.
   * `fork`: the main agent's descriptor, prompt extensions and tool scope, limited to the parent's
   * visible tools, so the request matches the parent's (design 02 §8.4). Both run without approval.
   */
  const createLoop = async ({ session, scope, descriptor, role, allowedToolNames, signal, agentId }: {
    readonly session: import("@actspace/session-persistence").SessionHandle;
    readonly scope: AgentScope;
    readonly descriptor: import("@actspace/agent").AgentDescriptor;
    readonly role: "subagent" | "fork";
    readonly allowedToolNames?: readonly string[];
    readonly signal?: AbortSignal;
    readonly agentId?: string;
  }): Promise<AgentLoop> => {
    scope.disposer.add(sessions.registerExternal(session));
    scope.disposer.add(() => { activeSessions.delete(session.header.sessionId); });
    const workspaceRoot = resolveSessionWorkspaceRoot(session.header, session.journal, host.workspaceRoot);
    const subject: AgentSubject = Object.freeze({ agentId: agentId ?? scope.agentId, scopeId: scope.identity.scopeId, descriptorId: descriptor.id });
    // A subagent cannot ask for approval or start background work; it reuses its parent's session grants without adding any.
    // A fork sees its parent's tools; the ones a subagent may not run fail when called.
    const scopedToolEnvironment = (activeSession: import("@actspace/session-persistence").SessionHandle) => {
      const { approvalBroker: _approvalBroker, ...environment } = toolEnvironmentFor(activeSession);
      const parentId = activeSession.header.lineage?.parentSessionId;
      return {
        ...environment,
        approvalUnavailableMessage: SUBAGENT_APPROVAL_UNAVAILABLE,
        backgroundAllowed: false,
        blockedToolMessage: (name: string) => isSubagentBlockedTool(name) ? blockedTool(name) : undefined,
        sessionGrantCapability: false,
        ...(parentId === undefined || !host.toolEnvironment.sessionGrantCapability ? {} : { sessionGrantOwner: { sessionId: parentId, agentId: `main:${parentId}` } }),
        sessionGrants: () => {
          const parent = parentId === undefined ? undefined : sessions.getOpen(parentId);
          return parent && host.toolEnvironment.sessionGrantCapability ? activeGrants(parent) : [];
        },
      };
    };
    if (role === "fork") registerMainTools(scope);
    const binding = tools.bindAgentScope(session.header.sessionId, subject.agentId, () => new Set(allowedToolNames ?? []));
    scope.disposer.add(binding.dispose);
    const disclosure = getDisclosure();
    const loop = new AgentLoop({ contextSources: createSources(scope, descriptor, workspaceRoot, role), contextExtensions: role === "fork" ? forkExtensions(session, scope.identity.scopeId) : extensions(session.header.sessionId, scope.identity.scopeId, "subagent"), observeContextToolResult: disclosure ? (session, event) => disclosure.observe(session, event) : undefined, createContextEngine: options => engine.create({ ...options, disclosure }), descriptor, scope, agentSubject: subject, session, inbox: new MainAgentInbox(session), llm, tools, toolEnvironment: scopedToolEnvironment, toolScopeToken: binding.token, compositionDigest: host.compositionDigest, hostCapabilityDigest: host.hostCapabilityDigest, host: host.host, ...(allowedToolNames === undefined ? {} : { allowedToolNames: new Set(allowedToolNames) }), compaction: engine.compaction, onLiveEvent: host.onLiveEvent, context: scopeContext(ctx, scope.scopeKey, scope.disposer) });
    if (signal !== undefined) {
      const abort = () => loop.abort(typeof signal.reason === "string" ? signal.reason : "parent-abort");
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
      scope.disposer.add(() => signal.removeEventListener("abort", abort));
    }
    return loop;
  };

  // 用途路由（轻量任务、自动审批、探索）不能拿来跑主 Agent。
  const mainRouteId = (): string => {
    const routes = llm.routes.list();
    const route = routes.find(route => route.routeId === MAIN_AGENT_DESCRIPTOR.routeId)
      ?? routes.find(route => !PURPOSE_ROUTE_IDS.has(route.routeId));
    return route?.routeId ?? MAIN_AGENT_DESCRIPTOR.routeId;
  };

  const createMainAgent = async (session: import("@actspace/session-persistence").SessionHandle, run: {
    readonly scope: AgentScope;
    readonly budget?: Parameters<RunFactory["create"]>[0]["budget"];
    readonly inputSource: import("@actspace/agent-loop").LoopInputSource;
    readonly mode: import("@actspace/shared/runtime-v2").RuntimeV2AgentMode;
  }): Promise<AgentLoopAssembly> => {
    resolveMainAgentPreset(session.header.createdWith.presetId);
    const descriptor = Object.freeze({ ...MAIN_AGENT_DESCRIPTOR, routeId: mainRouteId() });
    const agentId = `main:${session.header.sessionId}`;
    const scope = run.scope.child(agentId);
    try {
      registerMainTools(scope);
      const binding = tools.bindAgentScope(session.header.sessionId, agentId, () => {
        const scoped = new Set(scope.tools.entries().map(entry => entry.id));
        return allowedAgentModeTools(run.mode, tools.registry.listDefinitions().filter(definition => scoped.has(definition.name)));
      });
      scope.disposer.add(binding.dispose);
      const subject: AgentSubject = Object.freeze({ agentId, scopeId: scope.identity.scopeId, descriptorId: descriptor.id });
      const inbox = new MainAgentInbox(session);
      const workspaceRoot = resolveSessionWorkspaceRoot(session.header, session.journal, host.workspaceRoot);
      const disclosure = getDisclosure();
      const loop = new AgentLoop({ contextSources: createSources(scope, descriptor, workspaceRoot, "main"), contextExtensions: extensions(session.header.sessionId, scope.identity.scopeId, "main"), observeContextToolResult: disclosure ? (session, event) => disclosure.observe(session, event) : undefined, createContextEngine: options => engine.create({ ...options, disclosure }), descriptor, scope, agentSubject: subject, session, inbox, inputSource: run.inputSource, modeRuntime: async mode => { const compaction = ctx.get?.("compaction.runtime") as CompactionPlugin | undefined; return { compaction: mode === "chat" && compaction ? engine.compaction.withStrategy(compaction.withTriggerRatio(host.chatCompactionTriggerRatio ?? (() => 0.8))) : engine.compaction }; }, llm, tools, toolEnvironment: activeSession => {
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
          const result = await assembly.loop.runTurn({ ...input.configuration, content: taskContent(input.initial.content), messageId: input.initial.taskId, agentRunId: input.runId, ...(isBackgroundWake(input.initial.content) ? { wake: true } : {}) });
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
    // Subagents run on the main route; the model of each activation comes from runTurn.
    // A fork keeps the main descriptor: it is part of the system prompt (the `core/agent-descriptor` model fact).
    createSubagentLoop: input => {
      const { session, scope, description, allowedToolNames, maxSteps, signal, agentId } = input;
      if (input.role === "fork") return createLoop({ session, scope, signal, agentId, allowedToolNames, role: "fork", descriptor: Object.freeze({ ...MAIN_AGENT_DESCRIPTOR, routeId: mainRouteId() }) });
      const { preset } = input;
      return createLoop({ session, scope, signal, agentId, allowedToolNames, role: "subagent", descriptor: Object.freeze({ id: `actspace.subagent.${preset}`, version: 2, kind: "subagent", description: `Subagent (${preset}): ${description}`, presetId: `actspace.subagent.${preset}`, routeId: mainRouteId(), model: MAIN_AGENT_DESCRIPTOR.model, maxSteps }) });
    },
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
export function apply(ctx: CordisContext): void {
  const hostReadableFiles = new HostReadableFiles();
  ctx.provide?.(HOST_READABLE_FILES_SERVICE_ID, hostReadableFiles);
  const factory = createAgentFactory(ctx, hostReadableFiles);
  ctx.provide?.("agent.run-factory", factory.runFactory);
}

function taskContent(content: import("@actspace/shared/runtime-v2").RuntimeV2JsonValue) {
  return content && typeof content === "object" && !Array.isArray(content) && "kind" in content && content.kind === "composer-task" ? content.prepared : content;
}

const SESSION_GRANTS = Symbol("session-grants");
function activeGrants(session: import("@actspace/session-persistence").SessionHandle) {
  return session.journal.project(SESSION_GRANTS, () => [], applySessionGrantEvent).flatMap(item => item.grant && item.revokedAt === null ? [item.grant] : []);
}
