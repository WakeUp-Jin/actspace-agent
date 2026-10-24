import { completeAuxiliaryText, type AuxiliaryRequestRecorder, type LlmService } from "@actspace/llm-service";
import { REVIEW_POLICY } from "./prompt.js";
export type ReviewDecision = { readonly approved: boolean; readonly reason?: string | null };
export function parseReview(text: string): ReviewDecision {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid review object");
  const record = value as Record<string, unknown>;
  if (typeof record.approved !== "boolean" || Object.keys(record).some(key => key !== "approved" && key !== "reason") || record.reason != null && typeof record.reason !== "string") throw new Error("Invalid review decision");
  return { approved: record.approved, ...(record.reason == null ? {} : { reason: (record.reason as string).slice(0, 500) }) };
}
export interface AutoReviewer { review(input: { sessionId: string; agentRunId: string; turnId: string; stepId: string; callId: string; logicalRequestId: string; model: string; snapshot: unknown; signal: AbortSignal }): Promise<ReviewDecision> }
export function createAutoReviewer(llm: LlmService, recorder: AuxiliaryRequestRecorder): AutoReviewer {
  return { async review(input) {
    const content = JSON.stringify(input.snapshot);
    if (content.length > 96_000) throw new Error("Review context exceeds limit");
    const prepared = await llm.prepareAsync({ sessionId: input.sessionId, routeId: "auto-review", model: input.model, tools: [], messages: [{ role: "system", content: REVIEW_POLICY }, { role: "user", content }], signal: input.signal });
    const { text } = await completeAuxiliaryText(prepared, { recorder,
      owner: { sessionId: input.sessionId, agentRunId: input.agentRunId, turnId: input.turnId, stepId: input.stepId, callId: input.callId, purpose: "auto-review" },
      logicalRequestId: input.logicalRequestId, signal: input.signal, maxTextLength: 8_000,
    });
    return parseReview(text);
  } };
}
