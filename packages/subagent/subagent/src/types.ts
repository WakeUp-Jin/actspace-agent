import { serviceKey } from "@actspace/cordis-adapter";
import type { AgentScope } from "@actspace/scope";
import type { RuntimeJsonValue, SubagentPreset } from "@actspace/shared/runtime-v2";
import type { ExternalSubagentBackend, SpawnExternalInput } from "./external.js";

/** Host service id of {@link SubagentHostPort}; the Harness tool plugin injects it. */
export const SUBAGENT_HOST_SERVICE = "actspace.host.subagents" as const;

/** What a subagent tool returns: the model-visible text, plus result details on success. */
export type SubagentToolOutcome =
  | {
      readonly ok: true;
      readonly text: string;
      readonly detail?: readonly { readonly label: string; readonly value: RuntimeJsonValue }[];
    }
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

/** `agent_fork`: no preset; the fork gets exactly the caller's visible tools. */
export type SpawnForkInput = SubagentCaller & {
  readonly description: string;
  readonly prompt: string;
  readonly background: boolean;
  readonly model?: string;
  readonly reasoningEffort?: string;
  /** Tools the caller sees right now; the fork sees the same list (design 02 §5.1). */
  readonly parentToolNames: readonly string[];
  readonly signal: AbortSignal;
};

/** Host side of the subagent tools; the texts it returns are design 02 §2 verbatim. */
export interface SubagentHostPort {
  spawn(input: SpawnSubagentInput): Promise<SubagentToolOutcome>;
  spawnFork(input: SpawnForkInput): Promise<SubagentToolOutcome>;
  /** `agent_codex` / `agent_claude_code` (design 04): one CLI run, scheduled like any subagent. */
  spawnExternal(backend: ExternalSubagentBackend, input: SpawnExternalInput): Promise<SubagentToolOutcome>;
  sendMessage(
    input: SubagentCaller & { readonly agentId: string; readonly message: string },
  ): Promise<SubagentToolOutcome>;
  listModels(input: SubagentCaller): Promise<SubagentToolOutcome>;
}
export const SUBAGENT_HOST_PORT = serviceKey<SubagentHostPort>(SUBAGENT_HOST_SERVICE);
