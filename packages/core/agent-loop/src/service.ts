import { AgentRuntimeError, createAgentEventDispatcher, defaultAgentSubject } from "@actspace/core-agent";
import type { AgentEventPayload } from "@actspace/core-agent";
import type { MainAgentInbox } from "@actspace/core-agent";
import type { AgentDescriptor } from "@actspace/core-agent";
import type { RunTurnResult } from "@actspace/core-agent";
import type { AgentScope } from "@actspace/core-scope";
import type { SessionHandle } from "@actspace/session-persistence";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { CordisContext } from "@actspace/cordis-adapter";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";
import type { RunTurnInput, AgentLoop } from "./loop.js";

export type AgentLoopAssembly = {
  readonly descriptor: AgentDescriptor;
  readonly scope: AgentScope;
  readonly subject?: import("@actspace/core-agent").AgentSubject;
  readonly session: SessionHandle;
  readonly inbox: MainAgentInbox;
  readonly loop: AgentLoop;
  readonly dispose: () => Promise<void>;
};

export type AgentFollowupOptions = Omit<RunTurnInput, "content" | "messageId"> & {
  readonly target?: "next-step" | "next-turn";
  readonly messageId?: string;
};

export type ManagedAgent = {
  readonly agentId: string;
  readonly sessionId: string;
  readonly descriptor: AgentDescriptor;
  readonly scope: AgentScope;
  readonly subject?: import("@actspace/core-agent").AgentSubject;
  readonly session: SessionHandle;
  readonly followup: (content: RuntimeV2JsonValue, options?: AgentFollowupOptions) => Promise<RunTurnResult>;
  readonly abort: (reason?: string) => boolean;
  readonly waitForIdle: () => Promise<void>;
  readonly dispose: () => Promise<void>;
};

export type AgentLoopServiceOptions = {
  readonly create: (session: SessionHandle) => AgentLoopAssembly | Promise<AgentLoopAssembly>;
  readonly context?: CordisContext;
  readonly contextProvider?: () => CordisContext | undefined;
};

type ManagedAgentRecord = {
  readonly agent: ManagedAgent;
  readonly assembly: AgentLoopAssembly;
};

/**
 * Service-owned Agent registry and driver. A followup is never sent straight
 * to `AgentLoop.runTurn`: it is durably enqueued, claimed, and only then
 * starts the turn. This makes the public Agent API safe for reconnects and
 * gives observers an insertion event with a durable sequence number.
 */
export class AgentLoopService {
  readonly #agents = new Map<string, ManagedAgentRecord>();
  readonly #disposing = new Map<string, Promise<void>>();
  readonly #followups = new Map<string, Promise<RunTurnResult>>();
  #accepting = true;

  constructor(private readonly options: AgentLoopServiceOptions) {}

  async attach(session: SessionHandle): Promise<ManagedAgent> {
    const sessionId = session.header.sessionId;
    const agentId = `main:${sessionId}`;
    const existing = this.#agents.get(agentId);
    if (existing !== undefined) return existing.agent;
    if (!this.#accepting) throw new AgentRuntimeError("TURN_ABORTED", "Agent service is quiescing.");
    const assembly = await this.options.create(session);
    const agent: ManagedAgent = {
      agentId,
      sessionId,
      descriptor: assembly.descriptor,
      scope: assembly.scope,
      ...(assembly.subject === undefined ? {} : { subject: assembly.subject }),
      session: assembly.session,
      followup: (content, followupOptions) => this.followup(agentId, content, followupOptions),
      abort: (reason) => assembly.loop.abort(reason),
      waitForIdle: () => assembly.loop.waitForIdle(),
      dispose: () => this.disposeAgent(agentId),
    };
    this.#agents.set(agentId, { agent, assembly });
    await this.emit(assembly, "agent/created", { agentId, sessionId });
    return agent;
  }

  get(agentId: string): ManagedAgent | undefined { return this.#agents.get(agentId)?.agent; }
  /** Internal bridge for the runtime Profile/RunController; the public Agent facade
   * deliberately does not expose the concrete loop or Session writer. */
  getAssembly(agentId: string): AgentLoopAssembly | undefined { return this.#agents.get(agentId)?.assembly; }
  list(): readonly ManagedAgent[] { return Object.freeze([...this.#agents.values()].map((record) => record.agent).sort((a, b) => a.agentId.localeCompare(b.agentId))); }

  async followup(agentId: string, content: RuntimeV2JsonValue, options: AgentFollowupOptions = {}): Promise<RunTurnResult> {
    const previous = this.#followups.get(agentId);
    const task = (previous === undefined ? Promise.resolve() : previous.then(() => undefined, () => undefined))
      .then(() => this.runFollowup(agentId, content, options));
    this.#followups.set(agentId, task);
    return task.finally(() => {
      if (this.#followups.get(agentId) === task) this.#followups.delete(agentId);
    });
  }

  private async runFollowup(agentId: string, content: RuntimeV2JsonValue, options: AgentFollowupOptions): Promise<RunTurnResult> {
    if (!this.#accepting) throw new AgentRuntimeError("TURN_ABORTED", "Agent service is quiescing.");
    const record = this.#agents.get(agentId);
    if (record === undefined) throw new AgentRuntimeError("AGENT_NOT_FOUND", `Agent ${agentId} is not attached.`);
    const { agent, assembly } = record;
    const target = options.target ?? "next-turn";
    const enqueued = await assembly.inbox.enqueue(content, target, options.messageId);
    await this.emit(assembly, "agent/inbox/inserted", { agentId, sessionId: agent.sessionId, messageId: enqueued.messageId, target, enqueuedSeq: enqueued.enqueuedSeq });
    const claimed = await assembly.inbox.claim(target, 1, { messageId: enqueued.messageId });
    if (!claimed.some((candidate) => candidate.messageId === enqueued.messageId)) throw new Error(`Agent ${agentId} could not claim followup ${enqueued.messageId}.`);
    await this.emit(assembly, "agent/inbox/claimed", { agentId, sessionId: agent.sessionId, messageId: enqueued.messageId, target });
    const { target: _target, messageId: _messageId, ...turnOptions } = options;
    return assembly.loop.runTurn({ ...turnOptions, content, messageId: enqueued.messageId });
  }

  quiesce(): void {
    if (!this.#accepting) return;
    this.#accepting = false;
    for (const { agent } of this.#agents.values()) agent.abort("runtime-shutdown");
  }

  async dispose(): Promise<void> {
    this.quiesce();
    await Promise.all([...this.#agents.values()].map(({ agent }) => agent.dispose()));
  }

  private disposeAgent(agentId: string): Promise<void> {
    const existing = this.#disposing.get(agentId);
    if (existing !== undefined) return existing;
    const record = this.#agents.get(agentId);
    if (record === undefined) return Promise.resolve();
    const task = (async () => {
      this.#agents.delete(agentId);
      record.assembly.loop.quiesce();
      await record.assembly.loop.waitForIdle();
      await this.emit(record.assembly, "agent/disposed", { agentId, sessionId: record.agent.sessionId });
      await record.assembly.dispose();
    })().finally(() => this.#disposing.delete(agentId));
    this.#disposing.set(agentId, task);
    return task;
  }

  private async emit(assembly: AgentLoopAssembly, type: string, payload: AgentEventPayload): Promise<void> {
    const subject = assembly.subject ?? assembly.loop.subject ?? defaultAgentSubject(assembly.scope);
    const dispatcher = createAgentEventDispatcher(this.options.contextProvider?.() ?? this.options.context, assembly.scope, subject);
    await dispatcher.emit(type, payload);
  }
}

/** Cordis owner for loop assemblies, durable followups and quiescent shutdown. */
export class AgentLoopRuntimeService extends Service {
  static inject = Object.freeze(["actspace.agent.factory"]);
  static Config = {
    "~standard": {
      version: 1,
      vendor: "actspace",
      validate(value: unknown) {
        if (value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value))) return { value: value ?? {} };
        return { issues: [{ message: "Agent loop config must be an object." }] };
      },
    },
  };

  readonly runtime: AgentLoopService;

  constructor(ctx: CordisServiceContext, options?: AgentLoopServiceOptions) {
    super(ctx, "agent.loop");
    const resolved = options ?? ctx.get("actspace.agent.factory") as AgentLoopServiceOptions | undefined;
    if (resolved === undefined) throw new Error("Agent Loop Service requires actspace.agent.factory.");
    const cordisContext = ctx as unknown as CordisContext;
    this.runtime = new AgentLoopService({ ...resolved, context: resolved.context ?? cordisContext, contextProvider: resolved.contextProvider ?? (() => cordisContext) });
    ctx.effect(() => () => this.runtime.dispose(), "agent.loop");
  }

  attach(session: SessionHandle): Promise<ManagedAgent> { return this.runtime.attach(session); }
  get(agentId: string): ManagedAgent | undefined { return this.runtime.get(agentId); }
  getAssembly(agentId: string): AgentLoopAssembly | undefined { return this.runtime.getAssembly(agentId); }
  list(): readonly ManagedAgent[] { return this.runtime.list(); }
  followup(agentId: string, content: RuntimeV2JsonValue, options?: AgentFollowupOptions): Promise<RunTurnResult> { return this.runtime.followup(agentId, content, options); }
  quiesce(): void { this.runtime.quiesce(); }
  dispose(): Promise<void> { return this.runtime.dispose(); }
}
