import type { ProjectionContributor } from "@actspace/session-projection";
import { mergeRuntimeTodoItems } from "@actspace/shared/runtime-v2";
import type { RuntimeTodoItem } from "@actspace/shared/runtime-v2";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { TODO_EVENT_TYPE } from "./manifest.js";

export const todoProjectionContributor: ProjectionContributor = Object.freeze({
  id: "actspace.todo",
  register: (registry, redact) => {
    registry.register<readonly RuntimeTodoItem[]>({
      key: "todos", stateVersion: 1, init: () => [], view: state => state,
      apply: (state, event) => {
        if (event.type !== TODO_EVENT_TYPE || !isRecord(event.data) || !Array.isArray(event.data.items)) return state;
        const items = event.data.items.filter((value: unknown): value is Readonly<Record<string, unknown>> => value !== null && typeof value === "object" && !Array.isArray(value));
        return mergeRuntimeTodoItems(state, items, redact, event.time);
      },
    });
  },
});

function isRecord(value: RuntimeJsonValue): value is Readonly<Record<string, RuntimeJsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
