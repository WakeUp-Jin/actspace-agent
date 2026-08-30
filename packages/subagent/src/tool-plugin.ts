import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { AgentScope } from "@actspace/core-scope";
import type { SessionHandle } from "@actspace/session-persistence";
import type { ToolDefinition } from "@actspace/tools-runtime";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolRuntime } from "@actspace/tools-runtime";
import type { OneShotSubagentProvider } from "./provider.js";

const PLUGIN_ID = "actspace.subagent";
export type ParentAgentAssembly = { readonly session: SessionHandle; readonly scope: AgentScope };
export type SubagentToolRegistration = { readonly name: string; readonly dispose: () => Promise<void> };

export function registerSubagentTools(
  runtime: ToolRuntime,
  provider: OneShotSubagentProvider,
  resolveParent: (sessionId: string) => ParentAgentAssembly | undefined,
): readonly SubagentToolRegistration[] {
  return Object.freeze([
    register("agent", "Delegate a bounded task to a one-shot general-purpose child Agent with its own Session and context.", "actspace.agent"),
    register("explore", "Delegate a focused read-only repository investigation to a one-shot child Agent.", "actspace.explore"),
  ]);

  function register(localName: "agent" | "explore", description: string, presetId: string): SubagentToolRegistration {
    const definition: ToolDefinition = Object.freeze({
      abiVersion: 2,
      pluginId: PLUGIN_ID,
      name: localName,
      definitionVersion: 1,
      description,
      inputSchema: { type: "object", properties: { task: { type: "string", minLength: 1, maxLength: 32_000 } }, required: ["task"], additionalProperties: false },
      effects: [],
      concurrency: "declared-safe",
      sensitiveArgumentPaths: [],
      resultSchemaVersion: 1,
    });
    const handle = runtime.register({
      definition,
      executor: {
        concurrencySafe: true,
        execute: async (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => {
          const parent = resolveParent(context.sessionId);
          if (parent === undefined) return failed("PARENT_AGENT_UNAVAILABLE", `Parent Agent for Session ${context.sessionId} is unavailable.`);
          const task = typeof args.task === "string" ? args.task.trim() : "";
          if (task.length === 0) return failed("INVALID_SUBAGENT_TASK", "Subagent task must be a non-empty string.");
          const result = await provider.invoke({
            parentSession: parent.session,
            parentScope: parent.scope,
            parentCallId: context.callId,
            presetId,
            task,
            parentVisibleToolIds: runtime.registry.listDefinitions().map((item) => item.name),
            delegationDepth: parent.session.header.lineage?.delegationDepth ?? 0,
            signal: context.signal,
          });
          if (result.status !== "completed") return failed(result.failure?.code ?? "SUBAGENT_FAILED", result.failure?.message ?? `Subagent ended with ${result.status}.`);
          return {
            status: "completed",
            summary: `${localName} completed`,
            modelOutput: [{ type: "text", text: result.text }],
            detail: [{ label: "delegation", value: { invocationId: result.invocationId, childAgentId: result.childAgentId, childSessionId: result.childSessionId, presetId: result.presetId, durationMs: result.durationMs } }],
          };
        },
      },
    });
    return Object.freeze({ name: definition.name, dispose: () => handle.dispose() });
  }
}

function failed(code: string, message: string) {
  return { status: "failed" as const, summary: "Subagent failed", modelOutput: [{ type: "text" as const, text: message }], failure: { code, message, retryable: false } };
}
