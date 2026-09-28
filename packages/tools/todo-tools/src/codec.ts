import type { EventCodec } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { TODO_EVENT_TYPE, TODO_PLUGIN_ID } from "./manifest.js";

export const codecs: readonly EventCodec[] = [Object.freeze({
  type: TODO_EVENT_TYPE,
  ownerPluginId: TODO_PLUGIN_ID,
  currentVersion: 1,
  criticality: "required",
  validate: data => {
    if (!isRecord(data) || !Array.isArray(data.items)) throw new TypeError("Todo write requires items array.");
    if (!Number.isSafeInteger(data.revision) || (data.revision as number) < 1) throw new TypeError("Todo write requires positive revision.");
    for (const item of data.items) {
      if (!isRecord(item) || typeof item.todoId !== "string" || !item.todoId.trim() || typeof item.text !== "string" || !item.text.trim()) throw new TypeError("Todo item requires an id and text.");
      if (!Number.isSafeInteger(item.revision) || (item.revision as number) < 1 || (item.revision as number) > (data.revision as number)) throw new TypeError("Todo item revision is invalid.");
      if (!["pending", "in_progress", "completed", "cancelled"].includes(String(item.state))) throw new TypeError("Todo item state is invalid.");
      for (const key of ["createdAt", "updatedAt", "activeForm"]) if (item[key] !== undefined && typeof item[key] !== "string") throw new TypeError(`Todo item ${key} must be a string.`);
    }
  },
})];

function isRecord(value: RuntimeV2JsonValue): value is Readonly<Record<string, RuntimeV2JsonValue>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
