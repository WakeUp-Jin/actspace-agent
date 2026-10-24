import { randomUUID } from "node:crypto";
import { reviewConversation, type AutoReviewer } from "@actspace/auto-review";
import type { SessionHandle } from "@actspace/session-persistence";
import type { AutoReviewInput } from "@actspace/tools-runtime";

/** Billing facts from this review are expected; every other concurrent fact invalidates the snapshot. */
export async function reviewSessionAction(session: SessionHandle, reviewer: AutoReviewer, input: AutoReviewInput) {
  const events = [...session.journal.iterateEvents()];
  const call = [...events].reverse().find(event => event.type === "tool/call" && (event.data as Record<string, unknown>).callId === input.callId);
  const data = call?.data as Record<string, unknown> | undefined;
  if (!data || ["agentRunId", "turnId", "stepId"].some(key => typeof data[key] !== "string" || !data[key])) throw new Error("Review requires its owning tool call");
  const revision = session.journal.lastSeq;
  const logicalRequestId = randomUUID();
  const decision = await reviewer.review({ sessionId: session.header.sessionId, agentRunId: data.agentRunId as string, turnId: data.turnId as string, stepId: data.stepId as string, callId: input.callId, logicalRequestId, model: input.model ?? "default", signal: input.signal,
    snapshot: { conversation: reviewConversation(events), action: input.action, workspaceRoot: input.workspaceRoot, execution: "Existing executor; sandbox isolation is not guaranteed" },
  });
  for (const event of session.journal.iterateEvents()) {
    if (event.seq <= revision) continue;
    const fact = event.data as Record<string, unknown>;
    if ((event.type !== "llm/auxiliary-start" && event.type !== "llm/auxiliary-end") || fact.purpose !== "auto-review" || fact.logicalRequestId !== logicalRequestId || fact.sessionId !== session.header.sessionId || fact.callId !== input.callId || ["agentRunId", "turnId", "stepId"].some(key => fact[key] !== data[key])) throw new Error("Review context changed");
  }
  return decision;
}
