import type { SessionEventEnvelopeV1, SessionSurfaceNodeV1 } from "./event-envelope.js";
import { SessionError } from "./errors.js";

export type SessionSurfaceEntry = {
  readonly node: SessionSurfaceNodeV1;
  readonly sourceEventSeqs: readonly number[];
};

export type SessionSurfaceView = {
  readonly entries: readonly SessionSurfaceEntry[];
  readonly replaceGeneration: number;
};

export class SessionSurface {
  #entries: SessionSurfaceEntry[] = [];
  #replaceGeneration = 0;

  static fromEvents(events: readonly SessionEventEnvelopeV1[]): SessionSurface {
    const surface = new SessionSurface();
    for (const event of events) surface.apply(event);
    return surface;
  }

  static fromView(view: SessionSurfaceView): SessionSurface {
    const surface = new SessionSurface();
    surface.#entries = [...view.entries];
    surface.#replaceGeneration = view.replaceGeneration;
    return surface;
  }

  clone(): SessionSurface {
    const clone = new SessionSurface();
    clone.#entries = [...this.#entries];
    clone.#replaceGeneration = this.#replaceGeneration;
    return clone;
  }

  apply(event: SessionEventEnvelopeV1): void {
    const operation = event.surface;
    if (operation === null) return;
    validateEligible(event, operation.node.kind);
    if (operation.kind === "append") {
      this.#entries.push(createEntry(operation.node, event));
      return;
    }
    if (operation.end > this.#entries.length) invalid("Surface replacement span is outside the current Surface.");
    const shadowed = this.#entries.slice(operation.start, operation.end);
    const expected = uniqueSorted(shadowed.flatMap((entry) => entry.sourceEventSeqs));
    const supplied = uniqueSorted(operation.sourceEventSeqs);
    if (!sameNumbers(expected, supplied)) invalid("Surface replacement must cite every shadowed source event and no unrelated event.");
    const replacement = createEntry(operation.node, event, supplied);
    this.#entries.splice(operation.start, operation.end - operation.start, replacement);
    this.#replaceGeneration += 1;
  }

  get view(): SessionSurfaceView {
    return Object.freeze({ entries: Object.freeze([...this.#entries]), replaceGeneration: this.#replaceGeneration });
  }
}

function createEntry(node: SessionSurfaceNodeV1, event: SessionEventEnvelopeV1, additional: readonly number[] = []): SessionSurfaceEntry {
  return Object.freeze({
    node,
    sourceEventSeqs: Object.freeze(uniqueSorted([event.seq, ...event.provenance.sourceEventSeqs, ...additional])),
  });
}

function validateEligible(event: SessionEventEnvelopeV1, kind: SessionSurfaceNodeV1["kind"]): void {
  const eligible =
    (event.type === "user/message" && kind === "user") ||
    (event.type === "assistant/message" && kind === "assistant") ||
    (event.type === "agent/inbox/spliced" && kind === "user") ||
    (["tool/result", "tool/recovery-outcome"].includes(event.type) && kind === "tool-result") ||
    (event.type === "surface/replaced" && event.surface?.kind === "replace");
  if (!eligible) invalid(`Event ${event.type} cannot publish a ${kind} Surface node.`);
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalid(message: string): never {
  throw new SessionError("INVALID_EVENT", message);
}
