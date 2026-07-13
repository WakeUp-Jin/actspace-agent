import {
  estimateMessagesTokens,
  type AssistantMessage,
  type CacheAuditCallMeta,
  type CacheAuditPreparedCall,
  type CacheAuditTracker,
  type CacheAuditUsageMetadata,
  type Context,
  type Message,
} from "@actspace/agent-core";
import type { ContextSnapshotArtifact } from "./types";

export class ContextSnapshotCollector implements CacheAuditTracker {
  private snapshots: ContextSnapshotArtifact[] = [];

  async beforeLlmCall(context: Context, meta: CacheAuditCallMeta): Promise<CacheAuditPreparedCall | null> {
    this.snapshots.push(createSnapshot({
      id: `pre-llm-turn-${meta.turnIndex}`,
      kind: "pre-llm",
      turnIndex: meta.turnIndex,
      callId: meta.callId,
      messages: context.messages,
      compacted: false,
    }));
    return null;
  }

  async afterLlmCall(
    _call: CacheAuditPreparedCall | null,
    _message: AssistantMessage,
  ): Promise<CacheAuditUsageMetadata | null> {
    return null;
  }

  capturePostCompaction(messages: Message[]): void {
    this.snapshots.push(createSnapshot({
      id: `post-compaction-${this.snapshots.length + 1}`,
      kind: "post-compaction",
      messages,
      compacted: true,
    }));
  }

  captureFinal(messages: Message[]): void {
    this.snapshots.push(createSnapshot({
      id: "final",
      kind: "final",
      messages,
      compacted: false,
    }));
  }

  getSnapshots(): ContextSnapshotArtifact[] {
    return this.snapshots.map((snapshot) => ({ ...snapshot, messages: cloneMessages(snapshot.messages) }));
  }
}

function createSnapshot(input: {
  id: string;
  kind: ContextSnapshotArtifact["kind"];
  turnIndex?: number;
  callId?: string;
  messages: Message[];
  compacted: boolean;
}): ContextSnapshotArtifact {
  const messages = cloneMessages(input.messages);
  return {
    id: input.id,
    kind: input.kind,
    ...(input.turnIndex === undefined ? {} : { turnIndex: input.turnIndex }),
    ...(input.callId === undefined ? {} : { callId: input.callId }),
    messageCount: messages.length,
    tokenEstimate: estimateMessagesTokens(messages),
    compacted: input.compacted,
    toolCallIds: extractToolCallIds(messages),
    messages,
  };
}

function cloneMessages(messages: Message[]): Message[] {
  return JSON.parse(JSON.stringify(messages)) as Message[];
}

function extractToolCallIds(messages: Message[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    if ("toolCallId" in message && typeof message.toolCallId === "string") ids.add(message.toolCallId);
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === "toolCall" && typeof content.id === "string") ids.add(content.id);
      }
    }
  }
  return [...ids];
}
