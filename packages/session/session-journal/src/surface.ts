import { surfaceNode } from "@actspace/shared/runtime-v2";
import type { SessionEventEnvelopeV1, SessionSurfaceNodeV1 } from "./event-envelope.js";
import { SessionError } from "./errors.js";

export type SessionSurfaceEntry = {
  readonly node: SessionSurfaceNodeV1;
  readonly sourceEventSeqs: readonly number[];
  /** 替换条目（压缩摘要）所属的压缩 id；追加条目没有。记在这里是为了每次请求不必回头读 `surface/replaced` 事件。 */
  readonly compactionId?: string;
};

export type SessionSurfaceView = {
  readonly entries: readonly SessionSurfaceEntry[];
  readonly replaceGeneration: number;
};

export class SessionSurface {
  #entries: SessionSurfaceEntry[] = [];
  #replaceGeneration = 0;
  /** 当前状态的视图；对话没变时反复读到同一个对象，变了才换新的（下游可以按对象身份判断「没变」）。 */
  #view: SessionSurfaceView | undefined;

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
    // 节点从 data 推出，surface 只是标记（agent-spec-surface-derived.md §4.2）。
    const node = surfaceNode(event);
    if (node === null) invalid(`Event ${event.type} enters Surface but its data cannot derive a node.`);
    validateEligible(event, node.kind);
    if (operation.kind === "append") {
      this.#entries.push(createEntry(node, event));
      this.#view = undefined;
      return;
    }
    if (operation.end > this.#entries.length) invalid("Surface replacement span is outside the current Surface.");
    const shadowed = this.#entries.slice(operation.start, operation.end);
    const expected = uniqueSorted(shadowed.flatMap((entry) => entry.sourceEventSeqs));
    const supplied = uniqueSorted(operation.sourceEventSeqs);
    if (!sameNumbers(expected, supplied))
      invalid("Surface replacement must cite every shadowed source event and no unrelated event.");
    const replacement = createEntry(node, event, supplied, compactionIdOf(event) ?? node.messageId);
    this.#entries.splice(operation.start, operation.end - operation.start, replacement);
    this.#replaceGeneration += 1;
    this.#view = undefined;
  }

  get view(): SessionSurfaceView {
    this.#view ??= Object.freeze({
      entries: Object.freeze([...this.#entries]),
      replaceGeneration: this.#replaceGeneration,
    });
    return this.#view;
  }
}

function createEntry(
  node: SessionSurfaceNodeV1,
  event: SessionEventEnvelopeV1,
  additional: readonly number[] = [],
  compactionId?: string,
): SessionSurfaceEntry {
  return Object.freeze({
    node,
    sourceEventSeqs: Object.freeze(uniqueSorted([event.seq, ...event.provenance.sourceEventSeqs, ...additional])),
    ...(compactionId === undefined ? {} : { compactionId }),
  });
}

function compactionIdOf(event: SessionEventEnvelopeV1): string | undefined {
  const value = (event.data as { compactionId?: unknown }).compactionId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
