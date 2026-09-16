import { randomUUID } from "node:crypto";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionHandle } from "@actspace/session-persistence";

export type InboxTarget = "next-step" | "next-turn";
export type InboxSource = "task_notification";
export type InboxItem = { readonly messageId: string; readonly target: InboxTarget; readonly content: RuntimeV2JsonValue; readonly enqueuedSeq: number; readonly source?: InboxSource };
export type InboxClaimOptions = { readonly materializeSurface?: boolean; readonly messageId?: string };

export class MainAgentInbox {
  constructor(private readonly session: SessionHandle) {}
  async enqueue(content: RuntimeV2JsonValue, target: InboxTarget, messageId: string = randomUUID(), source?: InboxSource): Promise<InboxItem> {
    const event = await this.session.append(core("agent/inbox/spliced", { operation: "enqueue", messageId, target, content, ...(source === undefined ? {} : { source }) }));
    return Object.freeze({ messageId, target, content, enqueuedSeq: event.seq, ...(source === undefined ? {} : { source }) });
  }
  pending(): readonly InboxItem[] {
    const pending = new Map<string, InboxItem>();
    for (const event of this.session.journal.events) {
      const data = record(event.data); const messageId = text(data.messageId); const target = data.target;
      if (messageId === null || (target !== "next-step" && target !== "next-turn")) continue;
      if (event.type === "agent/inbox/spliced" && data.operation === "enqueue") {
        const source = data.source === "task_notification" ? "task_notification" as const : undefined;
        pending.set(messageId, { messageId, target, content: data.content ?? null, enqueuedSeq: event.seq, ...(source === undefined ? {} : { source }) });
      }
      if (event.type === "agent/inbox/spliced" && (data.operation === "claim" || data.operation === "discard")) pending.delete(messageId);
    }
    return Object.freeze([...pending.values()].sort((a, b) => a.enqueuedSeq - b.enqueuedSeq));
  }
  async claim(target: InboxTarget, limit = target === "next-turn" ? 1 : Number.POSITIVE_INFINITY, options: InboxClaimOptions = {}): Promise<readonly InboxItem[]> {
    const items = this.pending().filter((item) => item.target === target && (options.messageId === undefined || item.messageId === options.messageId)).slice(0, limit);
    for (const item of items) {
      const surface = options.materializeSurface === false ? {} : { surface: { kind: "append", node: { kind: "user", messageId: item.messageId, content: item.content } }, provenance: { sourceEventSeqs: [item.enqueuedSeq], contributorIds: ["core/inbox"], runtimeSelectionSeq: null } };
      await this.session.append(core("agent/inbox/spliced", { operation: "claim", messageId: item.messageId, target, ...(item.source === undefined ? {} : { source: item.source }) }, surface));
    }
    return Object.freeze(items);
  }
  async discard(messageId: string, reason = "cancelled"): Promise<boolean> {
    const item = this.pending().find((candidate) => candidate.messageId === messageId); if (item === undefined) return false;
    await this.session.append(core("agent/inbox/spliced", { operation: "discard", messageId, target: item.target, reason })); return true;
  }
  async discardAll(reason: string): Promise<void> { for (const item of this.pending()) await this.discard(item.messageId, reason); }
}

function core(type: string, data: RuntimeV2JsonValue, extra: Record<string, unknown> = {}) { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null, ...extra } as never; }
function record(value: RuntimeV2JsonValue): Readonly<Record<string, RuntimeV2JsonValue>> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {}; }
function text(value: RuntimeV2JsonValue | undefined): string | null { return typeof value === "string" ? value : null; }
