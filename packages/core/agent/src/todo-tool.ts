import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionHandle } from "@actspace/session-persistence";
import type { ToolDefinition } from "@actspace/tools-runtime";
import type { ToolExecutionContext, ToolBodyResult } from "@actspace/tools-runtime";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { TodoService, type TodoItem, type TodoState } from "./todo.js";

const PLUGIN_ID = "actspace.todo";
export type TodoToolRegistration = { readonly name: string; readonly dispose: () => Promise<void> };

export function registerTodoTools(runtime: ToolRuntime, resolveSession: (sessionId: string) => SessionHandle | undefined): readonly TodoToolRegistration[] {
  return Object.freeze([
    register("todo_read", "Read the durable Todo list for the current Agent Session.", readSchema(), "read-only", async (args, context) => {
      const service = serviceFor(resolveSession, context.sessionId);
      const statuses = arrayOfStrings(args.statusFilter);
      const ids = arrayOfStrings(args.ids);
      const items = visible(service.list()).filter((item) => (statuses.length === 0 || statuses.includes(item.state)) && (ids.length === 0 || ids.includes(item.todoId)));
      return completed("Todo list read", snapshot(items));
    }),
    register("todo_write", "Replace or merge the durable Todo list for the current Agent Session. Keep at most one item in_progress.", writeSchema(), "exclusive", async (args, context) => {
      const service = serviceFor(resolveSession, context.sessionId);
      const requested = parseItems(args.todos);
      const merge = args.merge === true;
      const items = await service.replaceOrMerge(requested, merge);
      await resolveSession(context.sessionId)!.flush();
      return completed(merge ? "Todo list merged" : "Todo list replaced", snapshot(items));
    }),
  ]);

  function register(
    localName: "todo_read" | "todo_write",
    description: string,
    inputSchema: ToolDefinition["inputSchema"],
    concurrency: ToolDefinition["concurrency"],
    execute: (args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>,
  ): TodoToolRegistration {
    const definition: ToolDefinition = Object.freeze({
      abiVersion: 2,
      pluginId: PLUGIN_ID,
      name: localName,
      definitionVersion: 1,
      description,
      inputSchema,
      effects: [],
      concurrency,
      sensitiveArgumentPaths: [],
      resultSchemaVersion: 1,
    });
    const handle = runtime.register({ definition, executor: { concurrencySafe: concurrency !== "exclusive", execute } });
    return Object.freeze({ name: definition.name, dispose: () => handle.dispose() });
  }
}

function serviceFor(resolveSession: (sessionId: string) => SessionHandle | undefined, sessionId: string): TodoService {
  const session = resolveSession(sessionId);
  if (session === undefined) throw new Error(`Session ${sessionId} is not active.`);
  return new TodoService(session);
}

function visible(items: readonly TodoItem[]): readonly TodoItem[] { return items.filter((item) => item.state !== "cancelled"); }

function snapshot(items: readonly TodoItem[]): RuntimeV2JsonValue {
  return {
    todos: items.map((item) => ({ id: item.todoId, content: item.text, status: item.state, ...(item.activeForm === undefined ? {} : { activeForm: item.activeForm }), createdAt: item.createdAt, updatedAt: item.updatedAt })),
    totalCount: items.length,
    completedCount: items.filter((item) => item.state === "completed").length,
    revision: items.reduce((maximum, item) => Math.max(maximum, item.revision), 0),
  };
}

function completed(summary: string, value: RuntimeV2JsonValue): ToolBodyResult {
  return { status: "completed", summary, modelOutput: [{ type: "json", value }], detail: [{ label: "todo", value }] };
}

function parseItems(value: RuntimeV2JsonValue | undefined): readonly { readonly id?: string; readonly content: string; readonly status: Exclude<TodoState, "cancelled">; readonly activeForm?: string }[] {
  if (!Array.isArray(value)) throw new Error("todos must be an array.");
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error("Each Todo must be an object.");
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    if (!content) throw new Error("Todo content must not be empty.");
    const status = entry.status;
    if (status !== "pending" && status !== "in_progress" && status !== "completed") throw new Error(`Unsupported Todo status ${String(status)}.`);
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : undefined;
    const activeForm = typeof entry.activeForm === "string" && entry.activeForm.trim() ? entry.activeForm.trim() : undefined;
    return Object.freeze({ ...(id === undefined ? {} : { id }), content, status, ...(activeForm === undefined ? {} : { activeForm }) });
  });
}

function arrayOfStrings(value: RuntimeV2JsonValue | undefined): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("Todo filters must be string arrays.");
  return value as readonly string[];
}

function readSchema(): ToolDefinition["inputSchema"] {
  return { type: "object", properties: { statusFilter: { type: "array", items: { type: "string", enum: ["pending", "in_progress", "completed"] } }, ids: { type: "array", items: { type: "string" } } }, additionalProperties: false };
}

function writeSchema(): ToolDefinition["inputSchema"] {
  return { type: "object", properties: { todos: { type: "array", items: { type: "object", properties: { id: { type: "string" }, content: { type: "string", minLength: 1 }, status: { type: "string", enum: ["pending", "in_progress", "completed"] }, activeForm: { type: "string" } }, required: ["content", "status"], additionalProperties: false } }, merge: { type: "boolean", default: false } }, required: ["todos"], additionalProperties: false };
}

function isRecord(value: RuntimeV2JsonValue): value is Readonly<Record<string, RuntimeV2JsonValue>> { return value !== null && typeof value === "object" && !Array.isArray(value); }
