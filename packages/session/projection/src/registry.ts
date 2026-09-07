import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type {
  ProjectionChange,
  RuntimeV2JsonValue,
  RuntimeV2ProjectionKey,
  SessionProjectionSnapshot,
} from "@actspace/shared/runtime-v2";

export type ProjectionDefinition<State, Value extends RuntimeV2JsonValue = RuntimeV2JsonValue> = {
  readonly key: RuntimeV2ProjectionKey;
  readonly stateVersion: number;
  readonly init: () => State;
  readonly apply: (state: State, event: SessionEventEnvelopeV1) => State;
  readonly view: (state: State) => Value;
};

export type ProjectionSnapshotListener = (change: ProjectionChange) => void;

type ProjectionCell = {
  events: SessionEventEnvelopeV1[];
  states: Map<string, unknown>;
  lastSeq: number;
  listeners: Set<ProjectionSnapshotListener>;
};

/**
 * Host-side registry for pure projection definitions.
 *
 * The registry deliberately has no persistence or provider dependency. A
 * caller feeds it a committed Journal prefix through `sync` and then appends
 * committed events through `apply`. This keeps Journal durability as the
 * source of truth while still allowing lazy per-session projection cells.
 */
export class SessionProjectionRegistry {
  readonly #definitions = new Map<string, ProjectionDefinition<unknown>>();
  readonly #cells = new Map<string, ProjectionCell>();

  register<State, Value extends RuntimeV2JsonValue>(definition: ProjectionDefinition<State, Value>): () => void {
    validateDefinition(definition as unknown as ProjectionDefinition<unknown>);
    if (this.#definitions.has(definition.key)) throw new TypeError(`Duplicate projection key ${definition.key}.`);

    const normalized = definition as ProjectionDefinition<unknown>;
    const rebuilt = new Map<string, unknown>();
    for (const [sessionId, cell] of this.#cells) {
      rebuilt.set(sessionId, fold(normalized, cell.events));
    }
    this.#definitions.set(definition.key, normalized);
    for (const [sessionId, cell] of this.#cells) cell.states.set(definition.key, rebuilt.get(sessionId));

    return () => {
      if (this.#definitions.get(definition.key) !== normalized) return;
      this.#definitions.delete(definition.key);
      for (const cell of this.#cells.values()) cell.states.delete(definition.key);
    };
  }

  ensureSession(sessionId: string, events: readonly SessionEventEnvelopeV1[] = []): void {
    validateSessionId(sessionId);
    const existing = this.#cells.get(sessionId);
    if (existing !== undefined) {
      if (events.length > 0) this.sync(sessionId, events);
      return;
    }
    const cell = this.#createCell();
    this.#cells.set(sessionId, cell);
    if (events.length > 0) this.sync(sessionId, events);
  }

  sync(sessionId: string, events: readonly SessionEventEnvelopeV1[]): SessionProjectionSnapshot {
    validateSessionId(sessionId);
    validateEventSequence(events);
    const cell = this.#cells.get(sessionId) ?? this.#createCell();
    const nextStates = new Map<string, unknown>();
    for (const definition of this.#definitions.values()) nextStates.set(definition.key, fold(definition, events));
    cell.events = [...events];
    cell.states = nextStates;
    cell.lastSeq = events.length === 0 ? -1 : (events[events.length - 1]?.seq ?? -1);
    this.#cells.set(sessionId, cell);
    return this.snapshot(sessionId);
  }

  apply(sessionId: string, event: SessionEventEnvelopeV1): ProjectionChange | null {
    validateSessionId(sessionId);
    const cell = this.#cells.get(sessionId) ?? this.#createCell();
    if (event.seq !== cell.lastSeq + 1) throw new Error(`Projection event gap for ${sessionId}: expected ${cell.lastSeq + 1}, received ${event.seq}.`);

    const nextStates = new Map(cell.states);
    const changedKeys: RuntimeV2ProjectionKey[] = [];
    const changedValues: Record<string, RuntimeV2JsonValue> = {};
    for (const definition of this.#definitions.values()) {
      const previous = cell.states.get(definition.key);
      const next = definition.apply(previous, event);
      if (next !== previous) {
        nextStates.set(definition.key, next);
        changedKeys.push(definition.key);
        changedValues[definition.key] = detached(definition.view(next));
      }
    }

    cell.events = [...cell.events, event];
    cell.states = nextStates;
    cell.lastSeq = event.seq;
    this.#cells.set(sessionId, cell);
    if (changedKeys.length === 0) return null;

    const change: ProjectionChange = Object.freeze({
      kind: "projection-change",
      revision: Object.freeze({
        schemaVersion: 1,
        sessionId,
        throughJournalSeq: event.seq,
        projectionKey: changedKeys[0]!,
        stateVersion: this.#definitions.get(changedKeys[0]!)!.stateVersion,
      }),
      changedKeys: Object.freeze(changedKeys),
      values: Object.freeze(changedValues),
    });
    for (const listener of [...cell.listeners]) listener(change);
    return change;
  }

  snapshot(sessionId: string): SessionProjectionSnapshot {
    validateSessionId(sessionId);
    const cell = this.#cells.get(sessionId) ?? this.#createCell();
    this.#cells.set(sessionId, cell);
    const values: Record<string, RuntimeV2JsonValue> = {};
    for (const definition of this.#definitions.values()) {
      values[definition.key] = detached(definition.view(cell.states.get(definition.key)));
    }
    return Object.freeze({
      kind: "session-projection",
      schemaVersion: 1,
      sessionId,
      throughJournalSeq: cell.lastSeq,
      values: Object.freeze(values),
    });
  }

  onChanged(sessionId: string, listener: ProjectionSnapshotListener): () => void {
    validateSessionId(sessionId);
    const cell = this.#cells.get(sessionId) ?? this.#createCell();
    cell.listeners.add(listener);
    this.#cells.set(sessionId, cell);
    return () => cell.listeners.delete(listener);
  }

  disposeSession(sessionId: string): void {
    this.#cells.delete(sessionId);
  }

  #createCell(): ProjectionCell {
    const states = new Map<string, unknown>();
    for (const definition of this.#definitions.values()) states.set(definition.key, definition.init());
    return { events: [], states, lastSeq: -1, listeners: new Set() };
  }
}

function fold(definition: ProjectionDefinition<unknown>, events: readonly SessionEventEnvelopeV1[]): unknown {
  let state = definition.init();
  for (const event of events) state = definition.apply(state, event);
  return state;
}

function validateDefinition(definition: ProjectionDefinition<unknown>): void {
  if (typeof definition.key !== "string" || definition.key.length === 0) throw new TypeError("Projection key must be a non-empty string.");
  if (!Number.isSafeInteger(definition.stateVersion) || definition.stateVersion < 1) throw new TypeError(`Projection ${definition.key} stateVersion must be >= 1.`);
  if (typeof definition.init !== "function" || typeof definition.apply !== "function" || typeof definition.view !== "function") throw new TypeError(`Projection ${definition.key} must define init, apply and view.`);
}

function validateSessionId(sessionId: string): void {
  if (typeof sessionId !== "string" || sessionId.length === 0) throw new TypeError("Projection sessionId must be a non-empty string.");
}

function validateEventSequence(events: readonly SessionEventEnvelopeV1[]): void {
  for (let index = 0; index < events.length; index += 1) {
    if (events[index]!.seq !== index) throw new Error(`Projection Journal prefix must be contiguous at seq ${index}.`);
  }
}

function detached(value: RuntimeV2JsonValue): RuntimeV2JsonValue {
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as RuntimeV2JsonValue;
}
