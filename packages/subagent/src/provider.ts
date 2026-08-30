import { randomUUID } from "node:crypto";
import type { AgentLoop } from "@actspace/core-agent-loop";
import type { AgentScope } from "@actspace/core-scope";
import type { SessionHandle } from "@actspace/session-persistence";
import type { SessionStore } from "@actspace/session-persistence";
import { resolveSessionWorkspaceRoot } from "@actspace/session-jsonl";
import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { createChildSession } from "./child-session.js";
import { publishSubagentTerminal } from "./publication.js";
import type { StaticAgentPreset, StaticPresetRegistry } from "./preset.js";
import type { SubagentTerminalResult } from "./terminal-result.js";

export type SubagentInvocation = { readonly parentSession: SessionHandle; readonly parentScope: AgentScope; readonly parentCallId: string; readonly presetId: string; readonly task: string; readonly parentVisibleToolIds: readonly string[]; readonly delegationDepth: number; readonly signal?: AbortSignal; readonly isolatedScope?: boolean };
export interface ParentDelegationPort { recordRequested(input: { invocationId: string; presetId: string; parentCallId: string }): Promise<void>; recordTerminal(result: SubagentTerminalResult): Promise<void>; }
export type ChildLoopFactory = (input: { session: SessionHandle; scope: AgentScope; preset: StaticAgentPreset; allowedToolNames: readonly string[]; signal: AbortSignal; agentId: string }) => AgentLoop | Promise<AgentLoop>;

export class OneShotSubagentProvider {
  readonly #active = new Map<string, AbortController>();
  readonly #inflight = new Set<Promise<SubagentTerminalResult>>();
  readonly #linked = new Set<string>();
  #accepting = true;
  constructor(private readonly options: { readonly store: SessionStore; readonly presets: StaticPresetRegistry; readonly parentPort?: ParentDelegationPort; readonly createLoop: ChildLoopFactory; readonly manifestDigest: string; readonly plugins: readonly { id: string; version: string }[] }) {}

  invoke(input: SubagentInvocation): Promise<SubagentTerminalResult> {
    const task = this.#invoke(input);
    this.#inflight.add(task);
    void task.then(() => this.#inflight.delete(task), () => this.#inflight.delete(task));
    return task;
  }

  async #invoke(input: SubagentInvocation): Promise<SubagentTerminalResult> {
    if (!this.#accepting) throw new Error("Subagent provider is quiescing.");
    const preset = this.options.presets.get(input.presetId);
    if (input.delegationDepth >= preset.maxDelegationDepth) throw new Error("Subagent delegation depth exceeded.");
    const invocationId = randomUUID(); const childSessionId = randomUUID(); const childAgentId = randomUUID(); const started = Date.now();
    const allowedToolNames = intersectTools(input.parentVisibleToolIds, preset);
    if (preset.readOnly && allowedToolNames.some((name) => !/^(read_file|list_directory|grep|glob)$/.test(name))) throw new Error("Explore preset cannot receive side-effect tools.");
    const parentPort = this.options.parentPort ?? sessionParentPort(input.parentSession);
    await parentPort.recordRequested({ invocationId, presetId: preset.id, parentCallId: input.parentCallId });
    const controller = new AbortController(); this.#active.set(invocationId, controller);
    const timeout = setTimeout(() => controller.abort("subagent-timeout"), preset.maxDurationMs); timeout.unref?.();
    const parentAbort = () => controller.abort(input.signal?.reason);
    if (input.signal?.aborted) parentAbort(); else input.signal?.addEventListener("abort", parentAbort, { once: true });
    let child: SessionHandle | undefined;
    let scope: AgentScope | undefined;
    let result: SubagentTerminalResult;
    try {
      const workspaceRoot = resolveSessionWorkspaceRoot(input.parentSession.header, input.parentSession.journal.events);
      child = await createChildSession({ store: this.options.store, parentSessionId: input.parentSession.header.sessionId, parentBoundarySeq: input.parentSession.lastSeq, parentCallId: input.parentCallId, childSessionId, createdAt: new Date().toISOString(), ...(workspaceRoot ? { cwd: workspaceRoot } : {}), delegationDepth: input.delegationDepth + 1, task: input.task, preset, manifestDigest: this.options.manifestDigest, plugins: this.options.plugins });
      scope = input.isolatedScope === true ? input.parentScope.isolatedChild(childAgentId) : input.parentScope.child(childAgentId);
      const loop = await this.options.createLoop({ session: child, scope, preset, allowedToolNames, signal: controller.signal, agentId: childAgentId });
      if (controller.signal.aborted) loop.abort("parent-abort");
      const turn = await loop.runTurn({ content: input.task });
      await child.flush();
      result = terminal({ invocationId, childAgentId, childSessionId, presetId: preset.id, status: turn.reason === "completed" ? "completed" : turn.reason === "aborted" ? "aborted" : "failed", text: turn.finalText, durationMs: Date.now() - started });
    } catch (error) {
      result = terminal({ invocationId, childAgentId, childSessionId, presetId: preset.id, status: controller.signal.aborted ? "aborted" : "failed", text: "", durationMs: Date.now() - started, failure: { code: controller.signal.aborted ? "SUBAGENT_ABORTED" : child === undefined ? "SUBAGENT_SETUP_FAILED" : "SUBAGENT_FAILED", message: error instanceof Error ? error.message : String(error), retryable: false } });
    }
    let publicationFailure: unknown;
    if (child !== undefined) {
      try {
        await publishSubagentTerminal(child, result);
      } catch (error) {
        publicationFailure = error;
        result = terminal({ invocationId, childAgentId, childSessionId, presetId: preset.id, status: "failed", text: "", durationMs: Date.now() - started, failure: { code: "SUBAGENT_PUBLICATION_FAILED", message: error instanceof Error ? error.message : String(error), retryable: false } });
      }
    }
    const cleanup = await Promise.allSettled([
      child?.close() ?? Promise.resolve(),
      scope?.dispose() ?? Promise.resolve(),
    ]);
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", parentAbort);
    this.#active.delete(invocationId);
    const cleanupFailure = cleanup.find((entry): entry is PromiseRejectedResult => entry.status === "rejected")?.reason;
    if (publicationFailure !== undefined || cleanupFailure !== undefined) {
      const failure = publicationFailure ?? cleanupFailure;
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

function intersectTools(parent: readonly string[], preset: StaticAgentPreset): readonly string[] { const visible = new Set(parent); return Object.freeze(preset.allowedToolNames.filter((name) => visible.has(name)).sort()); }
function terminal(input: Omit<SubagentTerminalResult, "usage" | "toolUseCount" | "artifacts" | "failure"> & { failure?: SubagentTerminalResult["failure"] }): SubagentTerminalResult { return Object.freeze({ ...input, usage: EMPTY_LLM_USAGE, toolUseCount: 0, artifacts: Object.freeze([]), failure: input.failure ?? null }); }

function sessionParentPort(session: SessionHandle): ParentDelegationPort {
  return Object.freeze({
    recordRequested: async ({ invocationId, presetId, parentCallId }: Parameters<ParentDelegationPort["recordRequested"]>[0]) => { await session.append(core("delegation/requested", { invocationId, presetId, parentCallId })); await session.flush(); },
    recordTerminal: async (result: SubagentTerminalResult) => { await session.append(core("delegation/completed", { invocationId: result.invocationId, childSessionId: result.childSessionId, presetId: result.presetId, status: result.status })); },
  });
}

function core(type: string, data: Record<string, unknown>) { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never; }
