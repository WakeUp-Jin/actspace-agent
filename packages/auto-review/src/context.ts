import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
/** Use original messages even after compaction. Never send raw ordinary tool output or reasoning. */
export function reviewConversation(events: Iterable<SessionEventEnvelopeV1>): unknown[] {
  const messages: unknown[] = [], calls: unknown[] = [];
  const approvals = new Map<string, unknown>();
  let size = 0, users = 0;
  for (const event of events) {
    const node = event.surface?.kind === "append" ? event.surface.node : undefined;
    if (node && (event.type === "user/message" || event.type === "assistant/message")) {
      const content = typeof node.content === "string" ? node.content : Array.isArray(node.content) ? node.content.filter(b => b && typeof b === "object" && !Array.isArray(b) && b.type === "text") : node.content;
      const message = { seq: event.seq, role: event.type === "user/message" ? "user" : "assistant", content };
      size += JSON.stringify(message).length;
      if (size > 64_000) throw new Error("Original authorization context exceeds limit");
      messages.push(message);
      if (event.type === "user/message") users++;
    }
    if (event.type === "permission/asked") {
      const data = event.data as Record<string, unknown>;
      if (typeof data.requestId === "string") approvals.set(data.requestId, data.callId);
    }
    if (event.type === "permission/decided") {
      const data = event.data as Record<string, unknown>;
      if (typeof data.requestId === "string" && approvals.has(data.requestId)) {
        calls.push({ seq: event.seq, type: "human-tool-decision", callId: approvals.get(data.requestId), decision: data.kind, code: data.code });
        approvals.delete(data.requestId);
        if (calls.length > 24) calls.shift();
      }
    }
    if (event.type === "tool/call" || event.type === "tool/result") {
      const data = event.data as Record<string, unknown>;
      calls.push(event.type === "tool/call" ? { seq: event.seq, type: "call", callId: data.callId, name: data.name, args: data.args } : { seq: event.seq, type: "result", callId: data.callId, status: data.status });
      if (calls.length > 24) calls.shift();
    }
  }
  if (!users) throw new Error("Original user authorization unavailable");
  return [...messages, ...calls];
}
