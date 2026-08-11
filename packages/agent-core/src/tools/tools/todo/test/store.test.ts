import { describe, expect, it } from "vitest";
import { TodoStore, TodoStoreError } from "../store";

function createStore() {
  const ids = ["todo-a", "todo-b", "todo-c"];
  let tick = 0;
  return new TodoStore({
    createId: () => ids.shift() ?? "todo-extra",
    now: () => `2026-08-08T00:00:0${tick++}.000Z`,
  });
}

describe("TodoStore", () => {
  it("replaces the full list and preserves existing IDs and createdAt", () => {
    const store = createStore();
    const first = store.write({
      todos: [
        { content: "Inspect the runtime", status: "in_progress" },
        { content: "Add tests", status: "pending" },
      ],
    });
    const second = store.write({
      todos: [
        { id: first.todos[0].id, content: "Inspect the runtime", status: "completed" },
        { content: "Document the result", status: "in_progress" },
      ],
    });

    expect(second.revision).toBe(2);
    expect(second.wasMerge).toBe(false);
    expect(second.todos.map((todo) => todo.id)).toEqual(["todo-a", "todo-c"]);
    expect(second.todos[0].createdAt).toBe(first.todos[0].createdAt);
    expect(second.todos[0].updatedAt).not.toBe(first.todos[0].updatedAt);
  });

  it("merges by ID, keeps order, and appends generated items", () => {
    const store = createStore();
    const initial = store.write({
      todos: [
        { content: "First", status: "in_progress", activeForm: "Working on first" },
        { content: "Second", status: "pending" },
      ],
    });
    const merged = store.write({
      merge: true,
      todos: [
        { id: initial.todos[0].id, content: "First", status: "completed" },
        { content: "Third", status: "in_progress" },
      ],
    });

    expect(merged.todos.map((todo) => todo.id)).toEqual(["todo-a", "todo-b", "todo-c"]);
    expect(merged.todos[0]).toMatchObject({ status: "completed", activeForm: "Working on first" });
    expect(merged.todos[1]).toMatchObject({ status: "pending" });
    expect(merged.todos[2]).toMatchObject({ status: "in_progress" });
  });

  it("filters reads without changing revision or source order", () => {
    const store = createStore();
    const written = store.write({
      todos: [
        { content: "First", status: "completed" },
        { content: "Second", status: "pending" },
      ],
    });

    expect(store.read({ ids: [written.todos[1].id], statusFilter: ["pending"] })).toEqual({
      todos: [written.todos[1]],
      totalCount: 1,
      revision: 1,
    });
    expect(store.snapshot().revision).toBe(1);
  });

  it.each([
    ["empty content", [{ content: "  ", status: "pending" }], "TODO_EMPTY_CONTENT"],
    ["unknown status", [{ content: "Bad", status: "blocked" }], "TODO_INVALID_STATUS"],
    ["multiple in progress", [
      { content: "First", status: "in_progress" },
      { content: "Second", status: "in_progress" },
    ], "TODO_MULTIPLE_IN_PROGRESS"],
  ])("rejects %s atomically", (_label, todos, code) => {
    const store = createStore();
    store.write({ todos: [{ content: "Keep me", status: "pending" }] });
    const before = store.snapshot();

    let thrown: unknown;
    try {
      store.write({ todos: todos as never });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TodoStoreError);
    expect(thrown).toMatchObject({ code });
    expect(store.snapshot()).toEqual(before);
  });

  it("rejects duplicate and unknown IDs without partial commits", () => {
    const store = createStore();
    const written = store.write({ todos: [{ content: "Keep me", status: "pending" }] });
    const before = store.snapshot();

    expect(() => store.write({
      todos: [
        { id: written.todos[0].id, content: "One", status: "pending" },
        { id: written.todos[0].id, content: "Two", status: "completed" },
      ],
    })).toThrowError(expect.objectContaining({ code: "TODO_DUPLICATE_ID" }));
    expect(() => store.write({
      merge: true,
      todos: [{ id: "todo-missing", content: "Missing", status: "pending" }],
    })).toThrowError(expect.objectContaining({ code: "TODO_NOT_FOUND" }));
    expect(store.snapshot()).toEqual(before);
  });
});
