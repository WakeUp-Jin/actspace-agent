import type { InternalTool } from "../../../internal-tools";
import { todoReadDefinition, todoWriteDefinition } from "./definition";
import { renderTodoResult, todoReadExecutor, todoWriteExecutor } from "./executor";
import { createTodoUiPreview } from "./preview";
import { TodoStore } from "./store";

export { todoReadDefinition, todoWriteDefinition } from "./definition";
export { renderTodoResult, todoReadExecutor, todoWriteExecutor } from "./executor";
export { createTodoUiPreview } from "./preview";
export * from "./store";

export function createTodoReadTool(store: TodoStore): InternalTool {
  return {
    ...todoReadDefinition,
    handler: (args) => todoReadExecutor(args, store),
    renderResult: renderTodoResult,
    createRunningPreview: () => createTodoUiPreview(store.snapshot()),
  };
}

export function createTodoWriteTool(store: TodoStore): InternalTool {
  return {
    ...todoWriteDefinition,
    handler: (args) => todoWriteExecutor(args, store),
    renderResult: renderTodoResult,
    createRunningPreview: () => createTodoUiPreview(store.snapshot()),
  };
}
