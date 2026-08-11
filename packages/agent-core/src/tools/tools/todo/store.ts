import { randomUUID } from "node:crypto";
import type { TodoItem, TodoSnapshot, TodoStatus } from "@actspace/shared";

export type TodoErrorCode =
  | "TODO_INVALID_ARGUMENT"
  | "TODO_INVALID_STATUS"
  | "TODO_EMPTY_CONTENT"
  | "TODO_DUPLICATE_ID"
  | "TODO_NOT_FOUND"
  | "TODO_MULTIPLE_IN_PROGRESS";

export class TodoStoreError extends Error {
  constructor(
    readonly code: TodoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TodoStoreError";
  }
}

export type TodoReadInput = {
  statusFilter?: TodoStatus[];
  ids?: string[];
};

export type TodoWriteItemInput = {
  id?: string;
  content: string;
  status: TodoStatus;
  activeForm?: string;
};

export type TodoWriteInput = {
  todos: TodoWriteItemInput[];
  merge?: boolean;
};

export type TodoWriteResult = TodoSnapshot & {
  wasMerge: boolean;
};

type TodoStoreOptions = {
  initialSnapshot?: TodoSnapshot;
  now?: () => string;
  createId?: () => string;
};

const TODO_STATUSES = new Set<TodoStatus>(["pending", "in_progress", "completed"]);

export class TodoStore {
  private snapshotValue: TodoSnapshot;
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: TodoStoreOptions = {}) {
    this.snapshotValue = cloneSnapshot(options.initialSnapshot ?? emptyTodoSnapshot());
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => `todo_${randomUUID()}`);
  }

  snapshot(): TodoSnapshot {
    return cloneSnapshot(this.snapshotValue);
  }

  read(input: TodoReadInput = {}): TodoSnapshot {
    const ids = input.ids ? new Set(input.ids) : undefined;
    const statuses = input.statusFilter ? new Set(input.statusFilter) : undefined;
    const todos = this.snapshotValue.todos.filter((todo) => (
      (!ids || ids.has(todo.id)) && (!statuses || statuses.has(todo.status))
    ));
    return {
      todos: todos.map(cloneTodo),
      totalCount: todos.length,
      revision: this.snapshotValue.revision,
    };
  }

  write(input: TodoWriteInput): TodoWriteResult {
    if (!input || !Array.isArray(input.todos)) {
      throw new TodoStoreError("TODO_INVALID_ARGUMENT", "todos must be an array.");
    }

    const wasMerge = input.merge === true;
    const nextTodos = wasMerge
      ? this.buildMergedTodos(input.todos)
      : this.buildReplacementTodos(input.todos);
    validateTodoList(nextTodos);

    this.snapshotValue = {
      todos: nextTodos,
      totalCount: nextTodos.length,
      revision: this.snapshotValue.revision + 1,
    };
    return { ...this.snapshot(), wasMerge };
  }

  private buildReplacementTodos(inputs: TodoWriteItemInput[]): TodoItem[] {
    const currentById = new Map(this.snapshotValue.todos.map((todo) => [todo.id, todo]));
    validateInputIds(inputs, currentById);
    const usedIds = new Set<string>();
    const now = this.now();

    return inputs.map((input) => {
      const normalized = normalizeInput(input);
      const existing = normalized.id ? currentById.get(normalized.id) : undefined;
      const id = normalized.id ?? this.nextUniqueId(currentById, usedIds);
      usedIds.add(id);
      return buildTodo(normalized, id, existing, now, false);
    });
  }

  private buildMergedTodos(inputs: TodoWriteItemInput[]): TodoItem[] {
    const currentById = new Map(this.snapshotValue.todos.map((todo) => [todo.id, todo]));
    validateInputIds(inputs, currentById);
    const normalizedById = new Map<string, ReturnType<typeof normalizeInput>>();
    const additions: ReturnType<typeof normalizeInput>[] = [];

    for (const input of inputs) {
      const normalized = normalizeInput(input);
      if (normalized.id) normalizedById.set(normalized.id, normalized);
      else additions.push(normalized);
    }

    const now = this.now();
    const next = this.snapshotValue.todos.map((todo) => {
      const update = normalizedById.get(todo.id);
      return update ? buildTodo(update, todo.id, todo, now, true) : cloneTodo(todo);
    });
    const usedIds = new Set(next.map((todo) => todo.id));
    for (const addition of additions) {
      const id = this.nextUniqueId(currentById, usedIds);
      usedIds.add(id);
      next.push(buildTodo(addition, id, undefined, now, true));
    }
    return next;
  }

  private nextUniqueId(currentById: ReadonlyMap<string, TodoItem>, usedIds: ReadonlySet<string>): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const id = this.createId();
      if (id && !currentById.has(id) && !usedIds.has(id)) return id;
    }
    throw new TodoStoreError("TODO_DUPLICATE_ID", "Unable to generate a unique todo ID.");
  }
}

export function emptyTodoSnapshot(): TodoSnapshot {
  return { todos: [], totalCount: 0, revision: 0 };
}

export function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === "string" && TODO_STATUSES.has(value as TodoStatus);
}

function normalizeInput(input: TodoWriteItemInput): TodoWriteItemInput & { hasActiveForm: boolean } {
  if (!input || typeof input !== "object") {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "Each todo must be an object.");
  }
  if (input.id !== undefined && (typeof input.id !== "string" || !input.id.trim())) {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "Todo id must be a non-empty string.");
  }
  if (typeof input.content !== "string" || !input.content.trim()) {
    throw new TodoStoreError("TODO_EMPTY_CONTENT", "Todo content must not be empty.");
  }
  if (!isTodoStatus(input.status)) {
    throw new TodoStoreError("TODO_INVALID_STATUS", `Unsupported todo status: ${String(input.status)}.`);
  }
  if (input.activeForm !== undefined && typeof input.activeForm !== "string") {
    throw new TodoStoreError("TODO_INVALID_ARGUMENT", "Todo activeForm must be a string.");
  }
  return {
    ...(input.id ? { id: input.id.trim() } : {}),
    content: input.content.trim(),
    status: input.status,
    ...(input.activeForm?.trim() ? { activeForm: input.activeForm.trim() } : {}),
    hasActiveForm: Object.prototype.hasOwnProperty.call(input, "activeForm"),
  };
}

function validateInputIds(inputs: TodoWriteItemInput[], currentById: ReadonlyMap<string, TodoItem>): void {
  const seen = new Set<string>();
  for (const input of inputs) {
    if (!input || typeof input !== "object" || input.id === undefined) continue;
    if (typeof input.id !== "string" || !input.id.trim()) continue;
    const id = input.id.trim();
    if (seen.has(id)) {
      throw new TodoStoreError("TODO_DUPLICATE_ID", `Duplicate todo ID: ${id}.`);
    }
    if (!currentById.has(id)) {
      throw new TodoStoreError("TODO_NOT_FOUND", `Todo ID does not exist in this AgentRun: ${id}.`);
    }
    seen.add(id);
  }
}

function buildTodo(
  input: ReturnType<typeof normalizeInput>,
  id: string,
  existing: TodoItem | undefined,
  now: string,
  merge: boolean,
): TodoItem {
  const activeForm = merge && existing && !input.hasActiveForm ? existing.activeForm : input.activeForm;
  const changed = !existing || existing.content !== input.content || existing.status !== input.status || existing.activeForm !== activeForm;
  return {
    id,
    content: input.content,
    status: input.status,
    ...(activeForm ? { activeForm } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: changed ? now : existing.updatedAt,
  };
}

function validateTodoList(todos: TodoItem[]): void {
  const ids = new Set<string>();
  let inProgressCount = 0;
  for (const todo of todos) {
    if (ids.has(todo.id)) {
      throw new TodoStoreError("TODO_DUPLICATE_ID", `Duplicate todo ID: ${todo.id}.`);
    }
    ids.add(todo.id);
    if (!todo.content.trim()) {
      throw new TodoStoreError("TODO_EMPTY_CONTENT", "Todo content must not be empty.");
    }
    if (!isTodoStatus(todo.status)) {
      throw new TodoStoreError("TODO_INVALID_STATUS", `Unsupported todo status: ${String(todo.status)}.`);
    }
    if (todo.status === "in_progress") inProgressCount += 1;
  }
  if (inProgressCount > 1) {
    throw new TodoStoreError("TODO_MULTIPLE_IN_PROGRESS", "Only one todo may be in_progress.");
  }
}

function cloneTodo(todo: TodoItem): TodoItem {
  return { ...todo };
}

function cloneSnapshot(snapshot: TodoSnapshot): TodoSnapshot {
  return {
    todos: snapshot.todos.map(cloneTodo),
    totalCount: snapshot.todos.length,
    revision: snapshot.revision,
  };
}
