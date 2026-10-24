import { BackgroundTaskError, type BackgroundTaskHost, type BackgroundTaskOutput, type BackgroundTaskRecord } from "@actspace/background-tasks";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolBodyResult, ToolDefinition, ToolExecutionContext, ToolRuntime } from "@actspace/tools-runtime";
import { BACKGROUND_TASK_TOOLS_PLUGIN_ID } from "./manifest.js";

export type BackgroundTaskToolRegistration = { readonly name: string; readonly dispose: () => Promise<void> };
type Args = Readonly<Record<string, RuntimeV2JsonValue>>;

const NO_POLLING = "Background tasks notify you automatically when they finish; prefer waiting for that notification. Do not poll with sleep or repeated task_output.";
const TASK_ID = { type: "string", description: "Background task id, e.g. bash_… or agent_…." } as const;

export function registerBackgroundTaskTools(runtime: ToolRuntime, tasks: BackgroundTaskHost): readonly BackgroundTaskToolRegistration[] {
  const handles: ReturnType<ToolRuntime["register"]>[] = [];
  const register = (name: string, description: string, properties: Record<string, RuntimeV2JsonValue>, required: string[], concurrency: ToolDefinition["concurrency"], execute: (args: Args, context: ToolExecutionContext) => Promise<ToolBodyResult>): BackgroundTaskToolRegistration => {
    const definition: ToolDefinition = Object.freeze({ abiVersion: 2, pluginId: BACKGROUND_TASK_TOOLS_PLUGIN_ID, name, definitionVersion: 1, description, inputSchema: { type: "object", properties, required, additionalProperties: false }, effects: [], concurrency, sensitiveArgumentPaths: [], resultSchemaVersion: 1 });
    const handle = runtime.register({ definition, executor: { concurrencySafe: concurrency !== "exclusive", execute: (args, context) => execute(args, context).catch(failed) } });
    handles.push(handle);
    return Object.freeze({ name, dispose: () => handle.dispose() });
  };
  try { return Object.freeze([
    register("task_list", `List background tasks (bash and agent) started in this session. ${NO_POLLING}`, {
      activeOnly: { type: "boolean", description: "Only running tasks. Defaults to true." },
      limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum tasks to list. Defaults to 20." },
    }, [], "read-only", async (args, context) => {
      const activeOnly = args.activeOnly !== false;
      const list = tasks.list(context.sessionId, { activeOnly, limit: integer(args.limit, 1, 50) ?? 20 });
      const text = [`${activeOnly ? "active_background_tasks" : "background_tasks"}: ${list.length}`, ...list.map(task => `\n${describe(task)}`)].join("\n");
      return completed(`${list.length} background task${list.length === 1 ? "" : "s"}`, text);
    }),
    register("task_output", `Read a non-blocking snapshot of a background task. Bash: the last 32KB of output and the output file path (use read_file for the full log). Running agent: progress summary. Finished agent: its final text. ${NO_POLLING}`, {
      taskId: TASK_ID,
    }, ["taskId"], "read-only", async (args, context) => {
      const { task, output } = await tasks.output(context.sessionId, requiredString(args.taskId, "taskId"));
      return completed(`Background task ${task.status}`, withOutput(task, output));
    }),
    register("task_stop", "Stop a running background task. The returned status is its result; no completion notification follows. A finished task is returned as is.", {
      taskId: TASK_ID,
      reason: { type: "string", description: "Optional reason for stopping." },
    }, ["taskId"], "exclusive", async (args, context) => {
      const task = await tasks.stop(context.sessionId, requiredString(args.taskId, "taskId"), typeof args.reason === "string" && args.reason.trim() ? args.reason.trim() : "Stopped by the agent.");
      return completed(`Background task ${task.status}`, describe(task));
    }),
    register("task_wait", `Block until a background task finishes or the timeout passes. Without taskId, waits for any task already running when called. A task reported here sends no completion notification. Use only when you have nothing else to do. ${NO_POLLING}`, {
      taskId: TASK_ID,
      timeoutSeconds: { type: "integer", minimum: 1, maximum: 120, description: "Maximum seconds to wait (1–120)." },
    }, ["timeoutSeconds"], "read-only", async (args, context) => {
      const timeoutSeconds = integer(args.timeoutSeconds, 1, 120);
      if (timeoutSeconds === undefined) throw new BackgroundTaskInputError("timeoutSeconds must be an integer between 1 and 120.");
      const taskId = typeof args.taskId === "string" && args.taskId.trim() ? args.taskId.trim() : undefined;
      const result = await tasks.wait(context.sessionId, { ...(taskId === undefined ? {} : { taskId }), timeoutMs: timeoutSeconds * 1000, signal: context.signal });
      if (result.status === "no_running_tasks") return completed("No running background tasks", "wait_status: no_running_tasks");
      if (result.status === "completed") return completed(`Background task ${result.task.status}`, `wait_status: completed\n\n${withOutput(result.task, result.output)}`);
      return completed(result.status === "timed_out" ? "Wait timed out" : "Wait interrupted", [`wait_status: ${result.status}`, `still_running: ${result.running.length}`, ...result.running.map(task => `\n${describe(task)}`)].join("\n"));
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
    ...(task.endedAt === undefined ? [] : [`ended_at: ${new Date(task.endedAt).toISOString()}`]),
    ...(task.exitCode === undefined || task.exitCode === null ? [] : [`exit_code: ${task.exitCode}`]),
  ].join("\n");
}

function withOutput(task: BackgroundTaskRecord, output: BackgroundTaskOutput): string {
  return [describe(task), ...(output.outputPath ? [`output_path: ${output.outputPath}`] : []), "", output.text || "(no output yet)"].join("\n");
}

function completed(summary: string, text: string): ToolBodyResult { return { status: "completed", summary, modelOutput: [{ type: "text", text }] }; }

function failed(error: unknown): ToolBodyResult {
  const code = error instanceof BackgroundTaskError ? error.code : error instanceof BackgroundTaskInputError ? "INVALID_ARGUMENTS" : "BACKGROUND_TASK_FAILED";
  const message = error instanceof Error ? error.message : String(error);
  return { status: "failed", summary: message, modelOutput: [{ type: "text", text: message }], failure: { code, message, retryable: false } };
}

function requiredString(value: RuntimeV2JsonValue | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new BackgroundTaskInputError(`${name} must be a non-empty string.`);
  return value.trim();
}

function integer(value: RuntimeV2JsonValue | undefined, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}
