import type { ProjectionContributor } from "@actspace/session-projection";
import { mergeRuntimeV2TodoItems } from "@actspace/shared/runtime-v2";
import type { RuntimeV2TodoItem } from "@actspace/shared/runtime-v2";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { TODO_EVENT_TYPE } from "./manifest.js";

export const todoProjectionContributor: ProjectionContributor = Object.freeze({
  id: "actspace.todo",
  register: (registry, redact) => {
    registry.register<readonly RuntimeV2TodoItem[]>({
      key: "todos", stateVersion: 1, init: () => [], view: state => state,
      apply: (state, event) => {
        if (event.type !== TODO_EVENT_TYPE || !isRecord(event.data) || !Array.isArray(event.data.items)) return state;
        const items = event.data.items.filter((value): value is Readonly<Record<string, unknown>> => value !== null && typeof value === "object" && !Array.isArray(value));
        return mergeRuntimeV2TodoItems(state, items, redact, event.time);
      },
    });
  },
});

function isRecord(value: RuntimeV2JsonValue): value is Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
