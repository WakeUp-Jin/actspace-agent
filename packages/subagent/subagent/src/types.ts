import type { AgentScope } from "@actspace/scope";
import type { RuntimeV2JsonValue, SubagentPreset } from "@actspace/shared/runtime-v2";

/** Host service id of {@link SubagentHostPort}; the Harness tool plugin injects it. */
export const SUBAGENT_HOST_SERVICE = "actspace.host.subagents" as const;

/** What a subagent tool returns: the model-visible text, plus result details on success. */
export type SubagentToolOutcome =
  | { readonly ok: true; readonly text: string; readonly detail?: readonly { readonly label: string; readonly value: RuntimeV2JsonValue }[] }
  | { readonly ok: false; readonly code: string; readonly text: string };

/** The calling agent: its Session and, for a main agent, its scope (child callers are resolved by the Host). */
export type SubagentCaller = { readonly sessionId: string; readonly callId: string; readonly scope?: AgentScope };

export type SpawnSubagentInput = SubagentCaller & {
  readonly description: string;
  readonly prompt: string;
  readonly preset: SubagentPreset;
  readonly background: boolean;
  readonly model?: string;
  readonly reasoningEffort?: string;
  /** Tools the caller may use right now and every registered tool name; the subagent's tools derive from both. */
  readonly parentToolNames: readonly string[];
  readonly registeredToolNames: readonly string[];
  /** The calling tool's signal: stopping the parent's turn interrupts a synchronous wait. */
  readonly signal: AbortSignal;
};

/** One running subagent as the main agent's context lists it (design 02 §6.4). */
export type RunningSubagent = { readonly agentId: string; readonly description: string; readonly label: string; readonly startedAt: string; readonly transcriptPath: string };

/** Host side of the subagent tools; the texts it returns are design 02 §2 verbatim. */
export interface SubagentHostPort {
  spawn(input: SpawnSubagentInput): Promise<SubagentToolOutcome>;
  sendMessage(input: SubagentCaller & { readonly agentId: string; readonly message: string }): Promise<SubagentToolOutcome>;
  waitForInput(input: SubagentCaller & { readonly timeoutMs: number; readonly signal: AbortSignal }): Promise<SubagentToolOutcome>;
  listAgents(input: SubagentCaller): Promise<SubagentToolOutcome>;
  interrupt(input: SubagentCaller & { readonly agentId: string }): Promise<SubagentToolOutcome>;
  listModels(input: SubagentCaller): Promise<SubagentToolOutcome>;
  /** Running subagents of a live main Session, oldest first; empty for any other Session. */
  running(sessionId: string): readonly RunningSubagent[];
}
