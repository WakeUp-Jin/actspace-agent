import type { AgentHandle } from "./agent.js";
import { AgentRuntimeError } from "./errors.js";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";

export class AgentRegistry {
  readonly #agents = new Map<string, AgentHandle>();
  publish(agent: AgentHandle): () => void {
    if (this.#agents.has(agent.agentId)) throw new AgentRuntimeError("AGENT_CONFLICT", `Agent ${agent.agentId} already exists.`);
    this.#agents.set(agent.agentId, agent);
    let active = true;
    return () => { if (!active) return; active = false; if (this.#agents.get(agent.agentId) === agent) this.#agents.delete(agent.agentId); };
  }
  get(agentId: string): AgentHandle { const agent = this.#agents.get(agentId); if (agent === undefined) throw new AgentRuntimeError("AGENT_NOT_FOUND", `Agent ${agentId} is not published.`); return agent; }
  list(): readonly AgentHandle[] { return Object.freeze([...this.#agents.values()].sort((a, b) => a.agentId.localeCompare(b.agentId))); }
}

/** Cordis owner for published Agent subjects and their scope/inbox handles. */
export class AgentRegistryService extends Service {
  static inject = Object.freeze([]);
  static Config = {
    "~standard": {
      version: 1,
      vendor: "actspace",
      validate(value: unknown) {
        if (value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value))) return { value: value ?? {} };
        return { issues: [{ message: "Agent registry config must be an object." }] };
      },
    },
  };

  readonly registry: AgentRegistry;

  constructor(ctx: CordisServiceContext) {
    super(ctx, "agent.registry");
    this.registry = new AgentRegistry();
    ctx.effect(() => () => undefined, "agent.registry");
  }

  publish(agent: AgentHandle): () => void { return this.registry.publish(agent); }
  get(agentId: string): AgentHandle { return this.registry.get(agentId); }
  list(): readonly AgentHandle[] { return this.registry.list(); }
}
