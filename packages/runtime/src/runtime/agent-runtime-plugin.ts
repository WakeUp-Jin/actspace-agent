import { Service } from "@actspace/cordis-adapter";
import type { CordisContext, CordisServiceContext } from "@actspace/cordis-adapter";
import type { AgentRegistry } from "@actspace/core-agent";
import { registerTodoTools } from "@actspace/core-agent";
import type { AgentLoopService } from "@actspace/core-agent-loop";
import { createBuiltInPresets, OneShotSubagentProvider, registerSubagentTools } from "@actspace/subagent";
import type { RuntimeSessionController } from "./session-controller.js";
import { RunController } from "./run-controller.js";
import type { AgentFactoryService } from "./agent-factory-plugin.js";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { AGENT_RUNTIME_HOST_PORT_ID, type AgentRuntimeHostPort } from "./agent-host-port.js";

export const inject = Object.freeze(["actspace.host.agent", "agent.registry", "agent.loop", "actspace.agent.factory", "session.runtime", "tools.runtime", "subagent.one-shot"]);

export type AgentRuntimeServiceShape = {
  readonly registry: AgentRegistry;
  readonly loopService: AgentLoopService;
  readonly runs: RunController;
  readonly subagents: OneShotSubagentProvider;
  readonly activeSessions: ReadonlyMap<string, import("@actspace/session-persistence").SessionHandle>;
};

/** Cordis owner for run orchestration, main/subagent creation and shutdown drain. */
export class AgentRuntimeService extends Service implements AgentRuntimeServiceShape {
  static inject = Object.freeze(["actspace.host.agent", "agent.registry", "agent.loop", "actspace.agent.factory", "session.runtime", "tools.runtime", "subagent.one-shot"]);
  static Config = {
    "~standard": {
      version: 1,
      vendor: "actspace",
      validate(value: unknown) {
        if (value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value))) return { value: value ?? {} };
        return { issues: [{ message: "Agent runtime config must be an object." }] };
      },
    },
  };

  readonly registry: AgentRegistry;
  readonly loopService: AgentLoopService;
  readonly runs: RunController;
  readonly subagents: OneShotSubagentProvider;
  readonly activeSessions: ReadonlyMap<string, import("@actspace/session-persistence").SessionHandle>;

  constructor(ctx: CordisServiceContext) {
    super(ctx, "agent.runtime");
    const host = get<AgentRuntimeHostPort>(ctx, AGENT_RUNTIME_HOST_PORT_ID);
    const registry = get<AgentRegistry>(ctx, "agent.registry");
    const loopService = get<AgentLoopService>(ctx, "agent.loop");
    const factory = get<AgentFactoryService>(ctx, "actspace.agent.factory");
    const sessions = get<RuntimeSessionController>(ctx, "session.runtime");
    const tools = get<ToolRuntime>(ctx, "tools.runtime");
    const oneShotSurface = get<typeof import("@actspace/subagent")>(ctx, "subagent.one-shot");
    const presets = createBuiltInPresets([...tools.registry.listDefinitions().map((definition) => definition.name), "agent", "explore"]);
    this.subagents = new oneShotSurface.OneShotSubagentProvider({
      store: sessions.store,
      presets,
      manifestDigest: host.compositionDigest,
      plugins: host.plugins,
      createLoop: factory.createSubagentLoop,
    });
    this.runs = new RunController(sessions, factory.create, loopService);
    const todoTools = registerTodoTools(tools, (sessionId) => factory.activeSessions.get(sessionId));
    const subagentTools = registerSubagentTools(tools, this.subagents, (sessionId) => {
      const assembly = this.runs.get(sessionId);
      return assembly === undefined ? undefined : { session: assembly.session, scope: assembly.scope };
    });
    this.registry = registry;
    this.loopService = loopService;
    this.activeSessions = factory.activeSessions;
    ctx.effect(() => async () => {
      await Promise.allSettled(subagentTools.map((registration) => registration.dispose()));
      await Promise.allSettled(todoTools.map((registration) => registration.dispose()));
      await this.subagents.dispose();
      await this.runs.dispose();
    }, "agent.runtime");
  }
}

export function apply(ctx: CordisContext): void {
  new AgentRuntimeService(ctx as never);
}

function get<T>(ctx: CordisServiceContext, id: string): T {
  const value = ctx.get?.(id) as T | undefined;
  if (value === undefined) throw new Error(`Agent runtime plugin requires ${id}.`);
  return value;
}
