import type { LlmService } from "@actspace/llm-service";
import { REVIEW_POLICY } from "./prompt.js";
export type ReviewDecision = { readonly approved: boolean; readonly reason?: string | null };
export function parseReview(text: string): ReviewDecision {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid review object");
  const record = value as Record<string, unknown>;
  if (typeof record.approved !== "boolean" || Object.keys(record).some(key => key !== "approved" && key !== "reason") || record.reason != null && typeof record.reason !== "string") throw new Error("Invalid review decision");
  return { approved: record.approved, ...(record.reason == null ? {} : { reason: (record.reason as string).slice(0, 500) }) };
}
export interface AutoReviewer { review(input: { sessionId: string; callId: string; model: string; snapshot: unknown; signal: AbortSignal }): Promise<ReviewDecision> }
export function createAutoReviewer(llm: LlmService): AutoReviewer {
  return { async review(input) {
    const content = JSON.stringify(input.snapshot);
    if (content.length > 96_000) throw new Error("Review context exceeds limit");
    const prepared = await llm.prepareAsync({ requestId: `auto-review:${input.callId}`, sessionId: input.sessionId, routeId: "auto-review", model: input.model, tools: [], messages: [{ role: "system", content: REVIEW_POLICY }, { role: "user", content }], signal: input.signal });
    try {
      let text = "", done = false;
      for await (const event of await prepared.dispatch()) {
        if (event.type === "text-delta") text += event.text;
        if (event.type === "done") { done = true; if (!text) text = event.content.filter(b => b.type === "text").map(b => b.text).join(""); }
        if (text.length > 8_000 || event.type === "error" || event.type === "aborted") throw new Error("Review response failed");
      }
      if (!done) throw new Error("Incomplete review response");
      return parseReview(text);
    } finally { prepared.release(); }
  } };
}
