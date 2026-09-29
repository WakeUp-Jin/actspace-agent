import { AgentLoop } from "@actspace/core-agent-loop";
import type { AgentLoopAssembly, AgentLoopServiceOptions } from "@actspace/core-agent-loop";
import { MAIN_AGENT_DESCRIPTOR, MainAgentInbox, resolveMainAgentPreset, activateMainAgentFormTools, mainAgentFormComposition, allowedAgentModeTools } from "@actspace/core-agent";
import type { AgentSubject } from "@actspace/core-agent";
import { AgentScope, scopeContext } from "@actspace/core-scope";
import { ContributorRegistry, RequestAssembler, emptyRuntimePromptSource } from "@actspace/prompt";
import type { PromptContributor, PromptRuntimeService } from "@actspace/prompt";
import type { LlmService } from "@actspace/llm-service";
import type { ToolRuntime } from "@actspace/tools-runtime";
import type { CompactionPlugin } from "@actspace/compaction";
import type { RuntimeSessionController } from "./session-controller.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import { resolveSessionWorkspaceRoot } from "@actspace/session-jsonl";
import { projectPermissionMode, projectSessionGrants } from "@actspace/session-projection";
import { AGENT_RUNTIME_HOST_PORT_ID, type AgentRuntimeHostPort } from "./agent-host-port.js";

export type AgentFactoryService = AgentLoopServiceOptions & {
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
  "compaction.runtime",
]);

export function apply(ctx: CordisContext): void {
  const host = requireService<AgentRuntimeHostPort>(ctx, AGENT_RUNTIME_HOST_PORT_ID);
  const registry = requireService<import("@actspace/core-agent").AgentRegistry>(ctx, "agent.registry");
  const sessions = requireService<RuntimeSessionController>(ctx, "session.runtime");
  const llm = requireService<LlmService>(ctx, "llm.service");
  const tools = requireService<ToolRuntime>(ctx, "tools.runtime");
  const prompt = requireService<PromptRuntimeService>(ctx, "prompt.runtime");
  const compaction = requireService<CompactionPlugin>(ctx, "compaction.runtime");
  const activeSessions = new Map<string, import("@actspace/session-persistence").SessionHandle>();

  const toolEnvironmentFor = (session: import("@actspace/session-persistence").SessionHandle) => {
    activeSessions.set(session.header.sessionId, session);
    const configuredMode = host.toolEnvironment.permissionMode;
    return Object.freeze({
      ...host.toolEnvironment,
      workspaceRoot: resolveSessionWorkspaceRoot(session.header, session.journal.events, host.workspaceRoot),
      permissionMode: () => host.toolEnvironment.permissionModeExplicit
        ? (typeof configuredMode === "function" ? configuredMode() : configuredMode ?? "default")
        : projectPermissionMode(session.journal.events),
      sessionGrants: () => host.toolEnvironment.sessionGrantCapability ? projectSessionGrants(session.journal.events) : [],
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
    const workspaceRoot = resolveSessionWorkspaceRoot(session.header, session.journal.events, host.workspaceRoot);
    const source = await prompt.resolveSource(workspaceRoot);
    const contributors = new ContributorRegistry();
    for (const contributor of prompt.createCoreContributors({ scopeId: scope.identity.scopeId, agent: descriptor, host: host.host, workspaceRoot, instructions: source.instructions, skills: source.skills })) contributors.register(scope, contributor);
    const assembler = new RequestAssembler({ registry: contributors, prepare: async () => ({ route: descriptor.routeId, model: descriptor.model, registrationId: "cordis-agent", adapterVersion: "cordis-agent", defaults: {}, retryPolicy: {}, contextWindow: null }) });
    const subject: AgentSubject = Object.freeze({ agentId: agentId ?? scope.agentId, scopeId: scope.identity.scopeId, descriptorId: descriptor.id });
    const scopedToolEnvironment = descriptor.kind === "subagent"
      ? (activeSession: import("@actspace/session-persistence").SessionHandle) => ({ ...toolEnvironmentFor(activeSession), sessionGrantCapability: false, sessionGrants: [] })
      : toolEnvironmentFor;
    const binding = tools.bindAgentScope(session.header.sessionId, subject.agentId, () => new Set(allowedToolNames ?? []));
    scope.disposer.add(binding.dispose);
    const loop = new AgentLoop({ descriptor, scope, agentSubject: subject, session, inbox: new MainAgentInbox(session), assembler, llm, tools, toolEnvironment: scopedToolEnvironment, toolScopeToken: binding.token, compositionDigest: host.compositionDigest, hostCapabilityDigest: host.hostCapabilityDigest, host: host.host, ...(allowedToolNames === undefined ? {} : { allowedToolNames: new Set(allowedToolNames) }), compaction, onLiveEvent: host.onLiveEvent, context: scopeContext(ctx, scope.scopeKey, scope.disposer) });
    if (signal !== undefined) {
      const abort = () => loop.abort(typeof signal.reason === "string" ? signal.reason : "parent-abort");
      if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
      scope.disposer.add(() => signal.removeEventListener("abort", abort));
    }
    return loop;
  };

  const createMainAgent = async (session: import("@actspace/session-persistence").SessionHandle): Promise<AgentLoopAssembly> => {
    resolveMainAgentPreset(session.header.createdWith.presetId);
    const descriptor = Object.freeze({ ...MAIN_AGENT_DESCRIPTOR, routeId: llm.routes.list()[0]?.routeId ?? MAIN_AGENT_DESCRIPTOR.routeId });
    const agentId = `main:${session.header.sessionId}`;
    const scope = new AgentScope(agentId, undefined, agentId);
    try {
      const activatedForm = activateMainAgentFormTools(scope, tools);
      const recordedMembers = session.header.createdWith.agentMembers;
      if (recordedMembers !== undefined) {
        const actualMembers = activatedForm.members.map(({ id, version }) => ({ id, version }));
        const actualDigest = mainAgentFormComposition(actualMembers.map(({ id, version }) => ({ id, version: String(version) }))).digest;
        if (JSON.stringify(recordedMembers) !== JSON.stringify(actualMembers) || session.header.createdWith.agentCompositionDigest !== actualDigest) {
          throw new Error("Agent form composition is unavailable for this Session.");
        }
      }
      const binding = tools.bindAgentScope(session.header.sessionId, agentId, () => {
        const mode = sessions.snapshot(session).agentMode ?? "agent";
        const names = scope.tools.entries().map(entry => entry.id);
        return allowedAgentModeTools(mode, names);
      });
      scope.disposer.add(binding.dispose);
      const subject: AgentSubject = Object.freeze({ agentId, scopeId: scope.identity.scopeId, descriptorId: descriptor.id });
      const inbox = new MainAgentInbox(session);
      const workspaceRoot = resolveSessionWorkspaceRoot(session.header, session.journal.events, host.workspaceRoot);
      const contributors = new ContributorRegistry();
      const assembler = new RequestAssembler({ registry: contributors, prepare: async () => ({ route: descriptor.routeId, model: descriptor.model, registrationId: "cordis-agent", adapterVersion: "cordis-agent", defaults: {}, retryPolicy: {}, contextWindow: null }) });
      const activateModeContributors = createModeContributorActivation(scope, contributors, async key => {
        const source = key === "chat"
          ? { ...emptyRuntimePromptSource(), instructions: prompt.source.instructions.filter(instruction => instruction.id === "host/user-instructions") }
          : await prompt.resolveSource(workspaceRoot);
        return prompt.createCoreContributors({ scopeId: scope.identity.scopeId, agent: descriptor, host: host.host, workspaceRoot, instructions: source.instructions, skills: source.skills, profile: key === "chat" ? "chat" : "agent" });
      });
      const initialMode = session.header.createdWith.initialAgentMode ?? (session.header.createdWith.presetId === "actspace.chat" ? "chat" : "agent");
      await activateModeContributors(initialMode);
      const loop = new AgentLoop({ descriptor, scope, agentSubject: subject, session, inbox, assembler, modeRuntime: async mode => { await activateModeContributors(mode); return { assembler, compaction: mode === "chat" ? compaction.withTriggerRatio(host.chatCompactionTriggerRatio ?? (() => 0.8)) : compaction }; }, llm, tools, toolEnvironment: toolEnvironmentFor, toolScopeToken: binding.token, compositionDigest: host.compositionDigest, hostCapabilityDigest: host.hostCapabilityDigest, host: host.host, onLiveEvent: host.onLiveEvent, context: scopeContext(ctx, scope.scopeKey, scope.disposer) });
      activeSessions.set(session.header.sessionId, session);
      const unpublish = registry.publish({ agentId: `main:${session.header.sessionId}`, descriptor, scope, session, dispose: async () => { loop.quiesce(); activeSessions.delete(session.header.sessionId); await scope.dispose(); } });
      return Object.freeze({ descriptor, scope, subject, session, inbox, loop, dispose: async () => { unpublish(); loop.quiesce(); activeSessions.delete(session.header.sessionId); await scope.dispose(); } });
    } catch (error) {
      activeSessions.delete(session.header.sessionId);
      await scope.dispose().catch(() => undefined);
      throw error;
    }
  };

  const service: AgentFactoryService = Object.freeze({
    create: createMainAgent,
    context: ctx,
    activeSessions,
    createSubagentLoop: ({ session, scope, preset, allowedToolNames, signal, agentId }) => createLoop({ session, scope, signal, agentId, allowedToolNames, descriptor: Object.freeze({ id: preset.id, version: preset.version, kind: "subagent", description: `One-shot ${preset.id} child Agent`, presetId: preset.id, routeId: preset.routeId, model: preset.model, maxSteps: preset.maxSteps }) }),
  });
  ctx.provide?.("actspace.agent.factory", service);
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
