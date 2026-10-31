import { randomUUID } from "node:crypto";
import type { AgentLoop } from "@actspace/core-agent-loop";
import type { AgentScope } from "@actspace/core-scope";
import type { SessionHandle } from "@actspace/session-persistence";
import type { SessionStore } from "@actspace/session-persistence";
import { resolveSessionWorkspaceRoot } from "@actspace/session-journal";
import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { createChildSession } from "./child-session.js";
import { publishSubagentTerminal } from "./publication.js";
import type { StaticAgentPreset, StaticPresetRegistry } from "./preset.js";
import type { SubagentTerminalResult } from "./terminal-result.js";

export type SubagentInvocation = { readonly parentSession: SessionHandle; readonly parentScope: AgentScope; readonly parentCallId: string; readonly presetId: string; readonly task: string; readonly parentVisibleToolIds: readonly string[]; readonly delegationDepth: number; readonly signal?: AbortSignal; readonly isolatedScope?: boolean };
export interface ParentDelegationPort { recordRequested(input: { invocationId: string; presetId: string; parentCallId: string; childSessionId: string }): Promise<void>; recordTerminal(result: SubagentTerminalResult): Promise<void>; }
export type ChildLoop = Pick<AgentLoop, "runTurn" | "abort" | "waitForIdle" | "quiesce">;
export type ChildLoopFactory = (input: { session: SessionHandle; scope: AgentScope; preset: StaticAgentPreset; allowedToolNames: readonly string[]; signal: AbortSignal; agentId: string }) => ChildLoop | Promise<ChildLoop>;
export type ChildRunLease = {
  readonly scope: AgentScope; readonly createLoop: ChildLoopFactory;
  start?(session: SessionHandle, content: string, runId: string): Promise<{ messageId: string }>;
  finish?(outcome: "completed" | "cancelled" | "failed", result: import("@actspace/shared/runtime-v2").RuntimeV2JsonValue): Promise<void>;
  release(): Promise<void>;
};

/** A started child Run; `result` settles with the terminal and parent `delegation/completed`. */
export type SubagentLaunch = { readonly invocationId: string; readonly childSessionId: string; readonly childAgentId: string; readonly presetId: string; readonly result: Promise<SubagentTerminalResult>; stop(reason?: string): void; progress(): SubagentProgress | undefined };
/** Read from the child Journal while it runs; undefined before the child Session exists or after it closes. */
export type SubagentProgress = { readonly steps: number; readonly toolCalls: number; readonly recentToolCalls: readonly string[] };

export class OneShotSubagentProvider {
  readonly #active = new Map<string, AbortController>();
  readonly #inflight = new Set<Promise<SubagentTerminalResult>>();
  readonly #linked = new Set<string>();
  #accepting = true;
  constructor(private readonly options: { readonly store: SessionStore; readonly presets: StaticPresetRegistry; readonly parentPort?: ParentDelegationPort; readonly createLoop: ChildLoopFactory; readonly acquireRun?: (preset: StaticAgentPreset, signal?: AbortSignal, invocation?: SubagentInvocation) => ChildRunLease | Promise<ChildRunLease>; readonly manifestDigest: string; readonly plugins: readonly { id: string; version: string }[] }) {}

  async invoke(input: SubagentInvocation): Promise<SubagentTerminalResult> {
    return (await this.launch(input)).result;
  }

  /**
   * Resolve once the child holds its own Harness lease, so it no longer depends
   * on the parent scope. Without `signal` the child outlives the parent Run.
   */
  async launch(input: SubagentInvocation): Promise<SubagentLaunch> {
    if (!this.#accepting) throw new Error("Subagent provider is quiescing.");
    const preset = this.options.presets.get(input.presetId);
    if (input.delegationDepth >= preset.maxDelegationDepth) throw new Error("Subagent delegation depth exceeded.");
    const invocationId = randomUUID(); const childSessionId = randomUUID(); const childAgentId = randomUUID(); const started = Date.now();
    const allowedToolNames = intersectTools(input.parentVisibleToolIds, preset);
    if (preset.readOnly && allowedToolNames.some((name) => !/^(read_file|list_directory|grep|glob)$/.test(name))) throw new Error("Read-only subagent preset cannot receive side-effect tools.");
    const parentPort = this.options.parentPort ?? sessionParentPort(input.parentSession);
    await parentPort.recordRequested({ invocationId, presetId: preset.id, parentCallId: input.parentCallId, childSessionId });
    const controller = new AbortController(); this.#active.set(invocationId, controller);
    let markReady!: () => void;
    const ready = new Promise<void>(resolve => { markReady = resolve; });
    const holder: { child?: SessionHandle; closed?: boolean } = {};
    const result = this.#run(input, { preset, invocationId, childSessionId, childAgentId, started, allowedToolNames, parentPort, controller, markReady, holder });
    this.#inflight.add(result);
    void result.then(() => this.#inflight.delete(result), () => this.#inflight.delete(result));
    await Promise.race([ready, result.then(() => undefined, () => undefined)]);
    return Object.freeze({ invocationId, childSessionId, childAgentId, presetId: preset.id, result, stop: (reason = "task-stop") => controller.abort(reason), progress: () => holder.child && !holder.closed ? childProgress(holder.child) : undefined });
  }

  async #run(input: SubagentInvocation, run: { readonly preset: StaticAgentPreset; readonly invocationId: string; readonly childSessionId: string; readonly childAgentId: string; readonly started: number; readonly allowedToolNames: readonly string[]; readonly parentPort: ParentDelegationPort; readonly controller: AbortController; readonly markReady: () => void; readonly holder: { child?: SessionHandle; closed?: boolean } }): Promise<SubagentTerminalResult> {
    const { preset, invocationId, childSessionId, childAgentId, started, allowedToolNames, parentPort, controller } = run;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const parentAbort = () => controller.abort(input.signal?.reason);
    if (input.signal?.aborted) parentAbort(); else input.signal?.addEventListener("abort", parentAbort, { once: true });
    let child: SessionHandle | undefined;
    let scope: AgentScope | undefined;
    let lease: ChildRunLease | undefined;
    let loop: ChildLoop | undefined;
    let admitted = false;
    let result: SubagentTerminalResult;
    try {
      const workspaceRoot = resolveSessionWorkspaceRoot(input.parentSession.header, input.parentSession.journal);
      child = await createChildSession({ store: this.options.store, parentSessionId: input.parentSession.header.sessionId, parentBoundarySeq: input.parentSession.lastSeq, parentCallId: input.parentCallId, childSessionId, createdAt: new Date().toISOString(), ...(workspaceRoot ? { cwd: workspaceRoot } : {}), delegationDepth: input.delegationDepth + 1, task: input.task, preset, manifestDigest: this.options.manifestDigest, plugins: this.options.plugins });
      run.holder.child = child;
      controller.signal.throwIfAborted();
      lease = await this.options.acquireRun?.(preset, controller.signal, input);
      controller.signal.throwIfAborted();
      const content = `${input.task}\n\nSubagent execution boundary: only read_file, list_directory, grep and glob are available. Do not request Bash, edits, approvals or nested delegation. Work only in the inherited workspace. If target files are absent or outside its boundary, stop and report the blocker and partial findings to the parent instead of repeatedly searching unrelated directories.`;
      const accepted = await lease?.start?.(child, content, invocationId);
      admitted = accepted !== undefined;
      scope = lease ? lease.scope.child(childAgentId) : input.isolatedScope === true ? input.parentScope.isolatedChild(childAgentId) : input.parentScope.child(childAgentId);
      loop = await (lease?.createLoop ?? this.options.createLoop)({ session: child, scope, preset, allowedToolNames, signal: controller.signal, agentId: childAgentId });
      controller.signal.throwIfAborted();
      run.markReady();
      timeout = setTimeout(() => controller.abort("subagent-timeout"), preset.maxDurationMs);
      timeout.unref?.();
      const turn = await loop.runTurn({ content, agentRunId: invocationId, ...(accepted ? { messageId: accepted.messageId } : {}) });
      await child.flush();
      const status = controller.signal.aborted || turn.reason === "aborted" ? "aborted" : turn.reason === "completed" ? "completed" : "failed";
      const failure = controller.signal.reason === "subagent-timeout"
        ? { code: "SUBAGENT_TIMEOUT", message: "子智能体达到执行时限。", retryable: false }
        : status === "failed"
          ? { code: turn.reason === "step-limit" ? "SUBAGENT_STEP_LIMIT" : "SUBAGENT_FAILED", message: turn.reason === "step-limit" ? `达到 ${preset.maxSteps} 步执行上限。请根据已有发现调整任务，勿原样重试。` : `Subagent ended with ${turn.reason}.`, retryable: false }
          : null;
      result = terminal({ invocationId, childAgentId, childSessionId, presetId: preset.id, status, text: turn.finalText, durationMs: Date.now() - started, failure });
    } catch (error) {
      result = terminal({ invocationId, childAgentId, childSessionId, presetId: preset.id, status: controller.signal.aborted ? "aborted" : "failed", text: "", durationMs: Date.now() - started, failure: { code: controller.signal.reason === "subagent-timeout" ? "SUBAGENT_TIMEOUT" : controller.signal.aborted ? "SUBAGENT_ABORTED" : child === undefined ? "SUBAGENT_SETUP_FAILED" : "SUBAGENT_FAILED", message: controller.signal.reason === "subagent-timeout" ? "子智能体达到执行时限。" : error instanceof Error ? error.message : String(error), retryable: false } });
    }
    clearTimeout(timeout);
    // A factory must not leave work using a retired generation during cleanup.
    let lifecycleFailure: unknown;
    if (loop) {
      try { loop.quiesce(); await loop.waitForIdle(); }
      catch (error) {
        lifecycleFailure = error;
        result = terminal({ ...result, status: "failed", failure: { code: "SUBAGENT_CLEANUP_FAILED", message: error instanceof Error ? error.message : String(error), retryable: false } });
      }
    }
    let publicationFailure: unknown;
    if (admitted) {
      try { await lease!.finish!(result.status === "completed" ? "completed" : result.status === "aborted" ? "cancelled" : "failed", { status: result.status, text: result.text }); }
      catch (error) { publicationFailure = error; result = terminal({ ...result, status: "failed", failure: { code: "SUBAGENT_PUBLICATION_FAILED", message: String(error), retryable: false } }); }
    }
    if (child !== undefined) {
      try {
        await publishSubagentTerminal(child, result);
      } catch (error) {
        publicationFailure = error;
        result = terminal({ invocationId, childAgentId, childSessionId, presetId: preset.id, status: "failed", text: "", durationMs: Date.now() - started, failure: { code: "SUBAGENT_PUBLICATION_FAILED", message: error instanceof Error ? error.message : String(error), retryable: false } });
      }
    }
    run.holder.closed = true;
    const cleanup: PromiseSettledResult<void>[] = lifecycleFailure === undefined ? await Promise.allSettled([
      child?.close() ?? Promise.resolve(),
      scope?.dispose() ?? Promise.resolve(),
    ]) : [];
    // Retain the generation if its consumers could not be proven stopped/disposed.
    if (lease && lifecycleFailure === undefined && !cleanup.some(entry => entry.status === "rejected")) cleanup.push(...await Promise.allSettled([lease.release()]));
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", parentAbort);
    this.#active.delete(invocationId);
    const cleanupFailure = cleanup.find((entry): entry is PromiseRejectedResult => entry.status === "rejected")?.reason;
    if (lifecycleFailure !== undefined || publicationFailure !== undefined || cleanupFailure !== undefined) {
      const failure = lifecycleFailure ?? publicationFailure ?? cleanupFailure;
      if (!this.#linked.has(childSessionId)) {
        await parentPort.recordTerminal(result);
        this.#linked.add(childSessionId);
      }
      throw failure;
    }
    if (!this.#linked.has(childSessionId)) { await parentPort.recordTerminal(result); this.#linked.add(childSessionId); }
    return result;
  }
  abortAll(reason = "runtime-shutdown"): void { this.#accepting = false; for (const controller of this.#active.values()) controller.abort(reason); }
  async dispose(reason = "runtime-shutdown"): Promise<void> { this.abortAll(reason); await Promise.allSettled([...this.#inflight]); }
  get activeCount(): number { return this.#active.size; }
}

function childProgress(child: SessionHandle): SubagentProgress {
  let steps = 0, toolCalls = 0;
  const recent: string[] = [];
  for (const event of child.journal.iterateEvents()) {
    if (event.type === "step/start") steps += 1;
    if (event.type !== "tool/call") continue;
    toolCalls += 1;
    const data = event.data as Record<string, unknown>;
    recent.push(`${String(data.name ?? "tool")} ${JSON.stringify(data.args ?? {})}`.slice(0, 120));
    if (recent.length > 3) recent.shift();
  }
  return Object.freeze({ steps, toolCalls, recentToolCalls: Object.freeze(recent) });
}

function intersectTools(parent: readonly string[], preset: StaticAgentPreset): readonly string[] { const visible = new Set(parent); return Object.freeze(preset.allowedToolNames.filter((name) => visible.has(name)).sort()); }
function terminal(input: Omit<SubagentTerminalResult, "usage" | "toolUseCount" | "artifacts" | "failure"> & { failure?: SubagentTerminalResult["failure"] }): SubagentTerminalResult { return Object.freeze({ ...input, usage: EMPTY_LLM_USAGE, toolUseCount: 0, artifacts: Object.freeze([]), failure: input.failure ?? null }); }

function sessionParentPort(session: SessionHandle): ParentDelegationPort {
  return Object.freeze({
    recordRequested: async ({ invocationId, presetId, parentCallId, childSessionId }: Parameters<ParentDelegationPort["recordRequested"]>[0]) => { await session.append(core("delegation/requested", { invocationId, presetId, parentCallId, childSessionId })); await session.flush(); },
    recordTerminal: async (result: SubagentTerminalResult) => { await session.append(core("delegation/completed", { invocationId: result.invocationId, childSessionId: result.childSessionId, presetId: result.presetId, status: result.status })); },
  });
}

function core(type: string, data: Record<string, unknown>) { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never; }
