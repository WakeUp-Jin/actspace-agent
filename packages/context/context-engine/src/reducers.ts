import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { Context, ContextStatus } from "./types.js";

export type ContextField = "system" | "conversation" | "supplements" | "tools" | "status";
export type ContextReducerUpdate = {
  readonly content?: Partial<Context["content"]>;
  readonly status?: Partial<ContextStatus>;
};
export type ContextReducer = {
  readonly id: string;
  readonly owner: string;
  readonly fields: readonly ContextField[];
  readonly criticality: "required" | "optional";
  readonly reduce: (input: { readonly context: Context; readonly event: SessionEventEnvelopeV1 }) => ContextReducerUpdate | undefined | Promise<ContextReducerUpdate | undefined>;
};

/** Ordered module reducers. Each reducer can replace only the slices it owns. */
export class ContextReducerRegistry {
  readonly #reducers = new Map<string, ContextReducer>();

  register(reducer: ContextReducer): () => void {
    if (!reducer.id || !reducer.owner || reducer.fields.length === 0) throw new Error("Context reducer requires an id, owner and fields.");
    if (this.#reducers.has(reducer.id)) throw new Error(`Context reducer ${reducer.id} is already registered.`);
    this.#reducers.set(reducer.id, Object.freeze({ ...reducer, fields: Object.freeze([...reducer.fields]) }));
    return () => { this.#reducers.delete(reducer.id); };
  }

  list(): readonly ContextReducer[] { return Object.freeze([...this.#reducers.values()]); }
  owners(): ReadonlySet<string> { return new Set([...this.#reducers.values()].map(reducer => reducer.owner)); }

  /** Reuse reducer-owned slices while the engine refreshes source-owned slices. */
  restore(previous: Context, current: Context): Context {
    let next = current;
    for (const reducer of this.list()) {
      const content = { ...next.content };
      let status = next.status;
      for (const field of reducer.fields) {
        if (field === "status") status = previous.status;
        else if (field === "system") content.system = previous.content.system;
        else if (field === "conversation") content.conversation = previous.content.conversation;
        else if (field === "supplements") content.supplements = previous.content.supplements;
        else if (field === "tools") content.tools = previous.content.tools;
      }
      next = { ...next, content, status };
    }
    return next;
  }

  async apply(context: Context, event: SessionEventEnvelopeV1): Promise<Context> {
    let next = context;
    for (const reducer of this.list()) {
      try {
        const update = await reducer.reduce({ context: next, event });
        if (update === undefined) continue;
        validateUpdate(reducer, update);
        next = {
          ...next,
          content: update.content === undefined ? next.content : { ...next.content, ...update.content },
          status: update.status === undefined ? next.status : { ...next.status, ...update.status },
        };
      } catch (error) {
        if (reducer.criticality === "required") {
          const message = error instanceof Error ? `: ${error.message}` : "";
          throw new Error(`Required Context reducer ${reducer.id} failed at Journal seq ${event.seq}${message}.`, { cause: error });
        }
      }
    }
    return next;
  }
}

function validateUpdate(reducer: ContextReducer, update: ContextReducerUpdate): void {
  const fields = new Set(reducer.fields);
  for (const field of Object.keys(update.content ?? {})) if (!fields.has(field as ContextField)) throw new Error(`Context reducer ${reducer.id} does not own ${field}.`);
  if (update.status !== undefined && !fields.has("status")) throw new Error(`Context reducer ${reducer.id} does not own status.`);
}
