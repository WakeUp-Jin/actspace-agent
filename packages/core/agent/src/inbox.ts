import { randomUUID } from "node:crypto";
import { INBOX_WAKE_SOURCES, isInboxSource, type InboxSourceId, type RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionHandle } from "@actspace/session-persistence";

export type InboxTarget = "next-step" | "next-turn";
/** 读侧保留旧 journal 的 steer/next-turn；新写入：后台 Bash 通知、子智能体完成通知、Agent 之间的消息。 */
export type InboxSource = InboxSourceId;
/** Who wrote an inbox item and, for `agent_message`, which agent sent it. */
export type InboxEnqueueOptions = { readonly source?: Exclude<InboxSource, "steer">; readonly senderId?: string };
/** Display metadata for a background task notification; the model reads only `content`. */
export type InboxNotice = { readonly taskId: string; readonly kind: string; readonly title: string; readonly status: string };
export type InboxItem = { readonly messageId: string; readonly target: InboxTarget; readonly content: RuntimeV2JsonValue; readonly enqueuedSeq: number; readonly source?: InboxSource; readonly senderId?: string; readonly notice?: InboxNotice };

const INBOX_STATE = Symbol("inbox-state");

export class MainAgentInbox {
  constructor(private readonly session: SessionHandle) {}
  async enqueue(content: RuntimeV2JsonValue, notice?: InboxNotice, options: InboxEnqueueOptions = {}): Promise<InboxItem> {
    const messageId = randomUUID();
    const target = "next-step";
    const source = options.source ?? "task_notification";
    if (source === "agent_message" && !options.senderId) throw new Error("agent_message inbox items need a senderId.");
    const sender: { senderId?: string } = options.senderId === undefined ? {} : { senderId: options.senderId };
    const event = await this.session.append(core("agent/inbox/spliced", { operation: "enqueue", messageId, target, content, source, ...sender, ...(notice === undefined ? {} : { notice }) }));
    return Object.freeze({ messageId, target, content, enqueuedSeq: event.seq, source, ...sender, ...(notice === undefined ? {} : { notice }) });
  }
  pending(): readonly InboxItem[] {
    const pending = this.session.journal.project(INBOX_STATE, () => new Map<string, InboxItem>(), (previous, event) => {
      if (event.type !== "agent/inbox/spliced") return previous;
      const data = record(event.data), messageId = text(data.messageId), target = data.target;
      if (messageId === null || (target !== "next-step" && target !== "next-turn")) return previous;
      const next = new Map(previous);
      if (data.operation === "enqueue") {
        const source = isInboxSource(data.source) ? data.source : undefined, notice = inboxNotice(data.notice), senderId = text(data.senderId);
        next.set(messageId, { messageId, target, content: data.content ?? null, enqueuedSeq: event.seq, ...(source === undefined ? {} : { source }), ...(senderId === null ? {} : { senderId }), ...(notice === undefined ? {} : { notice }) });
      }
      if (data.operation === "claim" || data.operation === "discard") next.delete(messageId);
      return next;
    });
    return Object.freeze([...pending.values()].sort((a, b) => a.enqueuedSeq - b.enqueuedSeq));
  }
  /** Undelivered notifications and agent messages keep a finished turn going and can wake an idle Session. */
  hasPendingNotifications(): boolean { return this.pending().some((item) => item.target === "next-step" && isWakeSource(item.source)); }
  /** `opensTurn` marks claims that are the first input of a Host wake turn. */
  async claim(options: { readonly opensTurn?: boolean } = {}): Promise<readonly InboxItem[]> {
    const items = this.pending().filter((item) => item.target === "next-step" && item.source !== "steer");
    for (const item of items) {
      await this.session.append(core("agent/inbox/spliced", { operation: "claim", messageId: item.messageId, target: item.target, ...(item.source === undefined ? {} : { source: item.source }), ...(item.senderId === undefined ? {} : { senderId: item.senderId }), ...(item.notice === undefined ? {} : { notice: item.notice }), ...(options.opensTurn ? { opensTurn: true } : {}), content: item.content }, {
        // claim 自带内容，只加载后半段日志时也能独立推出节点（agent-spec-surface-derived.md §8 第 2 条）。
        surface: { kind: "append" },
        provenance: { sourceEventSeqs: [item.enqueuedSeq], contributorIds: ["core/inbox"], runtimeSelectionSeq: null },
      }));
    }
    return Object.freeze(items);
  }
  async discard(messageId: string, reason = "cancelled"): Promise<boolean> {
    const item = this.pending().find((candidate) => candidate.messageId === messageId); if (item === undefined) return false;
    await this.session.append(core("agent/inbox/spliced", { operation: "discard", messageId, target: item.target, reason })); return true;
  }
  /** Notifications and agent messages survive an aborted or failed turn and reach the next Run. */
  async discardAll(reason: string): Promise<void> { for (const item of this.pending()) if (!isWakeSource(item.source)) await this.discard(item.messageId, reason); }
}

function core(type: string, data: RuntimeV2JsonValue, extra: Record<string, unknown> = {}) { return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null, ...extra } as never; }
function record(value: RuntimeV2JsonValue): Readonly<Record<string, RuntimeV2JsonValue>> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : {}; }
function text(value: RuntimeV2JsonValue | undefined): string | null { return typeof value === "string" ? value : null; }
function inboxNotice(value: RuntimeV2JsonValue | undefined): InboxNotice | undefined {
  const data = record(value ?? null), taskId = text(data.taskId), kind = text(data.kind), title = text(data.title), status = text(data.status);
  return taskId === null || kind === null || title === null || status === null ? undefined : { taskId, kind, title, status };
}
function isWakeSource(source: InboxSource | undefined): boolean { return source !== undefined && INBOX_WAKE_SOURCES.includes(source); }
