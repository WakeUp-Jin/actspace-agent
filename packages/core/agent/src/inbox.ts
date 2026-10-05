import { randomUUID } from "node:crypto";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionHandle } from "@actspace/session-persistence";

export type InboxTarget = "next-step" | "next-turn";
/** 读侧保留旧 journal 的 steer/next-turn；新写入仅用于后台任务通知。 */
export type InboxSource = "task_notification" | "steer";
export type InboxItem = { readonly messageId: string; readonly target: InboxTarget; readonly content: RuntimeV2JsonValue; readonly enqueuedSeq: number; readonly source?: InboxSource };

export class MainAgentInbox {
  constructor(private readonly session: SessionHandle) {}
  async enqueue(content: RuntimeV2JsonValue): Promise<InboxItem> {
    const messageId = randomUUID();
    const target = "next-step";
    const source = "task_notification";
    const event = await this.session.append(core("agent/inbox/spliced", { operation: "enqueue", messageId, target, content, source }));
    return Object.freeze({ messageId, target, content, enqueuedSeq: event.seq, source });
  }
  pending(): readonly InboxItem[] {
    const pending = new Map<string, InboxItem>();
    for (const event of this.session.journal.events) {
      const data = record(event.data); const messageId = text(data.messageId); const target = data.target;
      if (messageId === null || (target !== "next-step" && target !== "next-turn")) continue;
      if (event.type === "agent/inbox/spliced" && data.operation === "enqueue") {
        const source = inboxSource(data.source);
        pending.set(messageId, { messageId, target, content: data.content ?? null, enqueuedSeq: event.seq, ...(source === undefined ? {} : { source }) });
      }
      if (event.type === "agent/inbox/spliced" && (data.operation === "claim" || data.operation === "discard")) pending.delete(messageId);
    }
    return Object.freeze([...pending.values()].sort((a, b) => a.enqueuedSeq - b.enqueuedSeq));
  }
  async claim(): Promise<readonly InboxItem[]> {
    const items = this.pending().filter((item) => item.target === "next-step" && item.source !== "steer");
    for (const item of items) {
      await this.session.append(core("agent/inbox/spliced", { operation: "claim", messageId: item.messageId, target: item.target, ...(item.source === undefined ? {} : { source: item.source }) }, {
        surface: { kind: "append", node: { kind: "user", messageId: item.messageId, content: item.content } },
        provenance: { sourceEventSeqs: [item.enqueuedSeq], contributorIds: ["core/inbox"], runtimeSelectionSeq: null },
      }));
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
function inboxSource(value: RuntimeV2JsonValue | undefined): InboxSource | undefined { return value === "task_notification" || value === "steer" ? value : undefined; }
