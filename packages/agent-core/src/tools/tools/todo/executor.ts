import type { TodoSnapshot, TodoStatus } from "@actspace/shared";
import type { ToolResult } from "../../../internal-tools";
import {
  isTodoStatus,
  TodoStore,
  TodoStoreError,
  type TodoReadInput,
  type TodoWriteInput,
  type TodoWriteItemInput,
} from "./store";

export type TodoExecutionStructured = {
  operation: "read" | "write";
  uiSnapshot: TodoSnapshot;
  errorCode?: string;
};

export async function todoReadExecutor(
  args: Record<string, unknown>,
  store: TodoStore,
): Promise<ToolResult> {
  try {
    const input = parseReadInput(args);
    return {
      success: true,
      data: store.read(input),
      structured: { operation: "read", uiSnapshot: store.snapshot() } satisfies TodoExecutionStructured,
    };
  } catch (error) {
    return todoFailure(error, "read", store);
  }
}

export async function todoWriteExecutor(
  args: Record<string, unknown>,
  store: TodoStore,
): Promise<ToolResult> {
  try {
    const input = parseWriteInput(args);
    const result = store.write(input);
    return {
      success: true,
      data: result,
      structured: { operation: "write", uiSnapshot: store.snapshot() } satisfies TodoExecutionStructured,
    };
  } catch (error) {
    return todoFailure(error, "write", store);
  }
}

export function renderTodoResult(result: ToolResult): string {
  if (!result.success) return result.error ?? "Todo operation failed.";
  return JSON.stringify(result.data);
}

function parseReadInput(args: Record<string, unknown>): TodoReadInput {
  assertAllowedKeys(args, ["statusFilter", "ids"]);
  return {
    ...(args.statusFilter !== undefined
      ? { statusFilter: parseStatuses(args.statusFilter, "statusFilter") }
      : {}),
    ...(args.ids !== undefined ? { ids: parseIds(args.ids) } : {}),
  };
}

function parseWriteInput(args: Record<string, unknown>): TodoWriteInput {
  assertAllowedKeys(args, ["todos", "merge"]);
  if (!Array.isArray(args.todos)) {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "todos must be an array.");
  }
  if (args.merge !== undefined && typeof args.merge !== "boolean") {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "merge must be a boolean.");
  }
  return {
    todos: args.todos.map(parseWriteItem),
    ...(args.merge === true ? { merge: true } : {}),
  };
}

function parseWriteItem(value: unknown): TodoWriteItemInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "Each todo must be an object.");
  }
  const item = value as Record<string, unknown>;
  assertAllowedKeys(item, ["id", "content", "status", "activeForm"]);
  if (item.id !== undefined && typeof item.id !== "string") {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "Todo id must be a string.");
  }
  if (typeof item.content !== "string") {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "Todo content must be a string.");
  }
  if (!isTodoStatus(item.status)) {
    throw new TodoStoreError("TODO_INVALID_STATUS", `Unsupported todo status: ${String(item.status)}.`);
  }
  if (item.activeForm !== undefined && typeof item.activeForm !== "string") {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "Todo activeForm must be a string.");
  }
  const id = typeof item.id === "string" ? item.id : undefined;
  const activeForm = typeof item.activeForm === "string" ? item.activeForm : undefined;
  return {
    ...(id !== undefined ? { id } : {}),
    content: item.content,
    status: item.status,
    ...(Object.prototype.hasOwnProperty.call(item, "activeForm") ? { activeForm } : {}),
  };
}

function parseStatuses(value: unknown, field: string): TodoStatus[] {
  if (!Array.isArray(value) || !value.every(isTodoStatus)) {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", `${field} must contain only valid Todo statuses.`);
  }
  return value;
}

function parseIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && id.trim().length > 0)) {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "ids must contain only non-empty strings.");
  }
  return value.map((id) => id.trim());
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !allowedSet.has(key));
  if (unknown) {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", `Unknown Todo argument: ${unknown}.`);
  }
}

function todoFailure(error: unknown, operation: "read" | "write", store: TodoStore): ToolResult {
  const todoError = error instanceof TodoStoreError
    ? error
    : new TodoStoreError("TODO_INVALID_ARGUMENT", error instanceof Error ? error.message : String(error));
  return {
    success: false,
    error: `${todoError.code}: ${todoError.message}`,
    structured: {
      operation,
      uiSnapshot: store.snapshot(),
      errorCode: todoError.code,
    } satisfies TodoExecutionStructured,
  };
}
