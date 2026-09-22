import type { RuntimeV2TodoItem } from "./projection";

export type RuntimeV2TodoWriteItem = Readonly<Record<string, unknown>>;

/**
 * Canonical Journal fold for todo/write. Writes are item deltas, even when a
 * single event contains many items. The item revision is the only ordering
 * signal; the event-level revision is intentionally ignored.
 */
export function mergeRuntimeV2TodoItems(
  previous: readonly RuntimeV2TodoItem[],
  rawItems: readonly RuntimeV2TodoWriteItem[],
  redact: (value: string, limit?: number) => string = value => value,
  eventTime?: string,
): readonly RuntimeV2TodoItem[] {
  const items = new Map(previous.map(item => [item.todoId, item] as const));
  for (const raw of rawItems) {
    const todoId = stringValue(raw.todoId) ?? stringValue(raw.id);
    const revision = integerValue(raw.revision);
    if (!todoId || revision === null) continue;
    const prior = items.get(todoId);
    if (prior !== undefined && revision <= prior.revision) continue;
    const state = todoState(raw.state ?? raw.status) ?? prior?.state ?? "pending";
    const text = stringValue(raw.text) ?? stringValue(raw.content) ?? prior?.text ?? "";
    const createdAt = stringValue(raw.createdAt) ?? prior?.createdAt;
    const updatedAt = stringValue(raw.updatedAt) ?? eventTime ?? prior?.updatedAt;
    const activeForm = stringValue(raw.activeForm) ?? prior?.activeForm;
    items.set(todoId, {
      todoId: redact(todoId, 240),
      revision,
      text: redact(text, 500),
      state,
      ...(activeForm === undefined ? {} : { activeForm: redact(activeForm, 500) }),
      ...(createdAt === undefined ? {} : { createdAt }),
      ...(updatedAt === undefined ? {} : { updatedAt }),
    });
  }
  return [...items.values()].sort((a, b) => a.todoId.localeCompare(b.todoId));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function todoState(value: unknown): RuntimeV2TodoItem["state"] | undefined {
  return value === "pending" || value === "in_progress" || value === "completed" || value === "cancelled" ? value : undefined;
}
