import { isBackgroundTaskError, type BackgroundTaskHost, type BackgroundTaskOutput, type BackgroundTaskRecord } from "@actspace/background-tasks";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolDefinition, ToolExecutionContext, ToolRuntimeContract } from "@actspace/tool-runtime";
import { BACKGROUND_TASK_TOOLS_PLUGIN_ID } from "./manifest.js";

export type BackgroundTaskToolRegistration = { readonly name: string; readonly dispose: () => Promise<void> };
type Args = Readonly<Record<string, RuntimeJsonValue>>;

const NO_POLLING = "Background tasks notify you automatically when they finish; prefer waiting for that notification. Do not poll with sleep or repeated task_output.";
const TASK_ID = { type: "string", description: "Background task id: a Bash task (bash_…) or a background subagent's agent id." } as const;

export function registerBackgroundTaskTools(runtime: ToolRuntimeContract, tasks: BackgroundTaskHost): readonly BackgroundTaskToolRegistration[] {
  const handles: ReturnType<ToolRuntimeContract["register"]>[] = [];
  const register = (name: string, description: string, properties: Record<string, RuntimeJsonValue>, required: string[], concurrency: ToolDefinition["concurrency"], execute: (args: Args, context: ToolExecutionContext) => Promise<ToolBodyResult>): BackgroundTaskToolRegistration => {
    const definition: ToolDefinition = Object.freeze({ abiVersion: 2, pluginId: BACKGROUND_TASK_TOOLS_PLUGIN_ID, name, definitionVersion: 1, description, inputSchema: { type: "object", properties, required, additionalProperties: false }, effects: [], modes: ["plan", "agent"] as const, concurrency, sensitiveArgumentPaths: [], resultSchemaVersion: 1 });
    const handle = runtime.register({ definition, executor: { concurrencySafe: concurrency !== "exclusive", execute: (args, context) => execute(args, context).catch(failed) } });
    handles.push(handle);
    return Object.freeze({ name, dispose: () => handle.dispose() });
  };
  try { return Object.freeze([
    register("task_list", `List the background tasks of this session: Bash commands moved to the background and subagents started in the background, with their status. Subagents also show their transcript path. ${NO_POLLING}`, {
      activeOnly: { type: "boolean", description: "Only running tasks. Defaults to true." },
      limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum tasks to list. Defaults to 20." },
    }, [], "read-only", async (args, context) => {
      const activeOnly = args.activeOnly !== false;
      const list = tasks.list(context.sessionId, { activeOnly, limit: integer(args.limit, 1, 50) ?? 20 });
      const text = [`${activeOnly ? "active_background_tasks" : "background_tasks"}: ${list.length}`, ...list.map(task => `\n${describe(task)}`)].join("\n");
      return completed(`${list.length} background task${list.length === 1 ? "" : "s"}`, text);
    }),
    register("task_output", `Read a non-blocking snapshot of a background task. For Bash: the last 32KB of output and the output file path (use read_file for the full log); pass since with the previous next_offset to read only new output. For a subagent: the tail of its transcript; you rarely need this, since you are notified when it finishes and send_message gives it more information. ${NO_POLLING}`, {
      taskId: TASK_ID,
      since: { type: "integer", minimum: 0, description: "Bash only: byte offset in the log to read from." },
    }, ["taskId"], "read-only", async (args, context) => {
      const since = integer(args.since, 0, Number.MAX_SAFE_INTEGER);
      const { task, output } = await tasks.output(context.sessionId, requiredString(args.taskId, "taskId"), since === undefined ? {} : { since });
      return completed(`Background task ${task.status}`, withOutput(task, output));
    }),
    register("task_stop", "Stop a running background task: kill a Bash command or end a subagent for good. The returned status is its result; no completion notification follows. A finished task is returned as is.", {
      taskId: TASK_ID,
      reason: { type: "string", description: "Optional reason for stopping." },
    }, ["taskId"], "exclusive", async (args, context) => {
      const task = await tasks.stop(context.sessionId, requiredString(args.taskId, "taskId"), typeof args.reason === "string" && args.reason.trim() ? args.reason.trim() : "Stopped by the agent.");
      return completed(`Background task ${task.status}`, describe(task));
    }),
  ]); } catch (error) {
    for (const handle of handles.reverse()) handle.beginDrain();
    throw error;
  }
}

class BackgroundTaskInputError extends Error {}

function describe(task: BackgroundTaskRecord): string {
  return [
    `task_id: ${task.taskId}`, `kind: ${task.kind}`, `status: ${task.status}`, `description: ${task.description}`, `started_at: ${new Date(task.startedAt).toISOString()}`,
    ...(task.agent ? [`transcript: ${task.agent.transcriptPath}`] : []),
    ...(task.endedAt === undefined ? [] : [`ended_at: ${new Date(task.endedAt).toISOString()}`]),
    ...(task.exitCode === undefined || task.exitCode === null ? [] : [`exit_code: ${task.exitCode}`]),
  ].join("\n");
}

function withOutput(task: BackgroundTaskRecord, output: BackgroundTaskOutput): string {
  const head = [describe(task), ...(output.outputPath ? [`output_path: ${output.outputPath}`] : [])];
  if (output.pruned) return [...head, "", "log pruned"].join("\n");
  const offsets = [...(output.logSize === undefined ? [] : [`log_size: ${output.logSize}`]), ...(output.nextOffset === undefined ? [] : [`next_offset: ${output.nextOffset}`])];
  return [...head, "", output.text || "(no output yet)", ...(offsets.length ? ["", ...offsets] : [])].join("\n");
}

function completed(summary: string, text: string): ToolBodyResult { return { status: "completed", summary, modelOutput: [{ type: "text", text }] }; }

function failed(error: unknown): ToolBodyResult {
  if (isBackgroundTaskError(error)) return failure(error.code, error.message);
  return failure(error instanceof BackgroundTaskInputError ? "INVALID_ARGUMENTS" : "BACKGROUND_TASK_FAILED", error instanceof Error ? error.message : String(error));
}

function failure(code: string, message: string): ToolBodyResult {
  return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { code, message, retryable: false } };
}

function requiredString(value: RuntimeJsonValue | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new BackgroundTaskInputError(`${name} must be a non-empty string.`);
  return value.trim();
}

function integer(value: RuntimeJsonValue | undefined, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}
