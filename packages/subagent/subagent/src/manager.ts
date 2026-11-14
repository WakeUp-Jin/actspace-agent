import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { open } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { MainAgentInbox } from "@actspace/agent";
import type { BackgroundTaskOutput, BackgroundTaskRegistry, BackgroundTaskTerminal } from "@actspace/background-tasks";
import type { AgentLoop } from "@actspace/agent-loop";
import type { AgentScope } from "@actspace/scope";
import type { ModelsHostPort } from "@actspace/shared";
import {
  coreEvent,
  EMPTY_SUBAGENT_TREE,
  CONTEXT_TRACE_DETAIL_LABEL,
  listedSubagents,
  reduceSubagentTree,
  runningActivation,
  type CoreEventDataMap,
  type PermissionMode,
  type RuntimeAgentMode,
  type RuntimeJsonValue,
  type SubagentActivationStatus,
  type SubagentDelivery,
  type SubagentKind,
  type SubagentPreset,
  type SubagentTree,
} from "@actspace/shared/runtime-v2";
import {
  FORKED_SUBAGENT_PRESET_ID,
  resolveSessionWorkspaceRoot,
  type SessionEventEnvelopeV1,
} from "@actspace/session-journal";
import type { SessionHandle, SessionStore } from "@actspace/session-persistence";
import { createChildSession } from "./child-session.js";
import {
  firstErrorLine,
  type ExternalRun,
  type ExternalRunResult,
  type ExternalSubagentBackend,
  type SpawnExternalInput,
} from "./external.js";
import { resolveForkBoundary } from "./fork-boundary.js";
import {
  agentFinished,
  agentMessage,
  backgroundStarted,
  blockedTool,
  CANNOT_MESSAGE_SELF,
  closingBody,
  CLOSING_OMITTED_NOTE,
  EXTERNAL_LOG_WAIT_MS,
  externalCannotReceive,
  externalStartFailed,
  messageDelivered,
  movedToBackground,
  settleSummary,
  SIBLING_MESSAGE_BLOCKED,
  SUBAGENT_CONCURRENCY_LIMIT,
  SUBAGENT_LIMIT_REACHED,
  SUBAGENT_MAX_STEPS,
  SUBAGENT_SYNC_WAIT_MS,
  syncResult,
  taskGuidance,
  truncateUtf8,
  unknownAgent,
  unknownEffort,
  unknownModel,
} from "./messages.js";
import { subagentToolNames } from "./preset.js";
import type {
  SpawnForkInput,
  SpawnSubagentInput,
  SubagentCaller,
  SubagentHostPort,
  SubagentToolOutcome,
} from "./types.js";

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
  start(session: SessionHandle, content: RuntimeJsonValue, runId: string): Promise<{ readonly messageId: string }>;
  createLoop(input: ChildLoopInput): Promise<ChildLoop>;
  finish(outcome: "completed" | "cancelled" | "failed", value: RuntimeJsonValue): Promise<void>;
  release(): Promise<void>;
};

export type SubagentModelConfiguration = {
  readonly model?: string;
  readonly thinkingEnabled?: boolean;
  readonly reasoningEffort?: string;
};
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
  readonly permissionMode: (session: SessionHandle) => PermissionMode;
  readonly isSessionRunning: (sessionId: string) => boolean;
  readonly wake: (sessionId: string) => void;
  /**
   * The Host's background task registry. A background subagent, or a synchronous one past its wait limit, becomes
   * a `kind: "agent"` task there: the registry notifies the parent, lists it and stops it (`task_*` tools).
   */
  readonly backgroundTasks: Pick<BackgroundTaskRegistry, "register" | "stop" | "stopByUser">;
  readonly onError?: (error: unknown) => void;
  readonly now?: () => Date;
  /** Tests only. */
  readonly syncWaitMs?: number;
  readonly limit?: number;
  readonly maxSteps?: number;
  readonly externalLogWaitMs?: number;
};

type Settled = {
  readonly status: SubagentActivationStatus;
  readonly error?: string;
  readonly text: string;
  readonly truncated: boolean;
  readonly byUser: boolean;
};

/**
 * Who receives the result. `caller`: the synchronous tool call; `registry`: a background task, notified by the registry;
 * `stopped`: `task_stop` / the user stopped it, and that stop was the delivery; `dropped`: the main Session rewound past it.
 */
type Delivery = "caller" | "registry" | "stopped" | "dropped";

type Activation = {
  readonly rootId: string;
  readonly agentId: string;
  readonly activationId: string;
  readonly callId: string;
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
  delivery: Delivery;
  /** Pending while the registry records the task; `registered` once it has. */
  registration?: Promise<void>;
  registered: boolean;
  /** Set inside the child lock when settlement starts; a later message is refused (the subagent has finished). */
  settling: boolean;
  settled: boolean;
  child?: SessionHandle;
  lease?: ChildRunLease;
  scope?: AgentScope;
  admitted: boolean;
  startSeq: number;
  readonly ready: Deferred<void>;
  /** What the registry reports for a background subagent. */
  readonly terminal: Deferred<BackgroundTaskTerminal>;
  /** Resolved once the child holds nothing: no open Session, scope or Harness lease. */
  readonly result: Deferred<Settled>;
};

const TREE = Symbol("actspace.subagent.tree");
/** `task_output` on a subagent: the end of its transcript. */
const OUTPUT_TAIL_BYTES = 32 * 1024;

/**
 * Host-owned scheduler of subagents (design 02). A subagent is a temporary context window: it runs one task,
 * answers, and is closed. A synchronous call returns its answer; a background one is a task of the background
 * task registry, which notifies the parent and stops it. All state is folded from the main Session's
 * `subagent/*` events; only running subagents live in memory.
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
    if (!caller.scope)
      return fail("PARENT_AGENT_UNAVAILABLE", `Parent Agent for Session ${input.sessionId} is unavailable.`);
    const model = this.#chooseModel(caller.rootId, input.model, input.reasoningEffort, true);
    if (!model.ok) return model.outcome;
    if (this.#running(caller.rootId) >= this.#limit) return fail("SUBAGENT_LIMIT", SUBAGENT_LIMIT_REACHED);
    const agentId = randomUUID();
    const transcriptPath = this.options.transcriptPath(agentId);
    const toolNames = subagentToolNames(input.preset, input.parentToolNames, input.registeredToolNames);
    const activation = this.#reserve({
      rootId: caller.rootId,
      agentId,
      description: input.description,
      kind: "local",
      preset: input.preset,
      transcriptPath,
      toolNames,
      model: model.config,
      callId: input.callId,
    });
    const root = caller.root;
    try {
      const workspaceRoot = resolveSessionWorkspaceRoot(root.header, root.journal);
      activation.child = await createChildSession({
        store: this.options.store,
        parent: root,
        parentCallId: input.callId,
        childSessionId: agentId,
        createdAt: this.#now(),
        ...(workspaceRoot ? { cwd: workspaceRoot } : {}),
        prompt: input.prompt,
        presetId: `actspace.subagent.${input.preset}`,
        manifestDigest: this.options.manifestDigest,
        plugins: this.options.plugins,
        onEvent: (event) => this.#observe(activation, event),
      });
      await root.append(
        coreEvent("subagent/spawned", {
          agentId,
          callId: input.callId,
          kind: "local",
          preset: input.preset,
          description: input.description,
          transcriptPath,
          createdAt: this.#now(),
          toolNames: [...toolNames],
        }),
      );
      await root.append(
        coreEvent(
          "subagent/activation",
          startData(activation, {
            trigger: "spawn",
            callId: input.callId,
            background: input.background,
            startedAt: this.#now(),
          }),
        ),
      );
      await root.flush();
      if (input.background) await this.#register(activation);
    } catch (error) {
      this.#active.delete(agentId);
      await activation.child?.close().catch(report(this.options.onError));
      return fail("SUBAGENT_FAILED", errorText(error));
    }
    this.#begin(activation, caller.scope, `${input.prompt}\n\n${taskGuidance(transcriptPath, input.preset)}`);
    // The transcript must exist with the task message before the path is handed out (design 02 §6.3).
    await Promise.race([activation.ready.promise, activation.result.promise]);
    await this.#refresh(agentId);
    const detail = details({
      agentId,
      description: input.description,
      kind: "local",
      preset: input.preset,
      transcriptPath,
      background: input.background,
    });
    if (input.background)
      return ok(backgroundStarted({ agentId, description: input.description, transcriptPath }), detail);
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
    if (!caller.scope)
      return fail("PARENT_AGENT_UNAVAILABLE", `Parent Agent for Session ${input.sessionId} is unavailable.`);
    // Without a model the fork keeps the parent's model, thinking and effort; the default subagent model would lose the cache.
    const model = this.#chooseModel(caller.rootId, input.model, input.reasoningEffort, false);
    if (!model.ok) return model.outcome;
    if (this.#running(caller.rootId) >= this.#limit) return fail("SUBAGENT_LIMIT", SUBAGENT_LIMIT_REACHED);
    const root = caller.root;
    // The copy is read from storage: everything up to this call must be durable first.
    await root.flush();
    let boundary: ReturnType<typeof resolveForkBoundary>;
    try {
      boundary = resolveForkBoundary(root.journal.readEvents(), this.options.store.options.registry, input.callId);
    } catch (error) {
      return fail("FORK_UNAVAILABLE", errorText(error));
    }
    const agentId = randomUUID();
    const transcriptPath = this.options.transcriptPath(agentId);
    const toolNames = Object.freeze([...new Set(input.parentToolNames)].sort());
    const { selectedSkillIds } = this.options.parentConfiguration(caller.rootId);
    const activation = this.#reserve({
      rootId: caller.rootId,
      agentId,
      description: input.description,
      kind: "fork",
      transcriptPath,
      toolNames,
      model: model.config,
      ...(selectedSkillIds?.length ? { selectedSkillIds: [...selectedSkillIds] } : {}),
      callId: input.callId,
    });
    try {
      const createdWith = {
        ...root.header.createdWith,
        presetId: FORKED_SUBAGENT_PRESET_ID,
        manifestDigest: this.options.manifestDigest,
        plugins: this.options.plugins,
        codecSetDigest: this.options.store.options.registry.digest,
      };
      const child = await this.options.store.fork(
        {
          parentSessionId: caller.rootId,
          boundarySeq: boundary.boundarySeq,
          newSessionId: agentId,
          createdAt: this.#now(),
          createdWith,
          origin: "delegation",
          parentCallId: input.callId,
        },
        { onEvent: (event) => this.#observe(activation, event) },
      );
      activation.child = child;
      // The copied Turn belongs to the parent: close it, and drop the parent's queued notices so the fork never claims them.
      await child.append(coreEvent("turn/end", { turnId: boundary.turnId, reason: "forked" }));
      const inbox = new MainAgentInbox(child);
      for (const item of inbox.pending()) await inbox.discard(item.messageId, "forked");
      await child.flush();
      await root.append(
        coreEvent("subagent/spawned", {
          agentId,
          callId: input.callId,
          kind: "fork",
          description: input.description,
          transcriptPath,
          createdAt: this.#now(),
          inheritedThroughSeq: boundary.boundarySeq,
          toolNames: [...toolNames],
        }),
      );
      await root.append(
        coreEvent(
          "subagent/activation",
          startData(activation, {
            trigger: "spawn",
            callId: input.callId,
            background: input.background,
            startedAt: this.#now(),
          }),
        ),
      );
      await root.flush();
      if (input.background) await this.#register(activation);
    } catch (error) {
      this.#active.delete(agentId);
      await activation.child?.close().catch(report(this.options.onError));
      return fail("SUBAGENT_FAILED", errorText(error));
    }
    this.#begin(activation, caller.scope, `${input.prompt}\n\n${taskGuidance(transcriptPath, "fork")}`);
    await Promise.race([activation.ready.promise, activation.result.promise]);
    await this.#refresh(agentId);
    const detail = details({
      agentId,
      description: input.description,
      kind: "fork",
      transcriptPath,
      background: input.background,
      inheritedThroughSeq: boundary.boundarySeq,
    });
    if (input.background)
      return ok(backgroundStarted({ agentId, description: input.description, transcriptPath, forked: true }), detail);
    return this.#awaitSync(activation, input.signal, detail);
  }

  /**
   * `agent_codex` / `agent_claude_code` (design 04): run the CLI once in the workspace. It shares the limit,
   * events and background handling with local subagents; its record is the CLI's own session log.
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
    const activation = this.#reserve({
      rootId: caller.rootId,
      agentId,
      description: input.description,
      kind,
      transcriptPath: "",
      toolNames: [],
      model: input.model ? { model: input.model } : {},
      callId: input.callId,
    });
    let run: ExternalRun;
    try {
      run = await backend.start({
        prompt: input.prompt,
        cwd,
        ...(input.model ? { model: input.model } : {}),
        signal: activation.controller.signal,
      });
    } catch (error) {
      this.#active.delete(agentId);
      return fail("SUBAGENT_FAILED", externalStartFailed(label, firstErrorLine(error)));
    }
    const transcriptPath = (activation.transcriptPath = run.transcriptPath);
    try {
      await root.append(
        coreEvent("subagent/spawned", {
          agentId,
          callId: input.callId,
          kind,
          description: input.description,
          transcriptPath,
          createdAt: this.#now(),
        }),
      );
      await root.append(
        coreEvent(
          "subagent/activation",
          startData(activation, {
            trigger: "spawn",
            callId: input.callId,
            background: input.background,
            startedAt: this.#now(),
          }),
        ),
      );
      await root.flush();
      if (input.background) await this.#register(activation);
    } catch (error) {
      this.#active.delete(agentId);
      await run.interrupt().catch(report(this.options.onError));
      return fail("SUBAGENT_FAILED", errorText(error));
    }
    this.#track(this.#runExternal(activation, run));
    // The path joins the active paths only once the CLI has written the file (design 04 §3.3).
    const logReady = await waitForFile(
      transcriptPath,
      activation.result.promise,
      this.options.externalLogWaitMs ?? EXTERNAL_LOG_WAIT_MS,
    );
    const detail = details({
      agentId,
      description: input.description,
      kind,
      transcriptPath,
      background: input.background,
      trace: logReady,
    });
    const text = { external: label, logMissing: !logReady };
    if (input.background)
      return ok(backgroundStarted({ agentId, description: input.description, transcriptPath, ...text }), detail);
    return this.#awaitSync(activation, input.signal, detail, text);
  }

  /**
   * The main agent writes to a running subagent it started; a subagent writes to its parent, which wakes if idle.
   * Siblings do not talk, and a finished subagent takes no more messages (design 02 §3).
   */
  async sendMessage(
    input: SubagentCaller & { readonly agentId: string; readonly message: string },
  ): Promise<SubagentToolOutcome> {
    const caller = await this.#caller(input);
    if (!caller.ok) return caller.outcome;
    const target = input.agentId;
    if (target === input.sessionId) return fail("INVALID_TARGET", CANNOT_MESSAGE_SELF);
    const root = caller.root,
      rootId = caller.rootId;
    const tree = subagentTree(root);
    if (!caller.isRoot) {
      if (target !== rootId)
        return tree.agents[target]
          ? fail("INVALID_TARGET", SIBLING_MESSAGE_BLOCKED)
          : fail("UNKNOWN_AGENT", unknownAgent(target));
      const sender = tree.agents[input.sessionId];
      const running = this.options.isSessionRunning(rootId);
      await new MainAgentInbox(root).enqueue(
        agentMessage(input.sessionId, "child", input.message),
        {
          taskId: input.sessionId,
          kind: "agent_message",
          title: sender?.description ?? input.sessionId,
          status: "message",
        },
        { source: "agent_message", senderId: input.sessionId },
      );
      await root.flush();
      this.options.wake(rootId);
      return ok(messageDelivered(rootId, running));
    }
    const view = tree.agents[target];
    if (!view || view.legacy) return fail("UNKNOWN_AGENT", unknownAgent(target));
    if (view.kind === "codex" || view.kind === "claude-code")
      return fail("SUBAGENT_CLOSED", externalCannotReceive(target));
    const content = agentMessage(input.sessionId, "parent", input.message);
    // Under the child lock: a message either lands before the subagent decides it is done (and is read), or is refused.
    return this.#lock.run(target, async () => {
      const active = this.#active.get(target);
      if (!active || active.rootId !== rootId || active.settling || !active.child)
        return fail("SUBAGENT_CLOSED", agentFinished(target));
      await new MainAgentInbox(active.child).enqueue(content, undefined, {
        source: "agent_message",
        senderId: input.sessionId,
      });
      return ok(messageDelivered(target, true));
    });
  }

  async listModels(input: SubagentCaller): Promise<SubagentToolOutcome> {
    const caller = await this.#caller(input);
    if (!caller.ok) return caller.outcome;
    const port = this.options.models();
    const models = port.listUsableModels();
    const setting = port.subagentDefaultModel();
    const parent = this.options.parentConfiguration(caller.rootId).model;
    const lines = [
      setting && models.some((model) => model.key === setting)
        ? `Default subagent model: ${setting}`
        : `Default subagent model: follows your current model${parent ? ` (${parent})` : ""}`,
    ];
    for (const model of models) {
      const efforts = model.reasoningEfforts.length
        ? ` · efforts: ${model.reasoningEfforts.join(", ")}${model.defaultEffort ? ` (default ${model.defaultEffort})` : ""}`
        : "";
      lines.push(
        `- ${model.key} — ${model.label}${model.connectionLabel ? ` · ${model.connectionLabel}` : ""}${efforts}`,
      );
    }
    return ok(lines.join("\n"));
  }

  /** The subagent tree of a main Session, for the UI. */
  tree(root: SessionHandle): SubagentTree {
    return subagentTree(root);
  }

  /** Running subagents of one main Session, as the limit counts them. */
  runningCount(rootId: string): number {
    return this.#running(rootId);
  }

  /**
   * The 子 Agent panel's 停止 (design 05 §2). A background subagent is stopped through the registry, which tells
   * the model the user stopped it; a synchronous one is interrupted and its waiting tool call returns that.
   */
  async stopByUser(sessionId: string, agentId: string): Promise<{ readonly ok: boolean; readonly message: string }> {
    const active = this.#active.get(agentId);
    if (!active || active.rootId !== sessionId || active.settling)
      return { ok: false, message: `Subagent ${agentId} is not running.` };
    await active.registration;
    if (active.registered) await this.options.backgroundTasks.stopByUser(sessionId, agentId);
    else {
      active.controller.abort("user");
      await active.result.promise;
    }
    return { ok: true, message: `Stopped subagent ${agentId}.` };
  }

  /**
   * When a main Session opens: an activation that started but never settled and is not running in this process
   * was cut off by an exit. Record it as lost in the tree; a background one is reported by the registry.
   */
  async recoverLost(root: SessionHandle): Promise<void> {
    if (root.header.lineage?.origin === "delegation") return;
    for (const agent of listedSubagents(subagentTree(root))) {
      const open = runningActivation(agent);
      if (!open || this.#active.get(agent.agentId)?.activationId === open.activationId) continue;
      const summary = settleSummary({ agentId: agent.agentId, description: agent.description, status: "lost" });
      await root.append(
        coreEvent("subagent/activation", {
          op: "settle",
          agentId: agent.agentId,
          activationId: open.activationId,
          status: "lost",
          summary,
          delivery: "lost",
          endedAt: this.#now(),
        }),
      );
    }
  }

  /**
   * The main Session is rewinding (agent-edit-resend-rewind.md §3.2): stop its running subagents and wait until
   * each has settled. They settle with `delivery: "lost"`, without a notice or a wake; a background one is stopped
   * through the registry, so it sends no notification either. One already settling keeps its delivery.
   */
  async stopAll(rootId: string): Promise<void> {
    const stopping = [...this.#active.values()].filter((activation) => activation.rootId === rootId);
    await Promise.all(
      stopping.map(async (activation) => {
        await activation.registration;
        if (activation.registered)
          await this.options.backgroundTasks
            .stop(rootId, activation.agentId, "rewind")
            .catch(report(this.options.onError));
        else this.#stop(activation, "rewind");
        await activation.result.promise;
      }),
    );
  }

  /**
   * Host shutdown: stop every subagent without settling it, so the next start reports it as lost. The registry is
   * disposed first and stops the background ones the same way (`host-shutdown`).
   */
  async dispose(): Promise<void> {
    this.#disposing = true;
    for (const activation of this.#active.values()) this.#stop(activation, "host-shutdown");
    await Promise.allSettled([...this.#runs]);
  }

  get activeCount(): number {
    return this.#active.size;
  }

  // ---- activation lifecycle ----

  #reserve(
    input: Pick<
      Activation,
      | "rootId"
      | "agentId"
      | "callId"
      | "description"
      | "kind"
      | "preset"
      | "transcriptPath"
      | "toolNames"
      | "model"
      | "selectedSkillIds"
    >,
  ): Activation {
    const activation: Activation = {
      ...input,
      activationId: randomUUID(),
      controller: new AbortController(),
      delivery: "caller",
      registered: false,
      settling: false,
      settled: false,
      admitted: false,
      startSeq: -1,
      ready: deferred(),
      terminal: deferred(),
      result: deferred(),
    };
    this.#active.set(input.agentId, activation);
    return activation;
  }

  #begin(activation: Activation, scope: AgentScope, task: string): void {
    this.#track(this.#run(activation, scope, task));
  }

  /**
   * Hand a running subagent to the background task registry (design 02 §6.1): `taskId` is the agent id, its
   * transcript is the output, and the registry's stop ends it. Once registered, the registry delivers its result.
   */
  #register(activation: Activation): Promise<void> {
    activation.delivery = "registry";
    const registering = this.options.backgroundTasks
      .register({
        taskId: activation.agentId,
        kind: "agent",
        sessionId: activation.rootId,
        callId: activation.callId,
        description: activation.description,
        agent: { transcriptPath: activation.transcriptPath, label: kindLabel(activation) },
        done: activation.terminal.promise,
        output: () => this.#transcriptTail(activation),
        stop: async (reason) => {
          this.#stop(activation, reason);
          await activation.result.promise;
        },
      })
      .then(() => {
        activation.registered = true;
      });
    activation.registration = registering.catch(() => undefined);
    return registering;
  }

  /**
   * Abort an activation. `host-shutdown` leaves the Journal alone; `rewind` tells no one; any other reason is a
   * `task_stop` or the user, whose stop was the delivery. One already settling keeps its delivery.
   */
  #stop(activation: Activation, reason: string): void {
    if (!activation.settling && reason !== "host-shutdown") {
      if (reason === "rewind") activation.delivery = "dropped";
      else if (activation.delivery === "registry") activation.delivery = "stopped";
    }
    activation.controller.abort(reason);
  }

  async #transcriptTail(activation: Activation): Promise<BackgroundTaskOutput> {
    if (!isExternal(activation.kind)) await this.#refresh(activation.agentId);
    return { text: await readTail(activation.transcriptPath, OUTPUT_TAIL_BYTES) };
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
    const stop = () => {
      void run.interrupt().catch(report(this.options.onError));
    };
    controller.signal.addEventListener("abort", stop, { once: true });
    if (controller.signal.aborted) stop();
    let result: ExternalRunResult;
    try {
      result = await run.result;
    } catch (error) {
      result = { status: "failed", text: "", error: firstErrorLine(error) };
    } finally {
      controller.signal.removeEventListener("abort", stop);
    }
    const status = controller.signal.aborted && result.status !== "completed" ? "interrupted" : result.status;
    const outcome = status === "failed" ? { status, error: result.error ?? "unknown error" } : { status };
    await this.#lock.run(activation.agentId, () => this.#settle(activation, undefined, outcome, result.text));
  }

  /**
   * Set up the Run and drive its Turn; a message that arrived after the last step runs one more Turn before it
   * settles (it was sent while the subagent was still running). Settles under the child lock.
   */
  async #run(activation: Activation, parentScope: AgentScope, task: string): Promise<void> {
    const { agentId, controller } = activation;
    const child = activation.child!;
    let finalText = "";
    let loop: ChildLoop | undefined;
    try {
      const root = await this.options.openSession(activation.rootId);
      await child.append(
        coreEvent("permission/mode-set", {
          mode: this.options.permissionMode(root),
          changedAt: this.#now(),
          source: "parent",
        }),
      );
      activation.startSeq = child.lastSeq;
      controller.signal.throwIfAborted();
      const lease = await this.options.acquireRun({ scope: parentScope, signal: controller.signal });
      activation.lease = lease;
      const accepted = await lease.start(child, task, activation.activationId);
      activation.admitted = true;
      activation.scope = lease.scope.child(agentId);
      const common = {
        session: child,
        scope: activation.scope,
        agentId,
        description: activation.description,
        allowedToolNames: activation.toolNames,
        maxSteps: this.options.maxSteps ?? SUBAGENT_MAX_STEPS,
        signal: controller.signal,
      };
      loop = await lease.createLoop(
        activation.kind === "fork"
          ? { ...common, role: "fork" }
          : { ...common, role: "subagent", preset: activation.preset ?? "general" },
      );
      // A fork stays in the Agent mode of the Turn it was cut from: the copied `turn/start` is its latest until it runs its own.
      const mode = activation.kind === "fork" ? latestTurnMode(child) : undefined;
      const configuration = {
        agentRunId: activation.activationId,
        ...modelInput(activation.model),
        ...(mode ? { mode } : {}),
      };
      let turn = await loop.runTurn({
        ...configuration,
        ...(activation.selectedSkillIds ? { selectedSkillIds: activation.selectedSkillIds } : {}),
        content: task,
        messageId: accepted.messageId,
      });
      finalText = turn.finalText;
      for (;;) {
        // Deciding and settling happen in one lock section: a message that arrives after the last step
        // starts another Turn, and one that arrives later is refused (the subagent has finished).
        const current = turn;
        const again = await this.#lock.run(agentId, async () => {
          if (
            current.reason === "completed" &&
            !controller.signal.aborted &&
            new MainAgentInbox(child).hasPendingNotifications()
          )
            return true;
          await this.#settle(activation, loop, turnOutcome(current.reason), finalText);
          return false;
        });
        if (!again) return;
        turn = await loop.runTurn({ ...configuration, content: "", wake: true });
        if (turn.steps > 0) finalText = turn.finalText;
      }
    } catch (error) {
      if (activation.settled) throw error;
      const outcome = controller.signal.aborted
        ? { status: "interrupted" as const }
        : { status: "failed" as const, error: errorText(error) };
      await this.#lock.run(agentId, () => this.#settle(activation, loop, outcome, finalText));
    }
  }

  /**
   * Record the end of an activation, hand its result to the caller or the registry and free its resources.
   * Runs inside the child lock and never throws.
   */
  async #settle(
    activation: Activation,
    loop: ChildLoop | undefined,
    outcome: { readonly status: SubagentActivationStatus; readonly error?: string },
    finalText: string,
  ): Promise<void> {
    const { agentId, rootId, child } = activation;
    const onError = report(this.options.onError);
    activation.settling = true;
    activation.settled = true;
    if (loop) {
      try {
        loop.quiesce();
        await loop.waitForIdle();
      } catch (error) {
        onError(error);
      }
    }
    let omitted = false;
    try {
      omitted = child ? closingOmitted(child, activation.startSeq, rootId) : false;
    } catch (error) {
      onError(error);
    }
    const bounded = truncateUtf8(finalText);
    if (activation.admitted)
      await activation
        .lease!.finish(
          outcome.status === "completed" ? "completed" : outcome.status === "interrupted" ? "cancelled" : "failed",
          { status: outcome.status, text: bounded.text },
        )
        .catch(onError);
    const summary = settleSummary({
      agentId,
      description: activation.description,
      status: outcome.status,
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    });
    // An exit leaves the activation open in the Journal; the next start records it as lost.
    if (!this.#disposing && activation.controller.signal.reason !== "host-shutdown") {
      try {
        const root = await this.options.openSession(rootId);
        await root.append(
          coreEvent("subagent/activation", {
            op: "settle",
            agentId,
            activationId: activation.activationId,
            status: outcome.status,
            summary,
            ...(bounded.text ? { result: bounded.text } : {}),
            ...(bounded.truncated ? { resultTruncated: true } : {}),
            delivery: SETTLE_DELIVERY[activation.delivery],
            endedAt: this.#now(),
          }),
        );
        await root.flush();
      } catch (error) {
        onError(error);
      }
    }
    // The transcript header shows the settled status before the parent reads the notice or the result.
    if (!isExternal(activation.kind)) await this.#refresh(agentId);
    activation.terminal.resolve({
      status: TERMINAL_STATUS[outcome.status],
      summary,
      ...(omitted ? { body: "", note: CLOSING_OMITTED_NOTE } : { body: closingBody(bounded.text, bounded.truncated) }),
    });
    await child?.close().catch(onError);
    await activation.scope?.dispose().catch(onError);
    await activation.lease?.release().catch(onError);
    if (this.#active.get(agentId) === activation) this.#active.delete(agentId);
    // A synchronous caller gets the result once the child holds nothing: no open Session, scope or Harness lease.
    activation.result.resolve({
      status: outcome.status,
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
      text: bounded.text,
      truncated: bounded.truncated,
      byUser: activation.controller.signal.reason === "user",
    });
  }

  async #awaitSync(
    activation: Activation,
    signal: AbortSignal,
    detail: SubagentDetail,
    external: { readonly external?: string; readonly logMissing?: boolean } = {},
  ): Promise<SubagentToolOutcome> {
    const { agentId, description, transcriptPath } = activation;
    const winner = await new Promise<Settled | "moved">((resolve) => {
      const done = (value: Settled | "moved") => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        resolve(value);
      };
      void activation.result.promise.then(done);
      // Settlement already chose the caller; its result follows. Otherwise the registry takes over delivery now.
      const timer = setTimeout(() => {
        if (activation.settling || activation.delivery !== "caller") return;
        // Without a registry entry nobody would hear of it: stop it rather than leave it running unseen.
        this.#register(activation).catch((error) => {
          report(this.options.onError)(error);
          this.#stop(activation, "rewind");
        });
        done("moved");
      }, this.options.syncWaitMs ?? SUBAGENT_SYNC_WAIT_MS);
      timer.unref?.();
      const abort = () => activation.controller.abort("parent-abort");
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    if (winner === "moved") {
      await activation.registration;
      return ok(
        movedToBackground({ agentId, description, transcriptPath, ...external }),
        withStatus(detail, "running"),
      );
    }
    return ok(
      syncResult({
        agentId,
        description,
        transcriptPath,
        ...(external.logMissing ? { logMissing: true } : {}),
        status: winner.status,
        ...(winner.error === undefined ? {} : { error: winner.error }),
        result: winner.text,
        truncated: winner.truncated,
        ...(winner.byUser ? { byUser: true } : {}),
      }),
      withStatus(detail, winner.status),
    );
  }

  #observe(activation: Activation, event: SessionEventEnvelopeV1): void {
    if (
      event.type === "user/message" ||
      (event.type === "agent/inbox/spliced" && record(event.data).operation === "claim")
    )
      activation.ready.resolve();
    if (event.type === "step/end") void this.#refresh(activation.agentId);
  }

  async #refresh(sessionId: string): Promise<void> {
    await this.options.refreshTranscript(sessionId).catch(report(this.options.onError));
  }

  // ---- lookups ----

  async #caller(
    input: SubagentCaller,
  ): Promise<{ readonly ok: false; readonly outcome: SubagentToolOutcome } | (ResolvedCaller & { readonly ok: true })> {
    const session = this.options.getOpenSession(input.sessionId);
    if (!session)
      return { ok: false, outcome: fail("SESSION_UNAVAILABLE", `Session ${input.sessionId} is unavailable.`) };
    const lineage = session.header.lineage;
    if (lineage?.origin !== "delegation")
      return {
        ok: true,
        root: session,
        rootId: input.sessionId,
        isRoot: true,
        ...(input.scope ? { scope: input.scope } : {}),
      };
    const root =
      this.options.getOpenSession(lineage.parentSessionId) ?? (await this.options.openSession(lineage.parentSessionId));
    const scope = this.#active.get(input.sessionId)?.scope;
    return { ok: true, root, rootId: lineage.parentSessionId, isRoot: false, ...(scope ? { scope } : {}) };
  }

  /** `useSetting`: `agent` falls back to the default subagent model setting; `agent_fork` goes straight to the parent's settings. */
  #chooseModel(
    rootId: string,
    requested: string | undefined,
    effort: string | undefined,
    useSetting: boolean,
  ):
    | { readonly ok: true; readonly config: SubagentModelConfiguration }
    | { readonly ok: false; readonly outcome: SubagentToolOutcome } {
    const port = this.options.models();
    const usable = port.listUsableModels();
    const choose = (key: string) => {
      const model = usable.find((item) => item.key === key)!;
      if (effort !== undefined && !(model.reasoningEfforts as readonly string[]).includes(effort))
        return { ok: false as const, outcome: fail("UNKNOWN_EFFORT", unknownEffort(effort, key)) };
      const reasoningEffort = effort ?? model.defaultEffort;
      return {
        ok: true as const,
        config: {
          model: key,
          thinkingEnabled: effort !== undefined || model.thinkingDefault,
          ...(reasoningEffort ? { reasoningEffort } : {}),
        },
      };
    };
    if (requested !== undefined)
      return usable.some((item) => item.key === requested)
        ? choose(requested)
        : { ok: false, outcome: fail("UNKNOWN_MODEL", unknownModel(requested)) };
    const setting = useSetting ? port.subagentDefaultModel() : undefined;
    if (setting && usable.some((item) => item.key === setting)) return choose(setting);
    const { selectedSkillIds: _skills, ...parent } = this.options.parentConfiguration(rootId);
    if (effort === undefined) return { ok: true, config: parent };
    const current = parent.model ? usable.find((item) => item.key === parent.model) : undefined;
    if (current && !(current.reasoningEfforts as readonly string[]).includes(effort))
      return { ok: false, outcome: fail("UNKNOWN_EFFORT", unknownEffort(effort, current.key)) };
    return { ok: true, config: { ...parent, thinkingEnabled: true, reasoningEffort: effort } };
  }

  #running(rootId: string): number {
    return [...this.#active.values()].filter((item) => item.rootId === rootId).length;
  }
  get #limit(): number {
    return this.options.limit ?? SUBAGENT_CONCURRENCY_LIMIT;
  }
  #now(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
}

function turnOutcome(reason: string): { readonly status: SubagentActivationStatus; readonly error?: string } {
  return reason === "completed"
    ? { status: "completed" }
    : reason === "step-limit"
      ? { status: "max_steps" }
      : reason === "aborted"
        ? { status: "interrupted" }
        : { status: "failed", error: `Turn ended with ${reason}` };
}

type ResolvedCaller = {
  readonly root: SessionHandle;
  readonly rootId: string;
  readonly isRoot: boolean;
  readonly scope?: AgentScope;
};
type SubagentDetail = readonly { readonly label: string; readonly value: RuntimeJsonValue }[];

/** Serialize message delivery and settlement per child (DSH `ChildLock`). */
class ChildLock {
  readonly #tails = new Map<string, Promise<unknown>>();
  run<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(id) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(id, tail);
    void tail.then(() => {
      if (this.#tails.get(id) === tail) this.#tails.delete(id);
    });
    return result;
  }
}

type Deferred<T> = { readonly promise: Promise<T>; resolve(value: T): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
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
  return listedSubagents(subagentTree(root)).some(
    (agent) => isExternal(agent.kind) && canonicalFile(agent.transcriptPath) === canonicalPath,
  );
}

function canonicalFile(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolvePath(path);
  }
}

/** The task's kind label in `task_list` and the 子 Agent panel: the preset, `fork`, or the CLI. */
function kindLabel(activation: Pick<Activation, "kind" | "preset">): string {
  return activation.kind === "local" ? (activation.preset ?? "general") : activation.kind;
}

const SETTLE_DELIVERY: Readonly<Record<Delivery, SubagentDelivery>> = {
  caller: "returned",
  registry: "notified",
  stopped: "stopped",
  dropped: "lost",
};
/** The registry has no `interrupted` or `max_steps`: a stopped subagent is `stopped`, one cut off by the step limit `failed`. */
const TERMINAL_STATUS: Readonly<Record<SubagentActivationStatus, BackgroundTaskTerminal["status"]>> = {
  completed: "completed",
  interrupted: "stopped",
  failed: "failed",
  max_steps: "failed",
  lost: "failed",
};

/** The last `bytes` of a file, starting at a line boundary; empty when the file does not exist yet. */
async function readTail(path: string, bytes: number): Promise<string> {
  let file;
  try {
    file = await open(path, "r");
  } catch {
    return "";
  }
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    await file.read(buffer, 0, buffer.length, start);
    const text = buffer.toString("utf8");
    return start === 0 ? text : text.slice(text.indexOf("\n") + 1);
  } finally {
    await file.close();
  }
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
function details(input: {
  readonly agentId: string;
  readonly description: string;
  readonly kind: SubagentKind;
  readonly preset?: SubagentPreset;
  readonly transcriptPath: string;
  readonly background: boolean;
  readonly inheritedThroughSeq?: number;
  readonly trace?: boolean;
}): SubagentDetail {
  return Object.freeze<SubagentDetail[number][]>([
    ...(input.trace === false
      ? []
      : [
          {
            label: CONTEXT_TRACE_DETAIL_LABEL,
            value: {
              kind: "trace",
              path: input.transcriptPath,
              description: `Subagent transcript: ${input.description}`,
            },
          },
        ]),
    {
      label: "delegation",
      value: {
        childSessionId: input.agentId,
        agentId: input.agentId,
        kind: input.kind,
        ...(input.preset ? { preset: input.preset } : {}),
        description: input.description,
        transcriptPath: input.transcriptPath,
        background: input.background,
        ...(input.inheritedThroughSeq === undefined ? {} : { inheritedThroughSeq: input.inheritedThroughSeq }),
        status: "running",
      },
    },
  ]);
}

function isExternal(kind: SubagentKind): boolean {
  return kind === "codex" || kind === "claude-code";
}

/** True once the file exists; gives up at the deadline or once the run has settled (checking one last time). */
async function waitForFile(path: string, settled: Promise<unknown>, timeoutMs: number, pollMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let done = false;
  void settled.then(() => {
    done = true;
  });
  for (;;) {
    if (existsSync(path)) return true;
    const left = deadline - Date.now();
    if (done || left <= 0) return existsSync(path);
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, left)));
  }
}

/** The Agent mode of the Session's latest `turn/start`. */
function latestTurnMode(session: SessionHandle): RuntimeAgentMode | undefined {
  const mode = record(session.journal.latestEvent("turn/start")?.data).mode;
  return mode === "agent" || mode === "plan" || mode === "chat" ? mode : undefined;
}

function withStatus(detail: SubagentDetail, status: string): SubagentDetail {
  return detail.map((item) =>
    item.label === "delegation" ? { ...item, value: { ...record(item.value), status } } : item,
  );
}

function startData(
  activation: Activation,
  input: {
    readonly trigger: "spawn";
    readonly callId: string;
    readonly background: boolean;
    readonly startedAt: string;
  },
): Extract<CoreEventDataMap["subagent/activation"], { readonly op: "start" }> {
  return {
    op: "start",
    agentId: activation.agentId,
    activationId: activation.activationId,
    trigger: input.trigger,
    callId: input.callId,
    background: input.background,
    ...(activation.model.model ? { model: activation.model.model } : {}),
    ...(activation.model.reasoningEffort ? { reasoningEffort: activation.model.reasoningEffort } : {}),
    startedAt: input.startedAt,
  };
}

function modelInput(config: SubagentModelConfiguration): {
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: import("@actspace/shared").ModelReasoningEffort;
} {
  return {
    ...(config.model ? { model: config.model } : {}),
    ...(config.thinkingEnabled === undefined ? {} : { thinkingEnabled: config.thinkingEnabled }),
    ...(config.reasoningEffort
      ? { reasoningEffort: config.reasoningEffort as import("@actspace/shared").ModelReasoningEffort }
      : {}),
  };
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
function ok(text: string, detail?: SubagentDetail): SubagentToolOutcome {
  return detail ? { ok: true, text, detail } : { ok: true, text };
}
function fail(code: string, text: string): SubagentToolOutcome {
  return { ok: false, code, text };
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function report(onError: ((error: unknown) => void) | undefined): (error: unknown) => void {
  return (error) => {
    try {
      onError?.(error);
    } catch {
      /* diagnostics never fail the caller */
    }
  };
}
