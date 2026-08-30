import type { RuntimeV2RunTurnResponse } from "@actspace/shared/runtime-v2";
import type { AgentLoop, AgentLoopService, RunTurnInput } from "@actspace/core-agent-loop";
import type { RunTurnResult } from "@actspace/core-agent";
import { MainAgentInbox } from "@actspace/core-agent";
import type { AgentScope } from "@actspace/core-scope";
import type { SessionHandle } from "@actspace/session-persistence";
import type { RuntimeSessionController } from "./session-controller.js";

export type MainAgentAssembly = { readonly descriptor: import("@actspace/core-agent").AgentDescriptor; readonly subject?: import("@actspace/core-agent").AgentSubject; readonly session: SessionHandle; readonly scope: AgentScope; readonly loop: AgentLoop; readonly inbox: MainAgentInbox; readonly dispose: () => Promise<void> };
export type MainAgentFactory = (session: SessionHandle) => MainAgentAssembly | Promise<MainAgentAssembly>;

export class RunController {
  readonly #agents = new Map<string, MainAgentAssembly>();
  constructor(private readonly sessions: RuntimeSessionController, private readonly createAgent: MainAgentFactory, private readonly agentService?: AgentLoopService) {}
  async attach(session: SessionHandle): Promise<MainAgentAssembly> {
    const existing = this.#agents.get(session.header.sessionId);
    if (existing !== undefined) return existing;
    if (this.agentService !== undefined) {
      await this.agentService.attach(session);
      const assembly = this.agentService.getAssembly(`main:${session.header.sessionId}`);
      if (assembly === undefined) throw new Error(`Agent Loop Service did not publish main:${session.header.sessionId}.`);
      this.#agents.set(session.header.sessionId, assembly);
      return assembly;
    }
    const agent = await this.createAgent(session); this.#agents.set(session.header.sessionId, agent); return agent;
  }
  async run(sessionId: string, input: RunTurnInput): Promise<RuntimeV2RunTurnResponse> {
    const session = await this.sessions.resume(sessionId);
    let result: RunTurnResult;
    if (this.agentService !== undefined) {
      const agent = await this.agentService.attach(session);
      result = await this.agentService.followup(agent.agentId, input.content, {
        messageId: input.messageId,
        agentRunId: input.agentRunId,
        model: input.model,
        mode: input.mode,
        keepPendingOnAbort: input.keepPendingOnAbort,
        selectedSkillIds: input.selectedSkillIds,
      });
      const assembly = this.agentService.getAssembly(agent.agentId);
      if (assembly === undefined) throw new Error(`Agent Loop Service lost ${agent.agentId} while its followup was active.`);
      this.#agents.set(session.header.sessionId, assembly);
    } else {
      const agent = await this.attach(session);
      result = await agent.loop.runTurn(input);
    }
    return Object.freeze({ sessionId, ...result, snapshot: this.sessions.snapshot(session) });
  }
  abort(sessionId: string, reason?: string): boolean { return this.agentService?.get(`main:${sessionId}`)?.abort(reason) ?? this.#agents.get(sessionId)?.loop.abort(reason) ?? false; }
  get(sessionId: string): MainAgentAssembly | undefined { return this.agentService?.getAssembly(`main:${sessionId}`) ?? this.#agents.get(sessionId); }
  async rebuild(session: SessionHandle): Promise<MainAgentAssembly> {
    const sessionId = session.header.sessionId;
    const existing = this.#agents.get(sessionId) ?? (this.agentService === undefined ? undefined : this.agentService.getAssembly(`main:${sessionId}`));
    if (existing?.loop.active) throw new Error("Cannot rebuild an Agent while its turn is active.");
    if (existing !== undefined) {
      this.#agents.delete(sessionId);
      if (this.agentService !== undefined) await this.agentService.get(`main:${sessionId}`)?.dispose();
      else { existing.loop.quiesce(); await existing.loop.waitForIdle(); await existing.dispose(); }
    }
    return this.attach(session);
  }
  quiesce(): void { if (this.agentService !== undefined) this.agentService.quiesce(); else for (const agent of this.#agents.values()) agent.loop.quiesce(); }
  async dispose(): Promise<void> {
    if (this.agentService !== undefined) { this.#agents.clear(); await this.agentService.dispose(); return; }
    const agents = [...this.#agents.values()]; this.#agents.clear(); await Promise.all(agents.map(async (agent) => { agent.loop.quiesce(); await agent.loop.waitForIdle(); await agent.dispose(); }));
  }
}
