import { AUTO_REVIEW_SERVICE } from "@actspace/auto-review";
import { reviewSessionAction } from "./review-session-action.js";
import { CONTEXT_ENGINE_SERVICE } from "@actspace/context-engine";
import { CONTEXT_ASSEMBLY_SERVICE, CONTEXT_ASSEMBLY_SERVICE_ID, type ContextAgentRole } from "@actspace/context-assembly";
import type { ContributorRegistry, PromptContributor } from "@actspace/prompt";
import { PROMPT_HOST_PORT, PROMPT_RUNTIME_SERVICE, type ScriptingFacts } from "@actspace/prompt";
import type { ShellToolsService } from "@actspace/tool-shell";
import type { RUN_FACTORY, RunFactory } from "@actspace/agent-service";
import { AgentLoop } from "@actspace/agent-loop";
import type { AgentLoopAssembly } from "@actspace/agent-loop";
import { AGENT_REGISTRY_SERVICE, MAIN_AGENT_DESCRIPTOR, MainAgentInbox, resolveMainAgentPreset, activateAgentFormTools, allowedAgentModeTools, isEvolvedPluginId } from "@actspace/agent";
import type { AgentSubject } from "@actspace/agent";
import { type AgentScope, scopeContext } from "@actspace/scope";
import { LLM_SERVICE } from "@actspace/llm-service";
// 引 `/plugin` 这个入口：从包的根入口引，会把内核用不到的清单定义一起带进来。
import { COMPACTION_RUNTIME_SERVICE } from "@actspace/context-compaction/plugin";
import { getService, provideService, requireService, type CordisContext, type ServiceOf } from "@actspace/cordis-adapter";
import { resolveSessionWorkspaceRoot } from "@actspace/session-journal";
import { isBashLogReadPath, isSessionTranscriptReadPath } from "@actspace/session-transcript";
import type { SessionHandle } from "@actspace/session-persistence";
import { HOST_READABLE_FILES_SERVICE, HOST_WRITABLE_ROOTS_SERVICE, HostReadableFiles, TOOL_RUNTIME_SERVICE } from "@actspace/tool-runtime";
import { projectPermissionMode, applySessionGrantEvent } from "@actspace/session-projection";
import { isBackgroundWake } from "@actspace/shared/runtime-v2";
import { AGENT_FACTORY_SERVICE, AGENT_RUNTIME_HOST_PORT, FACTORY_SHELL_TOOLS_VIEW, SESSION_RUNTIME_HOST_PORT, SESSION_RUNTIME_SERVICE } from "../service-keys.js";
import { blockedTool, isExternalRecordPath, isSubagentBlockedTool, SUBAGENT_APPROVAL_UNAVAILABLE, type ChildLoopInput } from "@actspace/subagent";

const PURPOSE_ROUTE_IDS = new Set(["utility", "auto-review"]);
const CONSUMER = "Agent factory plugin";
type AgentRole = ContextAgentRole;

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
  CONTEXT_ASSEMBLY_SERVICE_ID,
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
  const host = requireService(ctx, AGENT_RUNTIME_HOST_PORT, CONSUMER);
  const registry = requireService(ctx, AGENT_REGISTRY_SERVICE, CONSUMER);
  const sessions = requireService(ctx, SESSION_RUNTIME_SERVICE, CONSUMER);
  const llm = requireService(ctx, LLM_SERVICE, CONSUMER);
  const tools = requireService(ctx, TOOL_RUNTIME_SERVICE, CONSUMER);
  const prompt = requireService(ctx, PROMPT_RUNTIME_SERVICE, CONSUMER);

  const engine = requireService(ctx, CONTEXT_ENGINE_SERVICE, CONSUMER);
  const assembly = requireService(ctx, CONTEXT_ASSEMBLY_SERVICE, CONSUMER);
  const activeSessions = new Map<string, import("@actspace/session-persistence").SessionHandle>();

  // Which sources an agent gets, and which tool results feed context state, is what the context plugins registered for its role.
  const createSources = (scope: AgentScope, agent: import("@actspace/agent").AgentDescriptor, workspaceRoot: string, role: AgentRole) => {
    const scripting = scriptingFacts(getService(ctx, FACTORY_SHELL_TOOLS_VIEW));
    return assembly.sourcesFor(role, { scope, scopeId: scope.identity.scopeId, agent, host: host.host, workspaceRoot, prompt, ...(scripting === undefined ? {} : { scripting }) });
  };
  const observeContextToolResult = (session: SessionHandle, event: import("@actspace/session-journal").SessionEventEnvelopeV1) => assembly.observeToolResult(session, event);
  const extensions = (sessionId: string, scopeId: string, kind: "main" | "subagent") => () => getService(ctx, PROMPT_HOST_PORT)?.extensions?.list(sessionId, scopeId, kind) ?? [];
  // A fork keeps its parent's system prompt (design 02 §8.4): the sections plugins registered for the parent main session,
  // plus whatever is registered for the fork's own scope.
  const forkExtensions = (session: import("@actspace/session-persistence").SessionHandle, scopeId: string) => {
    const parentId = session.header.lineage?.parentSessionId ?? session.header.sessionId;
    const parent = extensions(parentId, scopeId, "main"), own = extensions(session.header.sessionId, scopeId, "subagent");
    return () => [...parent(), ...own()];
  };

  const sessionDataRoot = getService(ctx, SESSION_RUNTIME_HOST_PORT)?.dataRoot;
  const isHostReadablePath = composeHostReadablePath(sessionDataRoot, hostReadableFiles);
  const readableFor = composeSessionReadablePath(isHostReadablePath, id => sessions.getOpen(id));
  // Resolved per call: shell-tools registers its scratch directory after this plugin is applied.
  const isHostWritablePath = (canonicalPath: string) => getService(ctx, HOST_WRITABLE_ROOTS_SERVICE)?.has(canonicalPath) === true;
  const toolEnvironmentFor = (session: import("@actspace/session-persistence").SessionHandle) => {
    activeSessions.set(session.header.sessionId, session);
    const configuredMode = host.toolEnvironment.permissionMode;
    return Object.freeze({
      ...host.toolEnvironment,
      isHostReadablePath: readableFor(session),
      isHostWritablePath,
      autoReview: async (input: import("@actspace/tool-runtime").AutoReviewInput) => {
        const reviewer = getService(ctx, AUTO_REVIEW_SERVICE);
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
    if (role === "fork") {
      registerMainTools(scope);
      // The parent's system prompt and conversation name the parent's scratch directory; the fork keeps both, so it works there.
      const parentId = session.header.lineage?.parentSessionId;
      const shared = parentId === undefined ? undefined : getService(ctx, FACTORY_SHELL_TOOLS_VIEW)?.shareScratchDirectory?.(session.header.sessionId, parentId);
      if (shared !== undefined) scope.disposer.add(shared);
    }
    const binding = tools.bindAgentScope(session.header.sessionId, subject.agentId, () => new Set(allowedToolNames ?? []));
    scope.disposer.add(binding.dispose);
    const loop = new AgentLoop({ contextSources: createSources(scope, descriptor, workspaceRoot, role), contextExtensions: role === "fork" ? forkExtensions(session, scope.identity.scopeId) : extensions(session.header.sessionId, scope.identity.scopeId, "subagent"), observeContextToolResult, createContextEngine: options => engine.create(options), descriptor, scope, agentSubject: subject, session, inbox: new MainAgentInbox(session), llm, tools, toolEnvironment: scopedToolEnvironment, toolScopeToken: binding.token, compositionDigest: host.compositionDigest, hostCapabilityDigest: host.hostCapabilityDigest, host: host.host, ...(allowedToolNames === undefined ? {} : { allowedToolNames: new Set(allowedToolNames) }), compaction: engine.compaction, onLiveEvent: host.onLiveEvent, context: scopeContext(ctx, scope.scopeKey, scope.disposer) });
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
    readonly mode: import("@actspace/shared/runtime-v2").RuntimeAgentMode;
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
      const loop = new AgentLoop({ contextSources: createSources(scope, descriptor, workspaceRoot, "main"), contextExtensions: extensions(session.header.sessionId, scope.identity.scopeId, "main"), observeContextToolResult, createContextEngine: options => engine.create(options), descriptor, scope, agentSubject: subject, session, inbox, inputSource: run.inputSource, modeRuntime: async mode => { const compaction = getService(ctx, COMPACTION_RUNTIME_SERVICE); return { compaction: mode === "chat" && compaction ? engine.compaction.withStrategy(compaction.withTriggerRatio(host.chatCompactionTriggerRatio ?? (() => 0.8))) : engine.compaction }; }, llm, tools, toolEnvironment: activeSession => {
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
  provideService(ctx, AGENT_FACTORY_SERVICE, service);
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

/** Harness entry: publish the structural one-Run factory from this isolated service tree. */
export function apply(ctx: CordisContext): void {
  const hostReadableFiles = new HostReadableFiles();
  provideService(ctx, HOST_READABLE_FILES_SERVICE, hostReadableFiles);
  const factory = createAgentFactory(ctx, hostReadableFiles);
  // 这一处按 id 注册：`RUN_FACTORY` 的定义在 Host 一侧的 `@actspace/agent-service`，值引用会把那个包打进 Harness 内核。
  // 类型仍然按定义检查（`typeof RUN_FACTORY` 只用到类型）；id 写错时 Host 取不到工厂，任何一次 Run 都起不来。
  ctx.provide?.("agent.run-factory", factory.runFactory satisfies ServiceOf<typeof RUN_FACTORY>);
}

function taskContent(content: import("@actspace/shared/runtime-v2").RuntimeJsonValue) {
  return content && typeof content === "object" && !Array.isArray(content) && "kind" in content && content.kind === "composer-task" ? content.prepared : content;
}

const SESSION_GRANTS = Symbol("session-grants");
function activeGrants(session: import("@actspace/session-persistence").SessionHandle) {
  return session.journal.project(SESSION_GRANTS, () => [], applySessionGrantEvent).flatMap(item => item.grant && item.revokedAt === null ? [item.grant] : []);
}

/** The scripting guidance only applies when Bash is in this Harness and owns a scratch directory. */
function scriptingFacts(shell: ShellToolsService | undefined): ScriptingFacts | undefined {
  const scratchDirectory = shell?.scratchDirectory;
  if (scratchDirectory === undefined) return undefined;
  const python = shell?.python;
  return Object.freeze({
    scratchDirectory,
    ...(python === undefined ? {} : { python: Object.freeze({ version: python.version, corePackages: python.corePackages, extensionPackages: python.extensionPackages, extensionInstalled: () => python.extensionSitePackages?.() !== undefined }) }),
  });
}
