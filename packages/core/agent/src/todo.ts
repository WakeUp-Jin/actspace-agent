import { randomUUID } from "node:crypto";
import type { SessionHandle } from "@actspace/session-persistence";
import { mergeRuntimeV2TodoItems } from "@actspace/shared/runtime-v2";

export type TodoState = "pending" | "in_progress" | "completed" | "cancelled";
export type TodoItem = {
  readonly todoId: string;
  readonly revision: number;
  readonly text: string;
  readonly state: TodoState;
  readonly activeForm?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};
export type TodoWriteItem = { readonly id?: string; readonly content: string; readonly status: Exclude<TodoState, "cancelled">; readonly activeForm?: string };

export class TodoService {
  constructor(private readonly session: SessionHandle) {}
  list(): readonly TodoItem[] {
    let items: readonly import("@actspace/shared/runtime-v2").RuntimeV2TodoItem[] = [];
    for (const event of this.session.journal.events) {
      if (event.type !== "todo/write" || event.data === null || typeof event.data !== "object" || Array.isArray(event.data)) continue;
      const data = event.data as Record<string, unknown>;
      if (!Array.isArray(data.items)) continue;
      const rawItems = data.items.filter((value): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value));
      items = mergeRuntimeV2TodoItems(items, rawItems, value => value, event.time);
    }
    return Object.freeze(items.map(item => Object.freeze({ ...item, createdAt: item.createdAt ?? "", updatedAt: item.updatedAt ?? item.createdAt ?? "" })) as TodoItem[]);
  }
  async create(text: string, todoId = randomUUID(), state: Exclude<TodoState, "cancelled"> = "pending", activeForm?: string): Promise<TodoItem> {
    const now = new Date().toISOString();
    const item = Object.freeze({ todoId, revision: 1, text, state, ...(activeForm === undefined ? {} : { activeForm }), createdAt: now, updatedAt: now });
    await this.session.append(core("todo/write", { items: [item], revision: item.revision }));
    return item;
  }
  async update(todoId: string, expectedRevision: number, text: string, state?: Exclude<TodoState, "cancelled">, activeForm?: string): Promise<TodoItem> {
    const current = this.require(todoId, expectedRevision);
    const next = Object.freeze({ ...current, revision: expectedRevision + 1, text, state: state ?? current.state, ...(activeForm === undefined ? {} : { activeForm }), updatedAt: new Date().toISOString() });
    await this.session.append(core("todo/write", { items: [next], revision: next.revision }));
    return next;
  }
  async complete(todoId: string, expectedRevision: number): Promise<TodoItem> { const current = this.require(todoId, expectedRevision); return this.update(todoId, expectedRevision, current.text, "completed", current.activeForm); }
  async cancel(todoId: string, expectedRevision: number): Promise<TodoItem> { const current = this.require(todoId, expectedRevision); const next = Object.freeze({ ...current, revision: expectedRevision + 1, state: "cancelled" as const, updatedAt: new Date().toISOString() }); await this.session.append(core("todo/write", { items: [next], revision: next.revision })); return next; }
  async replaceOrMerge(requested: readonly TodoWriteItem[], merge: boolean): Promise<readonly TodoItem[]> {
    const current = this.list().filter((item) => item.state !== "cancelled");
    const currentById = new Map(current.map((item) => [item.todoId, item]));
    const seen = new Set<string>();
    const now = new Date().toISOString();
    const nextItems: TodoItem[] = [];
    for (const item of requested) {
      if (item.id !== undefined) {
        if (seen.has(item.id)) throw new Error(`Duplicate Todo id ${item.id}.`);
        seen.add(item.id);
        const prior = currentById.get(item.id);
        if (prior === undefined) throw new Error(`Todo ${item.id} does not exist.`);
        nextItems.push(Object.freeze({ ...prior, revision: prior.revision + 1, text: item.content, state: item.status, ...(item.activeForm === undefined ? {} : { activeForm: item.activeForm }), updatedAt: now }));
      } else {
        nextItems.push(Object.freeze({ todoId: randomUUID(), revision: 1, text: item.content, state: item.status, ...(item.activeForm === undefined ? {} : { activeForm: item.activeForm }), createdAt: now, updatedAt: now }));
      }
    }
    const unchanged = merge ? current.filter((item) => !seen.has(item.todoId)) : [];
    if ([...unchanged, ...nextItems].filter((item) => item.state === "in_progress").length > 1) throw new Error("Only one Todo may be in_progress.");
    const cancelled = merge ? [] : current.filter((item) => !seen.has(item.todoId)).map((item) => Object.freeze({ ...item, revision: item.revision + 1, state: "cancelled" as const, updatedAt: now }));
    const items = [...nextItems, ...cancelled];
    if (items.length > 0) await this.session.append(core("todo/write", { items, revision: Math.max(...items.map((item) => item.revision)) }));
    return this.list().filter((item) => item.state !== "cancelled");
  }
  private require(todoId: string, revision: number): TodoItem { const item = this.list().find((candidate) => candidate.todoId === todoId); if (item === undefined) throw new Error(`Todo ${todoId} does not exist.`); if (item.revision !== revision) throw new Error(`Todo ${todoId} revision conflict.`); return item; }
}
function core(type: string, data: Record<string, unknown>) { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never; }
