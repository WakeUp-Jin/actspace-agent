import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { AgentScope } from "@actspace/scope";
import type { JsonSchema, ToolBodyResult, ToolDefinition, ToolExecutionContext, ToolRuntime } from "@actspace/tool-runtime";
import {
  AGENT_FORK_DESCRIPTION, AGENT_FORK_PARAMETERS, AGENT_PARAMETERS, AGENT_TOOL_DESCRIPTION, INTERRUPT_AGENT_DESCRIPTION, LIST_AGENTS_DESCRIPTION, LIST_SUBAGENT_MODELS_DESCRIPTION,
  SEND_MESSAGE_DESCRIPTION, SEND_MESSAGE_PARAMETERS, WAIT_AGENT_DESCRIPTION,
} from "./messages.js";
import type { SubagentCaller, SubagentHostPort, SubagentToolOutcome } from "./types.js";

/** The tools belong to the `actspace.subagent` Agent form member (agent-form.ts). */
export const SUBAGENT_TOOL_PLUGIN_ID = "actspace.subagent";
export const SUBAGENT_TOOL_NAMES = Object.freeze(["agent", "agent_fork", "send_message", "wait_agent", "list_agents", "interrupt_agent", "list_subagent_models"] as const);
export type SubagentToolRegistration = { readonly name: string; readonly dispose: () => Promise<void> };

const AGENT_ID = { type: "string", minLength: 1, description: SEND_MESSAGE_PARAMETERS.agent_id };

/**
 * Register the seven subagent tools of `local` and forked subagents (design 02 §2). The Host port does the work;
 * `mainScope` resolves a main agent's scope (child callers are resolved by the Host).
 */
export function registerSubagentTools(runtime: ToolRuntime, port: SubagentHostPort, mainScope: (sessionId: string) => AgentScope | undefined): readonly SubagentToolRegistration[] {
  const caller = (context: ToolExecutionContext): SubagentCaller => {
    const scope = mainScope(context.sessionId);
    return { sessionId: context.sessionId, callId: context.callId, ...(scope ? { scope } : {}) };
  };
  return Object.freeze([
    register("agent", AGENT_TOOL_DESCRIPTION, {
      description: { type: "string", minLength: 1, maxLength: 60, description: AGENT_PARAMETERS.description },
      prompt: { type: "string", minLength: 1, description: AGENT_PARAMETERS.prompt },
      agent_preset: { type: "string", enum: ["general", "explore"], default: "general", description: AGENT_PARAMETERS.agent_preset },
      background: { type: "boolean", default: true, description: AGENT_PARAMETERS.background },
      model: { type: "string", minLength: 1, description: AGENT_PARAMETERS.model },
      reasoning_effort: { type: "string", minLength: 1, description: AGENT_PARAMETERS.reasoning_effort },
    }, ["description", "prompt"], (args, context) => {
      const self = caller(context);
      const registered = runtime.registry.listDefinitions().map(definition => definition.name);
      const parent = runtime.allowedToolNames(context.sessionId, `main:${context.sessionId}`);
      return port.spawn({
        ...self,
        description: text(args.description),
        prompt: text(args.prompt),
        preset: args.agent_preset === "explore" ? "explore" : "general",
        background: args.background !== false,
        ...(typeof args.model === "string" ? { model: args.model } : {}),
        ...(typeof args.reasoning_effort === "string" ? { reasoningEffort: args.reasoning_effort } : {}),
        parentToolNames: parent ? [...parent] : registered,
        registeredToolNames: registered,
        signal: context.signal,
      });
    }),
    register("agent_fork", AGENT_FORK_DESCRIPTION, {
      description: { type: "string", minLength: 1, maxLength: 60, description: AGENT_FORK_PARAMETERS.description },
      prompt: { type: "string", minLength: 1, description: AGENT_FORK_PARAMETERS.prompt },
      background: { type: "boolean", default: true, description: AGENT_FORK_PARAMETERS.background },
      model: { type: "string", minLength: 1, description: AGENT_FORK_PARAMETERS.model },
      reasoning_effort: { type: "string", minLength: 1, description: AGENT_FORK_PARAMETERS.reasoning_effort },
    }, ["description", "prompt"], (args, context) => {
      const parent = runtime.allowedToolNames(context.sessionId, `main:${context.sessionId}`);
      return port.spawnFork({
        ...caller(context),
        description: text(args.description),
        prompt: text(args.prompt),
        background: args.background !== false,
        ...(typeof args.model === "string" ? { model: args.model } : {}),
        ...(typeof args.reasoning_effort === "string" ? { reasoningEffort: args.reasoning_effort } : {}),
        parentToolNames: parent ? [...parent] : runtime.registry.listDefinitions().map(definition => definition.name),
        signal: context.signal,
      });
    }),
    register("send_message", SEND_MESSAGE_DESCRIPTION, {
      agent_id: AGENT_ID,
      message: { type: "string", minLength: 1, maxLength: 20_000 },
    }, ["agent_id", "message"], (args, context) => port.sendMessage({ ...caller(context), agentId: text(args.agent_id), message: text(args.message) })),
    register("wait_agent", WAIT_AGENT_DESCRIPTION, {
      timeout_ms: { type: "integer", minimum: 10_000, maximum: 3_600_000, default: 30_000 },
    }, [], (args, context) => port.waitForInput({ ...caller(context), timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : 30_000, signal: context.signal })),
    register("list_agents", LIST_AGENTS_DESCRIPTION, {}, [], (_args, context) => port.listAgents(caller(context))),
    register("interrupt_agent", INTERRUPT_AGENT_DESCRIPTION, { agent_id: AGENT_ID }, ["agent_id"], (args, context) => port.interrupt({ ...caller(context), agentId: text(args.agent_id) })),
    register("list_subagent_models", LIST_SUBAGENT_MODELS_DESCRIPTION, {}, [], (_args, context) => port.listModels(caller(context))),
  ]);

  function register(name: string, description: string, properties: Record<string, JsonSchema>, required: readonly string[], run: (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<SubagentToolOutcome>): SubagentToolRegistration {
    const definition: ToolDefinition = Object.freeze({
      abiVersion: 2, pluginId: SUBAGENT_TOOL_PLUGIN_ID, name, definitionVersion: 2, description,
      inputSchema: { type: "object", properties, required: [...required], additionalProperties: false },
      effects: [], concurrency: "declared-safe", sensitiveArgumentPaths: [], resultSchemaVersion: 1,
    });
    const handle = runtime.register({ definition, executor: { concurrencySafe: true, execute: async (args, context) => toResult(name, await run(args, context)) } });
    return Object.freeze({ name, dispose: () => handle.dispose() });
  }
}

function toResult(name: string, outcome: SubagentToolOutcome): ToolBodyResult {
  if (!outcome.ok) return { status: "failed", summary: `${name} failed`, modelOutput: [{ type: "text", text: outcome.text }], failure: { code: outcome.code, message: outcome.text, retryable: false } };
  return { status: "completed", summary: `${name} completed`, modelOutput: [{ type: "text", text: outcome.text }], ...(outcome.detail ? { detail: outcome.detail } : {}) };
}

function text(value: RuntimeV2JsonValue | undefined): string { return typeof value === "string" ? value.trim() : ""; }
