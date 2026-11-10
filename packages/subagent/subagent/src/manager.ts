import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { MainAgentInbox } from "@actspace/agent";
import type { AgentLoop } from "@actspace/agent-loop";
import type { AgentScope } from "@actspace/scope";
import type { ModelsHostPort } from "@actspace/shared";
import {
  BACKGROUND_WAKE_KIND, EMPTY_SUBAGENT_TREE, CONTEXT_TRACE_DETAIL_LABEL, lastActivationModel, listedSubagents, reduceSubagentTree, runningActivation,
  type RuntimeV2AgentMode, type RuntimeV2JsonValue, type SubagentActivationStatus, type SubagentKind, type SubagentPreset, type SubagentTree, type SubagentView,
} from "@actspace/shared/runtime-v2";
import { FORKED_SUBAGENT_PRESET_ID, resolveSessionWorkspaceRoot, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { applySessionRecovery, type SessionHandle, type SessionStore } from "@actspace/session-persistence";
import { createChildSession } from "./child-session.js";
import { firstErrorLine, type ExternalRun, type ExternalRunResult, type ExternalSubagentBackend, type SpawnExternalInput } from "./external.js";
import { resolveForkBoundary } from "./fork-boundary.js";
import {
  agentMessage, backgroundStarted, blockedTool, CANNOT_MESSAGE_SELF, EXTERNAL_LOG_WAIT_MS, externalCannotReceive, externalStartFailed, INPUT_ARRIVED, interruptRequested, messageDelivered,
  movedToBackground, notRunning, settleSummary, SUBAGENT_CONCURRENCY_LIMIT, SUBAGENT_LIMIT_REACHED, SUBAGENT_MAX_STEPS, SUBAGENT_SYNC_WAIT_MS,
  subagentNotification, syncResult, taskGuidance, truncateUtf8, unknownAgent, unknownEffort, unknownModel, waitTimedOut, type AgentRelation,
} from "./messages.js";
import { EXPLORE_TOOL_NAMES, SUBAGENT_COORDINATION_TOOL_NAMES, subagentToolNames } from "./preset.js";
import type { RunningSubagent, SpawnForkInput, SpawnSubagentInput, SubagentCaller, SubagentHostPort, SubagentToolOutcome } from "./types.js";

export type ChildLoop = Pick<AgentLoop, "runTurn" | "abort" | "waitForIdle" | "quiesce">;
/**
 * A `subagent` Loop is assembled like a child (its own prompt, no main-only sources); a `fork`
 * Loop is assembled like its main agent, so its first request reuses the parent's prompt cache (design 02 §8.4).
 */
export type ChildLoopInput = {
  readonly session: SessionHandle;
  readonly scope: AgentScope;
  readonly agentId: string;
  readonly description: string;
  readonly allowedToolNames: readonly string[];
  readonly maxSteps: number;
  readonly signal: AbortSignal;
} & ({ readonly role: "subagent"; readonly preset: SubagentPreset } | { readonly role: "fork" });

/** One Harness lease holding a child Run: the TaskLedger entry and the Loop factory of the caller's generation. */
export type ChildRunLease = {
  readonly scope: AgentScope;
  start(session: SessionHandle, content: RuntimeV2JsonValue, runId: string): Promise<{ readonly messageId: string }>;
  createLoop(input: ChildLoopInput): Promise<ChildLoop>;
  finish(outcome: "completed" | "cancelled" | "failed", value: RuntimeV2JsonValue): Promise<void>;
  release(): Promise<void>;
};

export type SubagentModelConfiguration = { readonly model?: string; readonly thinkingEnabled?: boolean; readonly reasoningEffort?: string };
/** The main agent's current settings; a fork's first Turn also takes its selected skills, which are part of the system prompt. */
export type ParentConfiguration = SubagentModelConfiguration & { readonly selectedSkillIds?: readonly string[] };

export type SubagentManagerOptions = {
  readonly store: SessionStore;
  readonly manifestDigest: string;
  readonly plugins: readonly { readonly id: string; readonly version: string }[];
  /** A main Session, opened when it is not live. */
  readonly openSession: (sessionId: string) => Promise<SessionHandle>;
  /** Live main Sessions and live child Sessions (registered while an activation runs). */
  readonly getOpenSession: (sessionId: string) => SessionHandle | undefined;
  readonly acquireRun: (input: { readonly scope: AgentScope; readonly signal: AbortSignal }) => Promise<ChildRunLease>;
  readonly transcriptPath: (sessionId: string) => string;
  readonly refreshTranscript: (sessionId: string) => Promise<void>;
  readonly models: () => ModelsHostPort;
  /** The main agent's current model settings (not its request headers). */
  readonly parentConfiguration: (sessionId: string) => ParentConfiguration;
  readonly permissionMode: (session: SessionHandle) => string;
  readonly isSessionRunning: (sessionId: string) => boolean;
  /** A user message is queued for this Session. */
  readonly hasQueuedInput: (sessionId: string) => boolean;
  readonly wake: (sessionId: string) => void;
  readonly onError?: (error: unknown) => void;
  readonly now?: () => Date;
  /** Tests only. */
  readonly syncWaitMs?: number;
  readonly limit?: number;
  readonly maxSteps?: number;
  readonly pollMs?: number;
  readonly externalLogWaitMs?: number;
};

type Settled = { readonly status: SubagentActivationStatus; readonly error?: string; readonly text: string; readonly truncated: boolean };

type Activation = {
  readonly rootId: string;
  readonly agentId: string;
  readonly activationId: string;
  readonly description: string;
  readonly kind: SubagentKind;
  /** `local` only. */
  readonly preset?: SubagentPreset;
  /** An external run's record path is known only once its CLI has started. */
  transcriptPath: string;
  readonly toolNames: readonly string[];
  readonly model: SubagentModelConfiguration;
  /** A fork's first Turn runs with the parent's selected skills. */
  readonly selectedSkillIds?: readonly string[];
  readonly controller: AbortController;
  /** `caller`: a synchronous `agent` call is waiting; `parent`: notify the main Session; `dropped`: the main Session rewound past it, tell no one. */
  delivery: "caller" | "parent" | "dropped";
  /** Set inside the child lock when settlement starts; later messages become a new activation. */
  settling: boolean;
  settled: boolean;
  child?: SessionHandle;
  lease?: ChildRunLease;
  scope?: AgentScope;
  admitted: boolean;
  startSeq: number;
  readonly ready: Deferred<void>;
  readonly result: Deferred<Settled>;
};

/** A wake activation opens with the claimed inbox message; its ledger task carries no user input. */
type FirstTurn = { readonly content: string } | { readonly wake: true };

const TREE = Symbol("actspace.subagent.tree");
const POLL_MS = 200;

/**
 * Host-owned scheduler of `local` subagents (design 02): creation, continuation, steering,
 * interruption, completion notices and restart recovery. All state is folded from the main
 * Session's `subagent/*` events; only running activations live in memory.
 */
export class SubagentManager implements SubagentHostPort {
  readonly #active = new Map<string, Activation>();
  readonly #runs = new Set<Promise<void>>();
  readonly #lock = new ChildLock();
  #disposing = false;

  constructor(private readonly options: SubagentManagerOptions) {}

  async spawn(input: SpawnSubagentInput): Promise<SubagentToolOutcome> {
    const caller = await this.#caller(input);
    if (!caller.ok) return caller.outcome;
    if (!caller.isRoot) return fail("SUBAGENT_BLOCKED", blockedTool("agent"));
    if (!caller.scope) return fail("PARENT_AGENT_UNAVAILABLE", `Parent Agent for Session ${input.sessionId} is unavailable.`);
    const model = this.#chooseModel(caller.rootId, input.model, input.reasoningEffort, true);
    if (!model.ok) return model.outcome;
    if (this.#running(caller.rootId) >= this.#limit) return fail("SUBAGENT_LIMIT", SUBAGENT_LIMIT_REACHED);
    const agentId = randomUUID();
    const transcriptPath = this.options.transcriptPath(agentId);
    const toolNames = subagentToolNames(input.preset, input.parentToolNames, input.registeredToolNames);
    const activation = this.#reserve({ rootId: caller.rootId, agentId, description: input.description, kind: "local", preset: input.preset, transcriptPath, toolNames, model: model.config, delivery: input.background ? "parent" : "caller" });
    const root = caller.root;
    try {
      const workspaceRoot = resolveSessionWorkspaceRoot(root.header, root.journal);
      activation.child = await createChildSession({ store: this.options.store, parent: root, parentCallId: input.callId, childSessionId: agentId, createdAt: this.#now(), ...(workspaceRoot ? { cwd: workspaceRoot } : {}), prompt: input.prompt, presetId: `actspace.subagent.${input.preset}`, manifestDigest: this.options.manifestDigest, plugins: this.options.plugins, onEvent: event => this.#observe(activation, event) });
      await root.append(coreEvent("subagent/spawned", { agentId, callId: input.callId, kind: "local", preset: input.preset, description: input.description, transcriptPath, createdAt: this.#now(), toolNames: [...toolNames] }));
      await root.append(coreEvent("subagent/activation", startData(activation, { trigger: "spawn", callId: input.callId, background: input.background, startedAt: this.#now() })));
      await root.flush();
    } catch (error) {
      this.#active.delete(agentId);
      await activation.child?.close().catch(report(this.options.onError));
      return fail("SUBAGENT_FAILED", errorText(error));
    }
    this.#begin(activation, caller.scope, { content: `${input.prompt}\n\n${taskGuidance(transcriptPath, input.preset)}` });
    // The transcript must exist with the task message before the path is handed out (design 02 §6.3).
    await Promise.race([activation.ready.promise, activation.result.promise]);
    await this.#refresh(agentId);
    const detail = details({ agentId, description: input.description, kind: "local", preset: input.preset, transcriptPath, background: input.background });
    if (input.background) return ok(backgroundStarted({ agentId, description: input.description, transcriptPath }), detail);
    return this.#awaitSync(activation, input.signal, detail);
  }

  /**
   * `agent_fork` (design 02 §8): copy the main Session up to the last completed step before this
   * call, close the copied Turn, and run the fork like the main agent so its first request hits the cache.
   */
  async spawnFork(input: SpawnForkInput): Promise<SubagentToolOutcome> {
    const caller = await this.#caller(input);
    if (!caller.ok) return caller.outcome;
    if (!caller.isRoot) return fail("SUBAGENT_BLOCKED", blockedTool("agent_fork"));
    if (!caller.scope) return fail("PARENT_AGENT_UNAVAILABLE", `Parent Agent for Session ${input.sessionId} is unavailable.`);
    // Without a model the fork keeps the parent's model, thinking and effort; the default subagent model would lose the cache.
    const model = this.#chooseModel(caller.rootId, input.model, input.reasoningEffort, false);
    if (!model.ok) return model.outcome;
    if (this.#running(caller.rootId) >= this.#limit) return fail("SUBAGENT_LIMIT", SUBAGENT_LIMIT_REACHED);
    const root = caller.root;
    // The copy is read from storage: everything up to this call must be durable first.
    await root.flush();
    let boundary: ReturnType<typeof resolveForkBoundary>;
    try { boundary = resolveForkBoundary(root.journal.readEvents(), this.options.store.options.registry, input.callId); }
    catch (error) { return fail("FORK_UNAVAILABLE", errorText(error)); }
    const agentId = randomUUID();
    const transcriptPath = this.options.transcriptPath(agentId);
    const toolNames = Object.freeze([...new Set(input.parentToolNames)].sort());
    const { selectedSkillIds } = this.options.parentConfiguration(caller.rootId);
    const activation = this.#reserve({ rootId: caller.rootId, agentId, description: input.description, kind: "fork", transcriptPath, toolNames, model: model.config, ...(selectedSkillIds?.length ? { selectedSkillIds: [...selectedSkillIds] } : {}), delivery: input.background ? "parent" : "caller" });
    try {
      const createdWith = { ...root.header.createdWith, presetId: FORKED_SUBAGENT_PRESET_ID, manifestDigest: this.options.manifestDigest, plugins: this.options.plugins, codecSetDigest: this.options.store.options.registry.digest };
      const child = await this.options.store.fork({ parentSessionId: caller.rootId, boundarySeq: boundary.boundarySeq, newSessionId: agentId, createdAt: this.#now(), createdWith, origin: "delegation", parentCallId: input.callId }, { onEvent: event => this.#observe(activation, event) });
      activation.child = child;
      // The copied Turn belongs to the parent: close it, and drop the parent's queued notices so the fork never claims them.
      await child.append(coreEvent("turn/end", { turnId: boundary.turnId, reason: "forked" }));
      const inbox = new MainAgentInbox(child);
      for (const item of inbox.pending()) await inbox.discard(item.messageId, "forked");
      await child.flush();
      await root.append(coreEvent("subagent/spawned", { agentId, callId: input.callId, kind: "fork", description: input.description, transcriptPath, createdAt: this.#now(), inheritedThroughSeq: boundary.boundarySeq, toolNames: [...toolNames] }));
      await root.append(coreEvent("subagent/activation", startData(activation, { trigger: "spawn", callId: input.callId, background: input.background, startedAt: this.#now() })));
      await root.flush();
    } catch (error) {
      this.#active.delete(agentId);
      await activation.child?.close().catch(report(this.options.onError));
      return fail("SUBAGENT_FAILED", errorText(error));
    }
    this.#begin(activation, caller.scope, { content: `${input.prompt}\n\n${taskGuidance(transcriptPath, "fork")}` });
    await Promise.race([activation.ready.promise, activation.result.promise]);
    await this.#refresh(agentId);
    const detail = details({ agentId, description: input.description, kind: "fork", transcriptPath, background: input.background, inheritedThroughSeq: boundary.boundarySeq });
    if (input.background) return ok(backgroundStarted({ agentId, description: input.description, transcriptPath, forked: true }), detail);
    return this.#awaitSync(activation, input.signal, detail);
  }

  /**
   * `agent_codex` / `agent_claude_code` (design 04): run the CLI once in the workspace. It shares the limit,
   * events, notices and `list_agents` with local subagents; its record is the CLI's own session log.
   */
  async spawnExternal(backend: ExternalSubagentBackend, input: SpawnExternalInput): Promise<SubagentToolOutcome> {
    const caller = await this.#caller(input);
    if (!caller.ok) return caller.outcome;
    if (!caller.isRoot) return fail("SUBAGENT_BLOCKED", blockedTool(backend.toolName));
    if (this.#running(caller.rootId) >= this.#limit) return fail("SUBAGENT_LIMIT", SUBAGENT_LIMIT_REACHED);
    const root = caller.root;
    const cwd = resolveSessionWorkspaceRoot(root.header, root.journal);
    if (!cwd) return fail("WORKSPACE_UNAVAILABLE", `Session ${caller.rootId} has no workspace.`);
    const agentId = randomUUID();
    const { kind, label } = backend;
    const activation = this.#reserve({ rootId: caller.rootId, agentId, description: input.description, kind, transcriptPath: "", toolNames: [], model: input.model ? { model: input.model } : {}, delivery: input.background ? "parent" : "caller" });
    let run: ExternalRun;
    try {
      run = await backend.start({ prompt: input.prompt, cwd, ...(input.model ? { model: input.model } : {}), signal: activation.controller.signal });
    } catch (error) {
      this.#active.delete(agentId);
      return fail("SUBAGENT_FAILED", externalStartFailed(label, firstErrorLine(error)));
    }
    const transcriptPath = activation.transcriptPath = run.transcriptPath;
    try {
      await root.append(coreEvent("subagent/spawned", { agentId, callId: input.callId, kind, description: input.description, transcriptPath, createdAt: this.#now() }));
      await root.append(coreEvent("subagent/activation", startData(activation, { trigger: "spawn", callId: input.callId, background: input.background, startedAt: this.#now() })));
      await root.flush();
    } catch (error) {
      this.#active.delete(agentId);
      await run.interrupt().catch(report(this.options.onError));
      return fail("SUBAGENT_FAILED", errorText(error));
    }
    this.#track(this.#runExternal(activation, run));
    // The path joins the active paths only once the CLI has written the file (design 04 §3.3).
    const logReady = await waitForFile(transcriptPath, activation.result.promise, this.options.externalLogWaitMs ?? EXTERNAL_LOG_WAIT_MS);
    const detail = details({ agentId, description: input.description, kind, transcriptPath, background: input.background, trace: logReady });
    const text = { external: label, logMissing: !logReady };
    if (input.background) return ok(backgroundStarted({ agentId, description: input.description, transcriptPath, ...text }), detail);
    return this.#awaitSync(activation, input.signal, detail, text);
  }

  async sendMessage(input: SubagentCaller & { readonly agentId: string; readonly message: string }): Promise<SubagentToolOutcome> {
    const caller = await this.#caller(input);
    if (!caller.ok) return caller.outcome;
    const target = input.agentId;
    if (target === input.sessionId) return fail("INVALID_TARGET", CANNOT_MESSAGE_SELF);
    const root = caller.root, rootId = caller.rootId;
    const tree = subagentTree(root);
    if (target === rootId) {
      const sender = tree.agents[input.sessionId];
      const running = this.options.isSessionRunning(rootId);
      await new MainAgentInbox(root).enqueue(agentMessage(input.sessionId, "child", input.message), { taskId: input.sessionId, kind: "agent_message", title: sender?.description ?? input.sessionId, status: "message" }, { source: "agent_message", senderId: input.sessionId });
      await root.flush();
      this.options.wake(rootId);
      return ok(messageDelivered(rootId, !running));
    }
    const view = tree.agents[target];
    if (!view || view.legacy) return fail("UNKNOWN_AGENT", unknownAgent(target));
    if (view.kind === "codex" || view.kind === "claude-code") return fail("SUBAGENT_CLOSED", externalCannotReceive(target));
    const relation: AgentRelation = caller.isRoot ? "parent" : "sibling";
    const content = agentMessage(input.sessionId, relation, input.message);
    return this.#lock.run(target, async () => {
      const active = this.#active.get(target);
      if (active && !active.settling && active.child) {
        await new MainAgentInbox(active.child).enqueue(content, undefined, { source: "agent_message", senderId: input.sessionId });
        return ok(messageDelivered(target, false));
      }
      return this.#continue(view, { caller, callId: input.callId, senderId: input.sessionId, content });
    });
  }

  async waitForInput(input: SubagentCaller & { readonly timeoutMs: number; readonly signal: AbortSignal }): Promise<SubagentToolOutcome> {
    const session = this.options.getOpenSession(input.sessionId);
    if (!session) return fail("SESSION_UNAVAILABLE", `Session ${input.sessionId} is unavailable.`);
    const arrived = () => new MainAgentInbox(session).hasPendingNotifications() || this.options.hasQueuedInput(input.sessionId);
    if (arrived()) return ok(INPUT_ARRIVED);
    return new Promise<SubagentToolOutcome>(resolve => {
      const finish = (outcome: SubagentToolOutcome) => { clearInterval(poll); clearTimeout(timer); input.signal.removeEventListener("abort", abort); resolve(outcome); };
      const poll = setInterval(() => { try { if (arrived()) finish(ok(INPUT_ARRIVED)); } catch (error) { finish(fail("WAIT_FAILED", errorText(error))); } }, this.options.pollMs ?? POLL_MS);
      const timer = setTimeout(() => finish(ok(waitTimedOut(input.timeoutMs))), input.timeoutMs);
      const abort = () => finish(fail("TOOL_ABORTED", "The wait was cancelled."));
      input.signal.addEventListener("abort", abort, { once: true });
      if (input.signal.aborted) abort();
    });
  }

  async listAgents(input: SubagentCaller): Promise<SubagentToolOutcome> {
    const caller = await this.#caller(input);
    if (!caller.ok) return caller.outcome;
    const marker = (id: string) => id === input.sessionId ? " (you)" : !caller.isRoot && id === caller.rootId ? " (parent)" : "";
    const lines = [`${caller.rootId} [${this.options.isSessionRunning(caller.rootId) ? "running" : "inactive"}]${marker(caller.rootId)}`];
    for (const agent of listedSubagents(subagentTree(caller.root))) {
      lines.push(`${agent.agentId} [${agent.status}]${marker(agent.agentId)} ${agentSummary(agent)} — ${agent.description}`);
      lines.push(`  transcript: ${agent.transcriptPath}`);
    }
    return ok(lines.join("\n"));
  }

  async interrupt(input: SubagentCaller & { readonly agentId: string }): Promise<SubagentToolOutcome> {
    const caller = await this.#caller(input);
    if (!caller.ok) return caller.outcome;
    const view = subagentTree(caller.root).agents[input.agentId];
    if (!view || view.legacy) return fail("UNKNOWN_AGENT", unknownAgent(input.agentId));
    const active = this.#active.get(input.agentId);
    if (!active || active.rootId !== caller.rootId || active.settling) return ok(notRunning(input.agentId));
    active.controller.abort("interrupt");
    return ok(interruptRequested(input.agentId));
  }

  async listModels(input: SubagentCaller): Promise<SubagentToolOutcome> {
    const caller = await this.#caller(input);
    if (!caller.ok) return caller.outcome;
    const port = this.options.models();
    const models = port.listUsableModels();
    const setting = port.subagentDefaultModel();
    const parent = this.options.parentConfiguration(caller.rootId).model;
    const lines = [setting && models.some(model => model.key === setting)
      ? `Default subagent model: ${setting}`
      : `Default subagent model: follows your current model${parent ? ` (${parent})` : ""}`];
    for (const model of models) {
      const efforts = model.reasoningEfforts.length ? ` · efforts: ${model.reasoningEfforts.join(", ")}${model.defaultEffort ? ` (default ${model.defaultEffort})` : ""}` : "";
      lines.push(`- ${model.key} — ${model.label}${model.connectionLabel ? ` · ${model.connectionLabel}` : ""}${efforts}`);
    }
    return ok(lines.join("\n"));
  }

  running(sessionId: string): readonly RunningSubagent[] {
    const root = this.options.getOpenSession(sessionId);
    if (!root || root.header.lineage?.origin === "delegation") return [];
    return listedSubagents(subagentTree(root)).flatMap(agent => {
      const current = agent.status === "running" ? runningActivation(agent) : undefined;
      return current ? [{ agentId: agent.agentId, description: agent.description, label: agentLabel(agent), startedAt: current.startedAt, transcriptPath: agent.transcriptPath }] : [];
    }).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  /** The subagent tree of a main Session, for the UI. */
  tree(root: SessionHandle): SubagentTree { return subagentTree(root); }

  /** Running activations of one main Session, as the limit counts them. */
  runningCount(rootId: string): number { return this.#running(rootId); }

  /**
   * When a main Session opens: an activation that started but never settled and is not
   * running in this process was cut off by an exit. Record it as lost and tell the main agent.
   */
  async recoverLost(root: SessionHandle): Promise<void> {
    if (root.header.lineage?.origin === "delegation") return;
    for (const agent of listedSubagents(subagentTree(root))) {
      const open = runningActivation(agent);
      if (!open || this.#active.get(agent.agentId)?.activationId === open.activationId) continue;
      const summary = settleSummary({ agentId: agent.agentId, description: agent.description, status: "lost", external: isExternal(agent.kind) });
      await root.append(coreEvent("subagent/activation", { op: "settle", agentId: agent.agentId, activationId: open.activationId, status: "lost", summary, delivery: "lost", endedAt: this.#now() }));
      await new MainAgentInbox(root).enqueue(subagentNotification({ agentId: agent.agentId, description: agent.description, status: "lost", summary, transcriptPath: agent.transcriptPath }), { taskId: agent.agentId, kind: "subagent", title: agent.description, status: "lost" }, { source: "subagent_notification" });
    }
  }

  /**
   * The main Session is rewinding (agent-edit-resend-rewind.md §3.2): stop its running activations and wait until
   * each has settled. They settle with `delivery: "lost"`, without a notice or a wake. One already settling keeps its delivery.
   */
  async stopAll(rootId: string): Promise<void> {
    const stopping = [...this.#active.values()].filter(activation => activation.rootId === rootId);
    for (const activation of stopping) {
      if (!activation.settling) activation.delivery = "dropped";
      activation.controller.abort("rewind");
    }
    await Promise.all(stopping.map(activation => activation.result.promise));
  }

  /** Host shutdown: stop every activation without settling it, so the next start reports it as lost. */
  async dispose(): Promise<void> {
    this.#disposing = true;
    for (const activation of this.#active.values()) activation.controller.abort("host-shutdown");
    await Promise.allSettled([...this.#runs]);
  }

  get activeCount(): number { return this.#active.size; }

  // ---- activation lifecycle ----

  /** Continue an idle subagent with a message: reopen its Session and start a new activation. Runs inside its child lock. */
  async #continue(view: SubagentView, input: { readonly caller: ResolvedCaller; readonly callId: string; readonly senderId: string; readonly content: string }): Promise<SubagentToolOutcome> {
    const { caller } = input;
    const scope = caller.scope;
    if (!scope) return fail("PARENT_AGENT_UNAVAILABLE", `Agent ${input.senderId} is unavailable.`);
    if (this.#running(caller.rootId) >= this.#limit) return fail("SUBAGENT_LIMIT", SUBAGENT_LIMIT_REACHED);
    const last = [...view.activations].reverse().find(item => item.model);
    const kind = view.kind === "fork" ? "fork" : "local";
    const model: SubagentModelConfiguration = last?.model
      ? { model: last.model, ...(last.reasoningEffort ? { reasoningEffort: last.reasoningEffort, thinkingEnabled: true } : {}) }
      : this.#defaultModel(caller.rootId, kind === "local");
    const toolNames = view.toolNames ?? Object.freeze([...EXPLORE_TOOL_NAMES, ...SUBAGENT_COORDINATION_TOOL_NAMES]);
    const activation = this.#reserve({ rootId: caller.rootId, agentId: view.agentId, description: view.description, kind, ...(kind === "local" ? { preset: view.preset ?? "general" } : {}), transcriptPath: view.transcriptPath, toolNames, model, delivery: "parent" });
    try {
      activation.child = await this.options.store.open(view.agentId, { onEvent: event => this.#observe(activation, event) });
      // An activation cut off by an exit left its Turn open; close it the way a main Session is repaired.
      await applySessionRecovery(activation.child);
      await new MainAgentInbox(activation.child).enqueue(input.content, undefined, { source: "agent_message", senderId: input.senderId });
      await caller.root.append(coreEvent("subagent/activation", startData(activation, { trigger: "message", senderId: input.senderId, callId: input.callId, background: true, startedAt: this.#now() })));
      await caller.root.flush();
    } catch (error) {
      this.#active.delete(view.agentId);
      await activation.child?.close().catch(report(this.options.onError));
      return fail("SUBAGENT_FAILED", errorText(error));
    }
    this.#begin(activation, scope, { wake: true });
    void Promise.race([activation.ready.promise, activation.result.promise]).then(() => this.#refresh(view.agentId));
    return ok(messageDelivered(view.agentId, true));
  }

  #reserve(input: Pick<Activation, "rootId" | "agentId" | "description" | "kind" | "preset" | "transcriptPath" | "toolNames" | "model" | "selectedSkillIds" | "delivery">): Activation {
    const activation: Activation = { ...input, activationId: randomUUID(), controller: new AbortController(), settling: false, settled: false, admitted: false, startSeq: -1, ready: deferred(), result: deferred() };
    this.#active.set(input.agentId, activation);
    return activation;
  }

  #begin(activation: Activation, scope: AgentScope, first: FirstTurn): void {
    this.#track(this.#run(activation, scope, first));
  }

  /** Shutdown waits for every tracked run. */
  #track(work: Promise<void>): void {
    const run = work.catch(report(this.options.onError));
    this.#runs.add(run);
    void run.finally(() => this.#runs.delete(run));
  }

  /** Wait for the CLI to exit; stopping the activation stops the process. Settles under the child lock. */
  async #runExternal(activation: Activation, run: ExternalRun): Promise<void> {
    const { controller } = activation;
    const stop = () => { void run.interrupt().catch(report(this.options.onError)); };
    controller.signal.addEventListener("abort", stop, { once: true });
    if (controller.signal.aborted) stop();
    let result: ExternalRunResult;
    try { result = await run.result; }
    catch (error) { result = { status: "failed", text: "", error: firstErrorLine(error) }; }
    finally { controller.signal.removeEventListener("abort", stop); }
    const status = controller.signal.aborted && result.status !== "completed" ? "interrupted" : result.status;
    const outcome = status === "failed" ? { status, error: result.error ?? "unknown error" } : { status };
    await this.#lock.run(activation.agentId, () => this.#settle(activation, undefined, outcome, result.text));
  }

  /** Set up the Run, drive Turns until no message is left, then settle under the child lock. */
  async #run(activation: Activation, parentScope: AgentScope, first: FirstTurn): Promise<void> {
    const { agentId, controller } = activation;
    const child = activation.child!;
    let finalText = "";
    let loop: ChildLoop | undefined;
    try {
      const root = await this.options.openSession(activation.rootId);
      await child.append(coreEvent("permission/mode-set", { mode: this.options.permissionMode(root), changedAt: this.#now(), source: "parent" }));
      activation.startSeq = child.lastSeq;
      controller.signal.throwIfAborted();
      const lease = await this.options.acquireRun({ scope: parentScope, signal: controller.signal });
      activation.lease = lease;
      const accepted = await lease.start(child, "content" in first ? first.content : { kind: BACKGROUND_WAKE_KIND }, activation.activationId);
      activation.admitted = true;
      activation.scope = lease.scope.child(agentId);
      const common = { session: child, scope: activation.scope, agentId, description: activation.description, allowedToolNames: activation.toolNames, maxSteps: this.options.maxSteps ?? SUBAGENT_MAX_STEPS, signal: controller.signal };
      loop = await lease.createLoop(activation.kind === "fork" ? { ...common, role: "fork" } : { ...common, role: "subagent", preset: activation.preset ?? "general" });
      // A fork stays in the Agent mode of the Turn it was cut from: the copied `turn/start` is its latest until it runs its own.
      const mode = activation.kind === "fork" ? latestTurnMode(child) : undefined;
      const configuration = { agentRunId: activation.activationId, ...modelInput(activation.model), ...(mode ? { mode } : {}) };
      let turn = await loop.runTurn("content" in first ? { ...configuration, ...(activation.selectedSkillIds ? { selectedSkillIds: activation.selectedSkillIds } : {}), content: first.content, messageId: accepted.messageId } : { ...configuration, content: "", wake: true });
      finalText = turn.finalText;
      for (;;) {
        // Deciding and settling happen in one lock section: a message that arrives after the last step
        // starts another Turn, and one that arrives later sees the subagent already inactive (a continuation).
        const current = turn;
        const again = await this.#lock.run(agentId, async () => {
          if (current.reason === "completed" && !controller.signal.aborted && new MainAgentInbox(child).hasPendingNotifications()) return true;
          await this.#settle(activation, loop, turnOutcome(current.reason), finalText);
          return false;
        });
        if (!again) return;
        turn = await loop.runTurn({ ...configuration, content: "", wake: true });
        if (turn.steps > 0) finalText = turn.finalText;
      }
    } catch (error) {
      if (activation.settled) throw error;
      const outcome = controller.signal.aborted ? { status: "interrupted" as const } : { status: "failed" as const, error: errorText(error) };
      await this.#lock.run(agentId, () => this.#settle(activation, loop, outcome, finalText));
    }
  }

  /** Record the end of an activation, deliver its result and free its resources. Runs inside the child lock and never throws. */
  async #settle(activation: Activation, loop: ChildLoop | undefined, outcome: { readonly status: SubagentActivationStatus; readonly error?: string }, finalText: string): Promise<void> {
    const { agentId, rootId, child } = activation;
    const onError = report(this.options.onError);
    activation.settling = true;
    activation.settled = true;
    if (loop) { try { loop.quiesce(); await loop.waitForIdle(); } catch (error) { onError(error); } }
    let omitted = false;
    try { omitted = child ? closingOmitted(child, activation.startSeq, rootId) : false; } catch (error) { onError(error); }
    const bounded = truncateUtf8(finalText);
    if (activation.admitted) await activation.lease!.finish(outcome.status === "completed" ? "completed" : outcome.status === "interrupted" ? "cancelled" : "failed", { status: outcome.status, text: bounded.text }).catch(onError);
    let notified = false;
    if (!this.#disposing) {
      try {
        const root = await this.options.openSession(rootId);
        const summary = settleSummary({ agentId, description: activation.description, status: outcome.status, ...(outcome.error === undefined ? {} : { error: outcome.error }), external: isExternal(activation.kind) });
        const delivery = activation.delivery === "caller" ? "returned" : activation.delivery === "dropped" ? "lost" : "notified";
        await root.append(coreEvent("subagent/activation", { op: "settle", agentId, activationId: activation.activationId, status: outcome.status, summary, ...(bounded.text ? { result: bounded.text } : {}), ...(bounded.truncated ? { resultTruncated: true } : {}), delivery, endedAt: this.#now() }));
        if (delivery === "notified") {
          const notice = subagentNotification({ agentId, description: activation.description, status: outcome.status, summary, transcriptPath: activation.transcriptPath, closing: omitted ? "omitted" : bounded });
          await new MainAgentInbox(root).enqueue(notice, { taskId: agentId, kind: "subagent", title: activation.description, status: outcome.status }, { source: "subagent_notification" });
          notified = true;
        }
        await root.flush();
      } catch (error) { onError(error); }
    }
    // The transcript header shows the settled status before the parent reads the notice or the result.
    if (!isExternal(activation.kind)) await this.#refresh(agentId);
    if (notified) this.options.wake(rootId);
    await child?.close().catch(onError);
    await activation.scope?.dispose().catch(onError);
    await activation.lease?.release().catch(onError);
    if (this.#active.get(agentId) === activation) this.#active.delete(agentId);
    // A synchronous caller gets the result once the child holds nothing: no open Session, scope or Harness lease.
    activation.result.resolve({ status: outcome.status, ...(outcome.error === undefined ? {} : { error: outcome.error }), text: bounded.text, truncated: bounded.truncated });
  }

  async #awaitSync(activation: Activation, signal: AbortSignal, detail: SubagentDetail, external: { readonly external?: string; readonly logMissing?: boolean } = {}): Promise<SubagentToolOutcome> {
    const { agentId, description, transcriptPath } = activation;
    const winner = await new Promise<Settled | "moved">(resolve => {
      const done = (value: Settled | "moved") => { clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(value); };
      void activation.result.promise.then(done);
      // Settlement already chose the caller; its result follows.
      const timer = setTimeout(() => { if (!activation.settling && activation.delivery === "caller") { activation.delivery = "parent"; done("moved"); } }, this.options.syncWaitMs ?? SUBAGENT_SYNC_WAIT_MS);
      timer.unref?.();
      const abort = () => activation.controller.abort("parent-abort");
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    if (winner === "moved") return ok(movedToBackground({ agentId, description, transcriptPath, ...external }), withStatus(detail, "running"));
    return ok(syncResult({ agentId, description, transcriptPath, ...(external.logMissing ? { logMissing: true } : {}), status: winner.status, ...(winner.error === undefined ? {} : { error: winner.error }), result: winner.text, truncated: winner.truncated }), withStatus(detail, winner.status));
  }

  #observe(activation: Activation, event: SessionEventEnvelopeV1): void {
    if (event.type === "user/message" || (event.type === "agent/inbox/spliced" && record(event.data).operation === "claim")) activation.ready.resolve();
    if (event.type === "step/end") void this.#refresh(activation.agentId);
  }

  async #refresh(sessionId: string): Promise<void> {
    await this.options.refreshTranscript(sessionId).catch(report(this.options.onError));
  }

  // ---- lookups ----

  async #caller(input: SubagentCaller): Promise<{ readonly ok: false; readonly outcome: SubagentToolOutcome } | (ResolvedCaller & { readonly ok: true })> {
    const session = this.options.getOpenSession(input.sessionId);
    if (!session) return { ok: false, outcome: fail("SESSION_UNAVAILABLE", `Session ${input.sessionId} is unavailable.`) };
    const lineage = session.header.lineage;
    if (lineage?.origin !== "delegation") return { ok: true, root: session, rootId: input.sessionId, isRoot: true, ...(input.scope ? { scope: input.scope } : {}) };
    const root = this.options.getOpenSession(lineage.parentSessionId) ?? await this.options.openSession(lineage.parentSessionId);
    const scope = this.#active.get(input.sessionId)?.scope;
    return { ok: true, root, rootId: lineage.parentSessionId, isRoot: false, ...(scope ? { scope } : {}) };
  }

  /** `useSetting`: `agent` falls back to the default subagent model setting; `agent_fork` goes straight to the parent's settings. */
  #chooseModel(rootId: string, requested: string | undefined, effort: string | undefined, useSetting: boolean): { readonly ok: true; readonly config: SubagentModelConfiguration } | { readonly ok: false; readonly outcome: SubagentToolOutcome } {
    const port = this.options.models();
    const usable = port.listUsableModels();
    const choose = (key: string) => {
      const model = usable.find(item => item.key === key)!;
      if (effort !== undefined && !(model.reasoningEfforts as readonly string[]).includes(effort)) return { ok: false as const, outcome: fail("UNKNOWN_EFFORT", unknownEffort(effort, key)) };
      const reasoningEffort = effort ?? model.defaultEffort;
      return { ok: true as const, config: { model: key, thinkingEnabled: effort !== undefined || model.thinkingDefault, ...(reasoningEffort ? { reasoningEffort } : {}) } };
    };
    if (requested !== undefined) return usable.some(item => item.key === requested) ? choose(requested) : { ok: false, outcome: fail("UNKNOWN_MODEL", unknownModel(requested)) };
    const setting = useSetting ? port.subagentDefaultModel() : undefined;
    if (setting && usable.some(item => item.key === setting)) return choose(setting);
    const { selectedSkillIds: _skills, ...parent } = this.options.parentConfiguration(rootId);
    if (effort === undefined) return { ok: true, config: parent };
    const current = parent.model ? usable.find(item => item.key === parent.model) : undefined;
    if (current && !(current.reasoningEfforts as readonly string[]).includes(effort)) return { ok: false, outcome: fail("UNKNOWN_EFFORT", unknownEffort(effort, current.key)) };
    return { ok: true, config: { ...parent, thinkingEnabled: true, reasoningEffort: effort } };
  }

  #defaultModel(rootId: string, useSetting: boolean): SubagentModelConfiguration {
    const chosen = this.#chooseModel(rootId, undefined, undefined, useSetting);
    return chosen.ok ? chosen.config : {};
  }

  #running(rootId: string): number { return [...this.#active.values()].filter(item => item.rootId === rootId).length; }
  get #limit(): number { return this.options.limit ?? SUBAGENT_CONCURRENCY_LIMIT; }
  #now(): string { return (this.options.now?.() ?? new Date()).toISOString(); }
}

function turnOutcome(reason: string): { readonly status: SubagentActivationStatus; readonly error?: string } {
  return reason === "completed" ? { status: "completed" } : reason === "step-limit" ? { status: "max_steps" } : reason === "aborted" ? { status: "interrupted" } : { status: "failed", error: `Turn ended with ${reason}` };
}

type ResolvedCaller = { readonly root: SessionHandle; readonly rootId: string; readonly isRoot: boolean; readonly scope?: AgentScope };
type SubagentDetail = readonly { readonly label: string; readonly value: RuntimeV2JsonValue }[];

/** Serialize message delivery and settlement per child (DSH `ChildLock`). */
class ChildLock {
  readonly #tails = new Map<string, Promise<unknown>>();
  run<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(id) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(() => undefined, () => undefined);
    this.#tails.set(id, tail);
    void tail.then(() => { if (this.#tails.get(id) === tail) this.#tails.delete(id); });
    return result;
  }
}

type Deferred<T> = { readonly promise: Promise<T>; resolve(value: T): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

export function subagentTree(root: SessionHandle): SubagentTree {
  return root.journal.project(TREE, () => EMPTY_SUBAGENT_TREE, reduceSubagentTree);
}

/**
 * May an agent of this main Session's tree read this file without approval (design 04 §3.3)? Only the exact
 * session log of one of its Codex / Claude Code subagents. The list folds from `subagent/spawned`, so it
 * holds after a restart; a sibling subagent reads it like the parent does.
 */
export function isExternalRecordPath(root: SessionHandle, canonicalPath: string): boolean {
  return listedSubagents(subagentTree(root)).some(agent => isExternal(agent.kind) && canonicalFile(agent.transcriptPath) === canonicalPath);
}

function canonicalFile(path: string): string {
  try { return realpathSync(path); } catch { return resolvePath(path); }
}

/** `general · gpt-5.5 · started 14:02`, `fork · 2 turns`, `codex` (design 02 §2.5). */
function agentSummary(agent: SubagentView): string {
  const label = agentLabel(agent);
  if (agent.status === "running") {
    const current = runningActivation(agent)!;
    const model = current.model ?? lastActivationModel(agent);
    return [label, ...(model ? [model] : []), `started ${clock(current.startedAt)}`].join(" · ");
  }
  if (agent.status === "inactive") return `${label} · ${agent.activations.length} ${agent.activations.length === 1 ? "turn" : "turns"}`;
  return label;
}

function agentLabel(agent: SubagentView): string { return agent.kind === "local" ? agent.preset ?? "general" : agent.kind; }

/** Local wall-clock `HH:MM`. */
export function clock(iso: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

/** True while the child's last tool call of this activation was a message to its parent and no input was claimed since. */
function closingOmitted(child: SessionHandle, startSeq: number, rootId: string): boolean {
  let omitted = false;
  for (const event of child.journal.iterateEvents(startSeq + 1)) {
    const data = record(event.data);
    if (event.type === "tool/call") omitted = data.name === "send_message" && record(data.args).agent_id === rootId;
    if (event.type === "agent/inbox/spliced" && data.operation === "claim") omitted = false;
  }
  return omitted;
}

/** `trace: false`: an external record not written yet is returned but not registered as an active path. */
function details(input: { readonly agentId: string; readonly description: string; readonly kind: SubagentKind; readonly preset?: SubagentPreset; readonly transcriptPath: string; readonly background: boolean; readonly inheritedThroughSeq?: number; readonly trace?: boolean }): SubagentDetail {
  return Object.freeze<SubagentDetail[number][]>([
    ...(input.trace === false ? [] : [{ label: CONTEXT_TRACE_DETAIL_LABEL, value: { kind: "trace", path: input.transcriptPath, description: `Subagent transcript: ${input.description}` } }]),
    { label: "delegation", value: {
      childSessionId: input.agentId, agentId: input.agentId, kind: input.kind, ...(input.preset ? { preset: input.preset } : {}), description: input.description, transcriptPath: input.transcriptPath,
      background: input.background, ...(input.inheritedThroughSeq === undefined ? {} : { inheritedThroughSeq: input.inheritedThroughSeq }), status: "running",
    } },
  ]);
}

function isExternal(kind: SubagentKind): boolean { return kind === "codex" || kind === "claude-code"; }

/** True once the file exists; gives up at the deadline or once the run has settled (checking one last time). */
async function waitForFile(path: string, settled: Promise<unknown>, timeoutMs: number, pollMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let done = false;
  void settled.then(() => { done = true; });
  for (;;) {
    if (existsSync(path)) return true;
    const left = deadline - Date.now();
    if (done || left <= 0) return existsSync(path);
    await new Promise(resolve => setTimeout(resolve, Math.min(pollMs, left)));
  }
}

/** The Agent mode of the Session's latest `turn/start`. */
function latestTurnMode(session: SessionHandle): RuntimeV2AgentMode | undefined {
  const mode = record(session.journal.latestEvent("turn/start")?.data).mode;
  return mode === "agent" || mode === "plan" || mode === "chat" ? mode : undefined;
}

function withStatus(detail: SubagentDetail, status: string): SubagentDetail {
  return detail.map(item => item.label === "delegation" ? { ...item, value: { ...record(item.value), status } } : item);
}

function startData(activation: Activation, input: { readonly trigger: "spawn" | "message"; readonly senderId?: string; readonly callId: string; readonly background: boolean; readonly startedAt: string }): Record<string, RuntimeV2JsonValue> {
  return {
    op: "start", agentId: activation.agentId, activationId: activation.activationId, trigger: input.trigger, ...(input.senderId ? { senderId: input.senderId } : {}),
    callId: input.callId, background: input.background, ...(activation.model.model ? { model: activation.model.model } : {}),
    ...(activation.model.reasoningEffort ? { reasoningEffort: activation.model.reasoningEffort } : {}), startedAt: input.startedAt,
  };
}

function modelInput(config: SubagentModelConfiguration): { model?: string; thinkingEnabled?: boolean; reasoningEffort?: import("@actspace/shared").ModelReasoningEffort } {
  return {
    ...(config.model ? { model: config.model } : {}),
    ...(config.thinkingEnabled === undefined ? {} : { thinkingEnabled: config.thinkingEnabled }),
    ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort as import("@actspace/shared").ModelReasoningEffort } : {}),
  };
}

/** A Journal event owned by `@actspace/core` (core types and the `subagent/*` extensions alike). */
function coreEvent(type: string, data: Record<string, RuntimeV2JsonValue>) { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never; }
function record(value: unknown): Readonly<Record<string, unknown>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}; }
function ok(text: string, detail?: SubagentDetail): SubagentToolOutcome { return detail ? { ok: true, text, detail } : { ok: true, text }; }
function fail(code: string, text: string): SubagentToolOutcome { return { ok: false, code, text }; }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function report(onError: ((error: unknown) => void) | undefined): (error: unknown) => void { return error => { try { onError?.(error); } catch { /* diagnostics never fail the caller */ } }; }
