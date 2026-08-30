import type { CordisContext } from "@actspace/cordis-adapter";
import type { CompactionPlugin } from "@actspace/compaction";
import type { LlmMessage, LlmService, LlmUsage } from "@actspace/llm-service";
import type { SessionEventCandidateV1, SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionHandle } from "@actspace/session-persistence";
import type {
  RuntimeV2JsonValue,
  RuntimeV2RunTurnRequest,
  RuntimeV2RunTurnResponse,
  RuntimeV2SessionListItem,
  RuntimeV2SessionSnapshot,
} from "@actspace/shared/runtime-v2";

type SessionService = {
  readonly store: {
    inspect(sessionId: string): Promise<{ readonly header: SessionHandle["header"] | null; readonly events: readonly SessionEventEnvelopeV1[] }>;
    fork(options: {
      readonly parentSessionId: string;
      readonly boundarySeq: number;
      readonly newSessionId: string;
      readonly createdAt: string;
      readonly createdWith: SessionHandle["header"]["createdWith"];
    }): Promise<SessionHandle>;
  };
  create(sessionId?: string, workspaceRoot?: string): Promise<SessionHandle>;
  resume(sessionId: string): Promise<SessionHandle>;
  snapshot(session: SessionHandle): RuntimeV2SessionSnapshot;
  inspect(sessionId: string): Promise<RuntimeV2SessionSnapshot>;
  inspectEvents(sessionId: string): Promise<readonly SessionEventEnvelopeV1[]>;
  list(): Promise<readonly RuntimeV2SessionListItem[]>;
  export(sessionId: string): Promise<string>;
  getOpen(sessionId: string): SessionHandle | undefined;
};

type RunAssembly = {
  readonly session: SessionHandle;
  readonly loop: { readonly active?: boolean; readonly abort: (reason?: string) => boolean };
  readonly inbox: { readonly enqueue: (content: RuntimeV2JsonValue, target: "next-step" | "next-turn", messageId?: string) => Promise<{ readonly messageId: string; readonly target: "next-step" | "next-turn"; readonly enqueuedSeq: number }>; readonly discard: (messageId: string) => Promise<boolean> };
};

type RunService = {
  attach(session: SessionHandle): Promise<RunAssembly>;
  run(sessionId: string, input: { readonly content: RuntimeV2JsonValue; readonly messageId?: string; readonly agentRunId?: string; readonly model?: string; readonly mode?: RuntimeV2RunTurnRequest["mode"]; readonly keepPendingOnAbort?: boolean; readonly selectedSkillIds?: readonly string[] }): Promise<RuntimeV2RunTurnResponse>;
  get(sessionId: string): RunAssembly | undefined;
  rebuild(session: SessionHandle): Promise<RunAssembly>;
};

type AgentRuntimeService = { readonly runs: RunService };

export type DesktopAppServiceContract = {
  readonly listSessions: () => Promise<readonly RuntimeV2SessionListItem[]>;
  readonly inspectSession: (sessionId: string) => Promise<RuntimeV2SessionSnapshot>;
  readonly inspectSessionEvents: (sessionId: string) => Promise<readonly SessionEventEnvelopeV1[]>;
  readonly exportSession: (sessionId: string) => Promise<string>;
  readonly createMainSession: (sessionId?: string, workspaceRoot?: string) => Promise<RuntimeV2SessionSnapshot>;
  readonly resumeMainSession: (sessionId: string) => Promise<RuntimeV2SessionSnapshot>;
  readonly forkMainSession: (parentSessionId: string, boundarySeq: number, newSessionId: string) => Promise<RuntimeV2SessionSnapshot>;
  readonly runTurn: (input: RuntimeV2RunTurnRequest) => Promise<RuntimeV2RunTurnResponse>;
  readonly enqueueMainMessage: (sessionId: string, content: RuntimeV2JsonValue, target: "next-step" | "next-turn", messageId?: string) => Promise<{ readonly messageId: string; readonly target: "next-step" | "next-turn"; readonly enqueuedSeq: number }>;
  readonly cancelPendingMessage: (sessionId: string, messageId: string) => Promise<boolean>;
  readonly abortRun: (sessionId: string, reason?: string) => boolean;
  readonly compactSession: (sessionId: string) => Promise<{ readonly compacted: boolean; readonly snapshot: RuntimeV2SessionSnapshot }>;
  readonly flushSession: (sessionId: string) => Promise<void>;
  readonly updateSessionMetadata: (sessionId: string, patch: { readonly title?: string | null; readonly pinned?: boolean; readonly archived?: boolean }) => Promise<RuntimeV2SessionSnapshot>;
  readonly updateSessionWorkspace: (sessionId: string, workspaceRoot: string) => Promise<RuntimeV2SessionSnapshot>;
  readonly completeText: (input: { readonly messages: readonly LlmMessage[]; readonly model?: string; readonly sessionId?: string; readonly signal?: AbortSignal }) => Promise<{ readonly text: string; readonly model: string; readonly provider: string; readonly usage: LlmUsage; readonly stopReason: string | null }>;
  readonly dispose: () => Promise<void>;
};

export class DesktopAppService implements DesktopAppServiceContract {
  readonly #sessions: SessionService;
  readonly #runs: RunService;
  readonly #compaction: CompactionPlugin;
  readonly #llm: LlmService;
  readonly #manifestDigest: string;

  constructor(ctx: CordisContext) {
    this.#sessions = required(ctx, "session.runtime");
    this.#runs = (required<AgentRuntimeService>(ctx, "agent.runtime")).runs;
    this.#compaction = required(ctx, "compaction.runtime");
    this.#llm = required(ctx, "llm.service");
    this.#manifestDigest = (ctx.get?.("actspace.host.session") as { readonly manifestDigest?: string } | undefined)?.manifestDigest ?? "desktop-app";
  }

  listSessions() { return this.#sessions.list(); }
  inspectSession(sessionId: string) { return this.#sessions.inspect(sessionId); }
  inspectSessionEvents(sessionId: string) { return this.#sessions.inspectEvents(sessionId); }
  exportSession(sessionId: string) { return this.#sessions.export(sessionId); }

  async createMainSession(sessionId?: string, workspaceRoot?: string): Promise<RuntimeV2SessionSnapshot> {
    const session = await this.#sessions.create(sessionId, workspaceRoot);
    await this.#runs.attach(session);
    return this.#sessions.snapshot(session);
  }

  async resumeMainSession(sessionId: string): Promise<RuntimeV2SessionSnapshot> {
    const session = await this.#sessions.resume(sessionId);
    if (session.header.lineage?.origin === "delegation") throw new Error("Child Sessions cannot be resumed through DesktopAppService.");
    await this.#runs.attach(session);
    return this.#sessions.snapshot(session);
  }

  async forkMainSession(parentSessionId: string, boundarySeq: number, newSessionId: string): Promise<RuntimeV2SessionSnapshot> {
    const parent = await this.#sessions.store.inspect(parentSessionId);
    if (parent.header === null) throw new Error(`Parent Session ${parentSessionId} has no header.`);
    const session = await this.#sessions.store.fork({
      parentSessionId,
      boundarySeq,
      newSessionId,
      createdAt: new Date().toISOString(),
      createdWith: { ...parent.header.createdWith, manifestDigest: this.#manifestDigest },
    });
    await this.#runs.attach(session);
    return this.#sessions.snapshot(session);
  }

  async runTurn(input: RuntimeV2RunTurnRequest): Promise<RuntimeV2RunTurnResponse> {
    const session = await this.#sessions.resume(input.sessionId);
    if (this.#sessions.snapshot(session).metadata.title === null) {
      const title = titleFromContent(input.content);
      if (title !== null) await session.append(core("session/title-set", { title }));
    }
    return this.#runs.run(input.sessionId, {
      content: input.content,
      messageId: input.messageId,
      agentRunId: input.agentRunId,
      model: input.model,
      mode: input.mode,
      keepPendingOnAbort: input.keepPendingOnAbort,
      selectedSkillIds: input.selectedSkillIds,
    });
  }

  async enqueueMainMessage(sessionId: string, content: RuntimeV2JsonValue, target: "next-step" | "next-turn", messageId?: string) {
    const session = await this.#sessions.resume(sessionId);
    const agent = await this.#runs.attach(session);
    return agent.inbox.enqueue(content, target, messageId);
  }

  async cancelPendingMessage(sessionId: string, messageId: string) {
    const session = await this.#sessions.resume(sessionId);
    return (await this.#runs.attach(session)).inbox.discard(messageId);
  }

  abortRun(sessionId: string, reason?: string) { return this.#runs.get(sessionId)?.loop.abort(reason) ?? false; }

  async compactSession(sessionId: string) {
    const assembly = this.#runs.get(sessionId);
    if (assembly?.loop.active) throw new Error("Cannot compact a Session while its Agent turn is active.");
    const session = await this.#sessions.resume(sessionId);
    const compacted = await this.#compaction.compact(session);
    return Object.freeze({ compacted, snapshot: this.#sessions.snapshot(session) });
  }

  async flushSession(sessionId: string): Promise<void> {
    const session = this.#sessions.getOpen(sessionId);
    if (session === undefined) throw new Error(`Session ${sessionId} is not open.`);
    await session.flush();
  }

  async updateSessionMetadata(sessionId: string, patch: { readonly title?: string | null; readonly pinned?: boolean; readonly archived?: boolean }) {
    const session = await this.#sessions.resume(sessionId);
    const events: SessionEventCandidateV1[] = [];
    if (patch.title !== undefined) events.push(core("session/title-set", { title: patch.title === null ? null : patch.title.trim().slice(0, 160) || null }));
    if (patch.pinned !== undefined) events.push(core("session/pinned-set", { pinned: patch.pinned }));
    if (patch.archived !== undefined) events.push(core("session/archived-set", { archived: patch.archived }));
    if (events.length > 0) { await session.appendMany(events); await session.flush(); }
    return this.#sessions.snapshot(session);
  }

  async updateSessionWorkspace(sessionId: string, workspaceRoot: string) {
    const next = workspaceRoot.trim();
    if (!next) throw new Error("workspaceRoot must not be empty.");
    const existing = this.#runs.get(sessionId);
    if (existing?.loop.active) throw new Error("Cannot change workspace while an Agent turn is active.");
    const session = await this.#sessions.resume(sessionId);
    await session.append(core("session/workspace-set", { workspaceRoot: next }));
    await session.flush();
    await this.#runs.rebuild(session);
    return this.#sessions.snapshot(session);
  }

  async completeText(input: { readonly messages: readonly LlmMessage[]; readonly model?: string; readonly sessionId?: string; readonly signal?: AbortSignal }) {
    const model = input.model ?? "default";
    const routeId = this.#llm.routes.list()[0]?.routeId ?? "default";
    const prepared = this.#llm.prepare({ routeId, model, messages: input.messages, ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }), ...(input.signal === undefined ? {} : { signal: input.signal }) });
    let text = "";
    let usage: LlmUsage = { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cost: null, costCurrency: null, source: "unknown" };
    let stopReason: string | null = null;
    try {
      const stream = await prepared.dispatch();
      for await (const event of stream) {
        if (event.type === "text-delta") text += event.text;
        if (event.type === "error") throw new Error(event.failure.message);
        if (event.type === "aborted") throw new Error(event.reason || "LLM request was aborted.");
        if (event.type === "done") {
          usage = event.usage;
          stopReason = event.stopReason;
          if (!text) text = event.content.filter((block) => block.type === "text").map((block) => block.text).join("");
        }
      }
    } finally { prepared.release(); }
    return Object.freeze({ text, model, provider: routeId, usage, stopReason });
  }

  async dispose(): Promise<void> { return undefined; }
}

function required<T>(ctx: CordisContext, id: string): T {
  const value = ctx.get?.(id) as T | undefined;
  if (value === undefined) throw new Error(`Desktop app requires ${id}.`);
  return value;
}

function titleFromContent(value: RuntimeV2JsonValue): string | null {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value.flatMap((item) => item !== null && typeof item === "object" && !Array.isArray(item) && item.type === "text" && typeof item.text === "string" ? [item.text] : []).join(" ") : "";
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.length <= 48 ? normalized : `${normalized.slice(0, 47)}...`;
}

function core(type: string, data: RuntimeV2JsonValue): SessionEventCandidateV1 { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never; }
