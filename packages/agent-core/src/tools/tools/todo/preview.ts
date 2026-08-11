import type { TodoSnapshot, TodoUiPreview } from "@actspace/shared";

export function createTodoUiPreview(snapshot: TodoSnapshot): TodoUiPreview {
  const completedCount = snapshot.todos.filter((todo) => todo.status === "completed").length;
  return {
    kind: "todo",
    todos: snapshot.todos.map((todo) => ({ ...todo })),
    totalCount: snapshot.todos.length,
    completedCount,
    revision: snapshot.revision,
    displayText: `${completedCount} of ${snapshot.todos.length} To-dos Completed`,
  };
}
