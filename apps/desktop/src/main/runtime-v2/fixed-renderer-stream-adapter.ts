import type { AgentLoopLiveEvent } from "@actspace/runtime";
import type { RuntimeStreamEvent } from "@actspace/shared";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { toolPreview } from "./fixed-renderer-tool-preview";

type Identity = { sessionId: string; agentRunId: string; turnId: string; llmCallId: string; toolCallId: string; toolName: string };
type Entry = { identity: Identity; args: RuntimeV2JsonValue; phase: "streaming" | "prepared" | "running" | "finished"; message?: string };

/** Transient presentation state. Journal and tool execution remain the source of truth. */
export class FixedRendererStreamAdapter {
  constructor(private readonly workspaceFor: (sessionId: string) => string | undefined = () => undefined) {}
  readonly #calls = new Map<string, Entry>();
  readonly #closedRuns = new Set<string>();
  readonly #listeners = new Set<(event: RuntimeStreamEvent) => void>();
  subscribe(listener: (event: RuntimeStreamEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
  dispose(): void {
    this.#calls.clear();
    this.#closedRuns.clear();
    this.#listeners.clear();
  }
  #emit(event: RuntimeStreamEvent): void {
    for (const listener of this.#listeners) {
      try { listener(event); } catch { /* Presentation observers cannot fail the run. */ }
    }
  }
  #key(sessionId: string, agentRunId: string, callId: string): string { return JSON.stringify([sessionId, agentRunId, callId]); }
  #preview(entry: Entry) {
    return toolPreview(entry.identity.toolName, undefined, entry.message ? { summary: entry.message } : {}, { args: entry.args }, undefined, entry.identity.sessionId, entry.identity.agentRunId, entry.phase, this.workspaceFor(entry.identity.sessionId));
  }
  #publish(entry: Entry, isInitial = false): void {
    this.#emit({ type: "tool_call_streaming", ...entry.identity, preview: this.#preview(entry), isInitial });
  }
  accept(event: AgentLoopLiveEvent): void {
    const runKey = JSON.stringify([event.sessionId, event.agentRunId]);
    if (this.#closedRuns.has(runKey)) return;
    const ids = { sessionId: event.sessionId, agentRunId: event.agentRunId, turnId: event.turnId };
    if (event.kind === "assistant-delta" || event.kind === "reasoning-delta") {
      this.#emit({ type: event.kind === "assistant-delta" ? "assistant_text_delta" : "assistant_thinking_delta", ...ids, llmCallId: event.requestId, messageId: event.messageId, delta: event.message });
      return;
    }
    if (event.kind === "run-state") {
      if (event.message === "started") {
        this.#emit({ type: "agent_run_started", sessionId: event.sessionId, agentRunId: event.agentRunId });
        this.#emit({ type: "agent_turn_started", ...ids, turnIndex: 0 });
      } else if (event.message === "request-started" && event.requestId) {
        this.#emit({ type: "llm_call_started", ...ids, llmCallId: event.requestId, turnIndex: 0, attempt: 1 });
      } else if (["completed", "step-limit", "aborted", "failed"].includes(event.message)) {
        this.#closedRuns.add(runKey);
        if (this.#closedRuns.size > 128) this.#closedRuns.delete(this.#closedRuns.values().next().value!);
        for (const [key, entry] of this.#calls) {
          if (entry.identity.sessionId !== event.sessionId || entry.identity.agentRunId !== event.agentRunId) continue;
          this.#calls.delete(key);
        }
        if (event.message === "aborted") this.#emit({ type: "agent_run_aborted", ...ids });
        else if (event.message === "failed") this.#emit({ type: "agent_run_failed", ...ids, error: { code: "AGENT_RUN_FAILED", message: "The Agent run failed.", recoverable: true } });
        else this.#emit({ type: "agent_run_finished", ...ids, resultEventIds: [] });
      }
      return;
    }
    const key = this.#key(event.sessionId, event.agentRunId, event.callId);
    let entry = this.#calls.get(key);
    if (entry?.phase === "finished") return;
    if (entry && entry.identity.llmCallId !== event.requestId) return;
    const initial = entry === undefined;
    entry ??= { identity: { ...ids, llmCallId: event.requestId, toolCallId: event.callId, toolName: event.name }, args: {}, phase: "streaming" };
    if (event.name) entry.identity.toolName = event.name;
    this.#calls.set(key, entry);
    if (event.kind === "tool-call-delta") {
      if (entry.phase !== "streaming") return;
      if (initial) this.#publish(entry, true);
    } else if (event.kind === "tool-prepared") {
      if (entry.phase === "running") return;
      entry.args = event.arguments;
      entry.phase = "prepared";
      this.#publish(entry, initial);
    } else if (event.kind === "tool-started") {
      entry.phase = "running";
      this.#emit({ type: "tool_started", ...entry.identity, argsPreview: "", preview: this.#preview(entry) });
    } else if (event.kind === "tool-finished") {
      entry.phase = "finished";
      const preview = toolPreview(event.name, undefined, event.result as unknown as Record<string, RuntimeV2JsonValue>, { args: entry.args }, undefined, event.sessionId, event.agentRunId, "finished", this.workspaceFor(event.sessionId));
      this.#emit({ type: "tool_finished", ...entry.identity, resultEventId: event.resultEventId, isError: event.result.status !== "completed", status: event.result.status, preview });
      entry.args = {};
    }
  }
  progress(update: { sessionId: string; agentRunId: string; callId: string; message: string }): void {
    const entry = this.#calls.get(this.#key(update.sessionId, update.agentRunId, update.callId));
    if (!entry || entry.phase !== "running") return;
    entry.message = update.message;
    this.#publish(entry);
  }
}
