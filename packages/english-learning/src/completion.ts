import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function completedMessage(events: readonly SessionEventEnvelopeV1[], end: SessionEventEnvelopeV1): { messageId: string; stepId: string; text: string } | null {
  const terminal = record(end.data);
  if (end.type !== "turn/end" || terminal.reason !== "completed" || typeof terminal.turnId !== "string") return null;
  const event = [...events].reverse().find((item) => item.seq < end.seq && item.type === "assistant/message" && record(item.data).turnId === terminal.turnId);
  if (!event) return null;
  const data = record(event.data);
  if (typeof data.messageId !== "string" || typeof data.stepId !== "string" || ["aborted", "failed", "tool_calls"].includes(String(data.finishReason))) return null;
  const blocks = Array.isArray(data.content) ? data.content : [];
  if (blocks.some((block) => ["tool-call", "tool_call", "tool_use"].includes(String(record(block).type)))) return null;
  const text = typeof data.content === "string" ? data.content : blocks.flatMap((block) => {
    const value = record(block);
    return value.type === "text" && typeof value.text === "string" ? [value.text] : [];
  }).join("\n\n");
  return { messageId: data.messageId, stepId: data.stepId, text };
}
