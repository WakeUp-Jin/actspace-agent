import type { SessionEventCandidateV1, SessionEventEnvelopeV1, SessionSurfaceView } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ContextRequest, ContextSupplement } from "./types.js";
import { CONTEXT_OWNER, SUPPLEMENT_EVENT, type SupplementOperation } from "./codec.js";

export interface ContextSession {
  readonly header: { readonly sessionId: string };
  readonly lastSeq: number;
  readonly journal: { readonly events: readonly SessionEventEnvelopeV1[]; readonly surface: SessionSurfaceView };
  append(event: SessionEventCandidateV1): Promise<SessionEventEnvelopeV1>;
  flush(throughSeq?: number): Promise<unknown>;
}
type Stored = Extract<SupplementOperation, { op: "add" }> & { readonly sourceEventSeq: number; binding?: { requestId: string; stepId: string } };

function project(events: readonly SessionEventEnvelopeV1[]): Stored[] {
  let values: Stored[] = [];
  for (const event of events) {
    if (event.type !== SUPPLEMENT_EVENT) continue;
    const data = event.data as unknown as SupplementOperation;
    if (data.op === "add") values.push({ ...data, sourceEventSeq: event.seq });
    if (data.op === "remove") values = values.filter(value => value.id !== data.id || value.owner !== data.owner);
    if (data.op === "bind") for (const value of values) if (value.id === data.id && value.owner === data.owner && value.lifetime === "request") value.binding = { requestId: data.requestId, stepId: data.stepId };
  }
  return values;
}
function retained(value: Stored, session: ContextSession): boolean {
  if (value.afterEventSeq === -1) return session.journal.surface.entries.length === 0;
  const original = session.journal.events.find(event => event.seq === value.afterEventSeq)?.surface?.node;
  return Boolean(original && session.journal.surface.entries.some(entry => entry.node.messageId === original.messageId && entry.sourceEventSeqs.includes(value.afterEventSeq)));
}
function available(value: Stored, request: ContextRequest): boolean {
  if (value.lifetime === "persistent") return true;
  if (value.turnId !== request.turnId) return false;
  return value.lifetime !== "request" || value.binding === undefined || value.binding.stepId === request.stepId;
}

export class ContextSupplements {
  constructor(private readonly session: ContextSession) {}

  async put(input: Extract<SupplementOperation, { op: "add" }>): Promise<void> {
    const latest = project(this.session.journal.events).filter(value => value.id === input.id && value.owner === input.owner).at(-1);
    if (latest && latest.text === input.text && latest.lifetime === input.lifetime && latest.turnId === input.turnId && retained(latest, this.session)) return;
    await this.append(input);
  }
  async remove(owner: string, id: string): Promise<void> {
    if (!project(this.session.journal.events).some(value => value.id === id && value.owner === owner)) return;
    await this.append({ op: "remove", owner, id });
  }
  /** Reanchor only the latest surviving persistent version after a Surface replacement. */
  async refresh(owners: ReadonlySet<string>): Promise<void> {
    const latest = new Map<string, Stored>();
    for (const value of project(this.session.journal.events)) latest.set(`${value.owner}\0${value.id}`, value);
    for (const value of latest.values()) if (value.lifetime === "persistent" && owners.has(value.owner) && !retained(value, this.session)) {
      await this.append({ op: "add", id: value.id, owner: value.owner, text: value.text, lifetime: "persistent", afterEventSeq: this.tailAnchor() });
    }
  }
  get(request: ContextRequest, owners: ReadonlySet<string>): readonly ContextSupplement[] {
    return project(this.session.journal.events).filter(value => owners.has(value.owner) && available(value, request) && retained(value, this.session)).map(value => ({ id: value.id, owner: value.owner, sourceEventSeq: value.sourceEventSeq, afterEventSeq: value.afterEventSeq, text: value.text }));
  }
  /** Called only after prepare succeeds, before the existing dispatch checkpoint. */
  async bind(request: ContextRequest, visible?: readonly ContextSupplement[]): Promise<void> {
    if (!request.stepId) return;
    for (const value of project(this.session.journal.events)) if (value.lifetime === "request" && !value.binding && available(value, request) && (visible === undefined || visible.some(item => item.owner === value.owner && item.id === value.id))) {
      await this.append({ op: "bind", owner: value.owner, id: value.id, requestId: request.requestId, stepId: request.stepId });
    }
  }
  tailAnchor(): number {
    const last = this.session.journal.surface.entries.at(-1);
    if (!last) return -1;
    // Choose the actual append/replace event, never a shadowed source sequence.
    return this.session.journal.events.filter(event => event.surface?.node.messageId === last.node.messageId).at(-1)?.seq ?? -1;
  }
  private async append(data: SupplementOperation): Promise<void> {
    await this.session.append({ type: SUPPLEMENT_EVENT, eventVersion: 1, source: { ownerPluginId: CONTEXT_OWNER }, data: data as unknown as RuntimeV2JsonValue, surface: null });
  }
}
