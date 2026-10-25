import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { AgentScope } from "@actspace/core-scope";
import type { SessionHandle } from "@actspace/session-persistence";
import type { ToolDefinition } from "@actspace/tools-runtime";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { AGENT_RESULT_LIMIT_BYTES, truncateUtf8, type BackgroundTaskHost, type BackgroundTaskTerminal } from "@actspace/background-tasks";
import type { OneShotSubagentProvider, SubagentLaunch } from "./provider.js";
import type { SubagentTerminalResult } from "./terminal-result.js";

const PLUGIN_ID = "actspace.subagent";
export const MAX_BACKGROUND_AGENTS_PER_SESSION = 4;
const BACKGROUND_DESCRIPTION = " Set background=true to run it in the background: the call returns a task id at once and you are notified automatically when it finishes. Do not poll; keep working or end your turn.";
export type ParentAgentAssembly = { readonly session: SessionHandle; readonly scope: AgentScope };
export type SubagentToolRegistration = { readonly name: string; readonly dispose: () => Promise<void> };

export function registerSubagentTools(
  runtime: ToolRuntime,
  provider: Pick<OneShotSubagentProvider, "invoke" | "launch">,
  resolveParent: (sessionId: string) => ParentAgentAssembly | undefined,
  background?: BackgroundTaskHost,
): readonly SubagentToolRegistration[] {
  const suffix = background ? BACKGROUND_DESCRIPTION : "";
  return Object.freeze([
    register("agent", `Delegate a read-only analysis task to a child Agent. Only file reading and search are available; no Bash, edits, or approvals. Report workspace mismatches or blocked work without repeating the same search.${suffix}`, "actspace.agent"),
    register("explore", `Delegate a focused read-only repository investigation to a one-shot child Agent.${suffix}`, "actspace.explore"),
  ]);

  function register(localName: "agent" | "explore", description: string, presetId: string): SubagentToolRegistration {
    const definition: ToolDefinition = Object.freeze({
      abiVersion: 2,
      pluginId: PLUGIN_ID,
      name: localName,
      definitionVersion: 1,
      description,
      inputSchema: { type: "object", properties: { task: { type: "string", minLength: 1, maxLength: 32_000 }, ...(background ? { background: { type: "boolean", description: "Run in the background and get notified on completion. Default false." } } : {}) }, required: ["task"], additionalProperties: false },
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
          const invocation = {
            parentSession: parent.session,
            parentScope: parent.scope,
            parentCallId: context.callId,
            presetId,
            task,
            parentVisibleToolIds: runtime.registry.listDefinitions().map((item) => item.name),
            delegationDepth: parent.session.header.lineage?.delegationDepth ?? 0,
          };
          if (args.background === true && background) {
            if (background.runningCount(context.sessionId, "agent") >= MAX_BACKGROUND_AGENTS_PER_SESSION) return failed("BACKGROUND_TASK_LIMIT", `Background agent limit reached (${MAX_BACKGROUND_AGENTS_PER_SESSION}). Wait for a running one to finish or stop it with task_stop.`);
            // The parent turn's abort signal is not linked: only task_stop, the time limit or Host shutdown stop it.
            const launch = await provider.launch(invocation);
            const taskId = `agent_${launch.invocationId}`;
            const description = firstLine(task);
            const settled: { result?: SubagentTerminalResult } = {};
            void launch.result.then(result => { settled.result = result; }, () => undefined);
            await background.register({ taskId, kind: "agent", sessionId: context.sessionId, callId: context.callId, description,
              done: launch.result.then(result => backgroundTerminal(result, description)),
              output: async () => backgroundOutput(launch, settled.result),
              stop: async reason => { launch.stop(reason); await launch.result.catch(() => undefined); } });
            const text = [`Background ${localName} started.`, `task_id: ${taskId}`, `child_session_id: ${launch.childSessionId}`, "automatic_notification: true", "", "You will be notified when it finishes. Do not poll with task_output; continue other work or end your turn. Use task_wait only when you have nothing else to do."].join("\n");
            return { status: "completed", summary: `${localName} running in background`, modelOutput: [{ type: "text", text }],
              detail: [{ label: "delegation", value: { invocationId: launch.invocationId, childAgentId: launch.childAgentId, childSessionId: launch.childSessionId, presetId: launch.presetId, status: "running", background: true, taskId } }] };
          }
          const result = await provider.invoke({ ...invocation, signal: context.signal });
          const detail = [{ label: "delegation", value: { invocationId: result.invocationId, childAgentId: result.childAgentId, childSessionId: result.childSessionId, presetId: result.presetId, status: result.status, durationMs: result.durationMs } }];
          if (result.status !== "completed") return {
            ...failed(result.failure?.code ?? `SUBAGENT_${result.status.toUpperCase()}`, result.failure?.message ?? `Subagent ended with ${result.status}.`),
            modelOutput: [{ type: "text" as const, text: [result.failure?.message ?? `Subagent ended with ${result.status}.`, result.text && `Partial findings:\n${result.text}`].filter(Boolean).join("\n\n") }],
            detail,
          };
          return {
            status: "completed",
            summary: `${localName} completed`,
            modelOutput: [{ type: "text", text: result.text }],
            detail,
          };
        },
      },
    });
    return Object.freeze({ name: definition.name, dispose: () => handle.dispose() });
  }
}

function firstLine(task: string): string {
  const line = task.split("\n").find(value => value.trim().length > 0)?.trim() ?? task;
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function boundedResult(result: SubagentTerminalResult): string {
  const bounded = truncateUtf8(result.text, AGENT_RESULT_LIMIT_BYTES);
  return bounded.truncated ? `${bounded.text}\n[Result truncated at 8KB; the full text is in child session ${result.childSessionId}.]` : bounded.text;
}

function backgroundTerminal(result: SubagentTerminalResult, description: string): BackgroundTaskTerminal {
  if (result.status === "completed") return { status: "completed", summary: `Background agent completed: ${description}`, body: boundedResult(result) };
  if (result.status === "aborted" && result.failure?.code !== "SUBAGENT_TIMEOUT") return { status: "stopped", summary: `Background agent stopped: ${description}`, body: boundedResult(result) };
  const reason = result.failure?.message ?? `Subagent ended with ${result.status}.`;
  return { status: "failed", summary: `Background agent failed: ${description}. ${reason}`, body: result.text ? `Partial findings:\n${boundedResult(result)}` : "" };
}

function backgroundOutput(launch: SubagentLaunch, settled: SubagentTerminalResult | undefined): { readonly text: string } {
  if (settled) return { text: boundedResult(settled) || "(no final text)" };
  const progress = launch.progress();
  if (!progress) return { text: "Starting…" };
  return { text: [`steps: ${progress.steps}`, `tool_calls: ${progress.toolCalls}`, ...(progress.recentToolCalls.length ? ["recent_tool_calls:", ...progress.recentToolCalls.map(call => `- ${call}`)] : [])].join("\n") };
}

function failed(code: string, message: string) {
  return { status: "failed" as const, summary: "Subagent failed", modelOutput: [{ type: "text" as const, text: message }], failure: { code, message, retryable: false } };
}
